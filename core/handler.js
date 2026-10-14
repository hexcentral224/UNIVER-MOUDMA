// Traitement des messages entrants — UNIVER MOUDMA (basé sur CENTRAL-HEX), commandes avec préfixe
const cfg = require('./config');
const db = require('./db');
const registry = require('./registry');
const protection = require('./protection');
const antidelete = require('./antidelete');
const { num, unwrap, typeOf, textOf, pick, download } = require('../lib/util');

const metaCache = new Map(); // "session|group" -> { t, data }
const cooldown = new Map();

function attach(s) {
  if (!s.store) s.store = db.session(s.id);
  return s.store;
}

async function groupMeta(s, jid) {
  const k = s.id + '|' + jid;
  const c = metaCache.get(k);
  if (c && Date.now() - c.t < 60000) return c.data;
  try {
    const data = await s.sock.groupMetadata(jid);
    metaCache.set(k, { t: Date.now(), data });
    return data;
  } catch { return c?.data || null; }
}
const clearMeta = (sid, jid) => metaCache.delete(sid + '|' + jid);

// Tous les identifiants possibles d'un participant (numéro, LID, phoneNumber)
const ids = p => [p.id, p.lid, p.phoneNumber].filter(Boolean).map(num);

function roles(meta, s, sender) {
  const me = [s.sock.user?.id, s.sock.user?.lid].filter(Boolean).map(num);
  const who = [sender].filter(Boolean).map(num);
  let isAdmin = false, isBotAdmin = false;
  for (const p of meta?.participants || []) {
    const pid = ids(p);
    const adm = p.admin === 'admin' || p.admin === 'superadmin';
    if (adm && pid.some(x => who.includes(x))) isAdmin = true;
    if (adm && pid.some(x => me.includes(x))) isBotAdmin = true;
  }
  return { isAdmin, isBotAdmin };
}

// Cache des derniers messages (pour antidelete)
function remember(s, msg) {
  if (!msg.key?.id || !msg.message) return;
  s.cache.set(msg.key.id, msg);
  if (s.cache.size > 250) s.cache.delete(s.cache.keys().next().value);
}

async function handle(s, ev) {
  if (ev.type !== 'notify' && ev.type !== 'append') return;
  const store = attach(s);
  const sock = s.sock;

  for (const msg of ev.messages) {
    try {
      if (!msg.message || !msg.key?.remoteJid) continue;
      const from = msg.key.remoteJid;
      if (from === 'status@broadcast' || from.endsWith('@newsletter') || from.endsWith('@broadcast')) continue;
      if (ev.type === 'append' && !msg.key.fromMe) continue;

      remember(s, msg);
      if (await antidelete.revoke(s, msg)) continue;
      antidelete.store(s, msg); // sauvegarde (texte + médias) pour l'antidelete, sans bloquer les commandes

      const isGroup = from.endsWith('@g.us');
      const botNum = num(sock.user?.id);
      const sender = msg.key.fromMe
        ? sock.user.id.split(':')[0] + '@s.whatsapp.net'
        : (isGroup ? (msg.key.participantAlt || msg.key.participant || msg.participant) : (msg.key.remoteJidAlt || from));
      if (!sender) continue;

      const m = unwrap(msg.message);
      const text = textOf(m).trim();
      const gl = db.global();
      gl.data.messages++;

      const isOwner = msg.key.fromMe || num(sender) === botNum || cfg.SUDO.includes(num(sender));
      let meta = null, isAdmin = false, isBotAdmin = false;
      if (isGroup) {
        meta = await groupMeta(s, from);
        ({ isAdmin, isBotAdmin } = roles(meta, s, sender));
        // Compteur de messages (classement wcg / profile)
        const g = protection.groupCfg(store, from);
        g.counts = g.counts || {};
        g.countSince = g.countSince || Date.now();
        g.counts[num(sender)] = (g.counts[num(sender)] || 0) + 1;
        if (g.counts[num(sender)] % 10 === 0) store.save();
      }

      const ctx = buildCtx({ s, msg, m, from, sender, text, isGroup, isOwner, isAdmin, isBotAdmin, meta });

      // Protections (groupes)
      if (await protection.run(ctx)) continue;

      if (!text) continue;
      const prefix = store.data.prefix || cfg.PREFIX;
      if (!text.startsWith(prefix)) continue;
      const parts = text.slice(prefix.length).trim().split(/\s+/);
      const name = (parts.shift() || '').toLowerCase();
      if (!name) continue;
      const cmd = registry.get(name);
      if (!cmd) continue;
      if (db.global().data.banned.includes(s.id)) continue;
      if (isGroup && !isOwner && protection.groupCfg(store, from).banned?.[num(sender)]) continue; // membre banni

      // Mode privé : seul le propriétaire peut utiliser le bot
      if (store.data.mode === 'private' && !isOwner) continue;
      if (cmd.owner && !isOwner) { await ctx.reply('🔒 Commande réservée au propriétaire du bot.'); continue; }
      if (cmd.group && !isGroup) { await ctx.reply('👥 Cette commande fonctionne uniquement dans un groupe.'); continue; }
      if (cmd.admin && !(isAdmin || isOwner)) { await ctx.reply('👑 Commande réservée aux admins du groupe.'); continue; }
      if (cmd.botAdmin && !isBotAdmin) { await ctx.reply('⚠️ Je dois être admin du groupe pour faire ça.'); continue; }

      // Anti-flood par utilisateur (1,2 s)
      const ck = s.id + '|' + num(sender);
      if (Date.now() - (cooldown.get(ck) || 0) < 1200 && !isOwner) continue;
      cooldown.set(ck, Date.now());
      if (cooldown.size > 2000) cooldown.clear();

      ctx.args = parts;
      ctx.q = parts.join(' ');
      ctx.cmd = name;
      gl.data.commands++;
      gl.save();
      if (!cmd.silent) await ctx.react('⏳');
      try {
        await cmd.run(ctx);
        if (!cmd.silent) await ctx.react('✅');
      } catch (e) {
        console.error(`[${s.id}] ${name}:`, e.message);
        if (cmd.silent) continue;
        await ctx.react('❌');
        await ctx.reply(`❌ Erreur sur *${name}* : ${String(e.message || e).slice(0, 180)}`);
      }
    } catch (e) {
      console.error(`[${s.id}] handler:`, e.message);
    }
  }
}

function buildCtx(b) {
  const { s, msg, m, from, sender, text, isGroup, isOwner, isAdmin, isBotAdmin, meta } = b;
  const sock = s.sock;
  const ctxInfo = m[typeOf(m)]?.contextInfo || {};
  const quoted = ctxInfo.quotedMessage ? unwrap(ctxInfo.quotedMessage) : null;
  const quotedSender = ctxInfo.participant || null;
  const mentioned = ctxInfo.mentionedJid || [];
  return {
    s, session: s, sock, msg, m, from, sender, text, isGroup, isOwner, isAdmin, isBotAdmin, meta,
    quoted, quotedSender, mentioned, quotedRaw: ctxInfo.quotedMessage || null, ctxInfo,
    store: s.store, pushName: msg.pushName || 'Utilisateur',
    args: [], q: '', cmd: '',
    reply: (t, extra = {}) => sock.sendMessage(from, { text: registry.prefixize(t, s.store.data.prefix || cfg.PREFIX), ...extra }, { quoted: msg }),
    send: (content, opts = {}) => {
      const p = s.store.data.prefix || cfg.PREFIX;
      if (content && typeof content.caption === 'string') content = { ...content, caption: registry.prefixize(content.caption, p) };
      if (content && typeof content.text === 'string') content = { ...content, text: registry.prefixize(content.text, p) };
      return sock.sendMessage(from, content, { quoted: msg, ...opts });
    },
    react: async e => { try { await sock.sendMessage(from, { react: { text: e, key: msg.key } }); } catch {} },
    // Cible d'une commande : mention > réponse > numéro écrit
    target() {
      if (mentioned[0]) return mentioned[0];
      if (quotedSender) return quotedSender;
      const n = (this.args.join('').match(/\d{8,15}/) || [])[0];
      return n ? n + '@s.whatsapp.net' : null;
    },
    p: s.store.data.prefix || cfg.PREFIX
  };
}

// Arrivée dans un groupe : les membres bannis sont expulsés automatiquement
async function onGroup(s, ev) {
  const store = attach(s);
  clearMeta(s.id, ev.id);
  await protection.antiPurge(s, ev);
  if (ev.action !== 'add') return;
  const g = protection.groupCfg(store, ev.id);
  const users = ev.participants.map(p => (typeof p === 'string' ? p : p.phoneNumber || p.id));
  for (const u of users) {
    if (g.banned?.[num(u)]) {
      try {
        await s.sock.groupParticipantsUpdate(ev.id, [u], 'remove');
        await s.sock.sendMessage(ev.id, { text: `🚫 @${num(u)} est banni de ce groupe et a été retiré.`, mentions: [u] });
      } catch {}
    }
  }
}

// Anti-appel : refuse les appels (et bloque l'appelant en mode « block »)
async function onCall(s, calls) {
  const store = attach(s);
  const mode = store.data.anticall;
  if (!mode) return;
  for (const c of calls) {
    if (c.status !== 'offer') continue;
    const caller = c.callerPn || c.from;
    const n = num(caller);
    if (n === num(s.sock.user.id) || cfg.SUDO.includes(n)) continue;
    try { await s.sock.rejectCall(c.id, c.from); } catch {}
    try { await s.sock.sendMessage(caller, { text: `📵 *Appel refusé*\n\nCe numéro ne prend pas les appels. Envoie un message écrit.\n\n> ${cfg.BRAND} 🇬🇳` }); } catch {}
    if (mode === 'block') { try { await s.sock.updateBlockStatus(caller, 'block'); } catch {} }
  }
}

module.exports = { handle, onGroup, onCall, groupMeta, clearMeta };
