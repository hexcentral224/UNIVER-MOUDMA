// Protections de groupe UNIVER MOUDMA (base CENTRAL-HEX)
// Chaque protection est activée par groupe (commande : antilink on/off, etc.)
const { num, unwrap, typeOf, textOf } = require('../lib/util');
const cfg = require('./config');

const spamMap = new Map(); // "session|group|user" -> [timestamps]
const purgeMap = new Map(); // "session|group|author" -> { count, users, t }

const LINK_RE = /(https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/|t\.me\/)\S+/i;
const MARABOUT_RE = /(marabout|grand\s*ma[iî]tre|voyant|retour\s*(de\s*l')?affection|gris[\s-]?gris|envo[uû]tement|mystique|sacrifice|porte[\s-]?bonheur|multiplication\s*(de\s*)?(billets|argent)|chance\s*au\s*jeu|d[ée]senvo[uû]tement|puissance\s*sexuelle|pouvoirs?\s*occultes?)/i;


// Mots interdits : mise en forme pour détecter aussi "m3rde", "PUTAIN", "enculé"...
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[0]/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/[4@]/g, 'a').replace(/[5$]/g, 's').replace(/(.)\1+/g, '$1');
const esc = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DEFAULT_BADWORDS = ['merde', 'putain', 'connard', 'connasse', 'salope', 'encule', 'enculer', 'fdp', 'ntm', 'batard', 'pute', 'nique', 'niquer', 'bordel', 'trou du cul', 'fuck', 'shit', 'bitch', 'asshole'];
const hasBadword = (text, list) => {
  const t = ' ' + norm(text).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ') + ' ';
  return list.some(w => { const x = norm(w).trim(); return x && new RegExp(`(?<![a-z0-9])${esc(x)}(?![a-z0-9])`).test(t); });
};

function groupCfg(session, jid) {
  const g = session.data.groups;
  if (!g[jid]) g[jid] = {};
  return g[jid];
}

// Envoie un texte avec mentions
async function say(sock, jid, text, mentions = []) {
  try { await sock.sendMessage(jid, { text, mentions }); } catch {}
}
async function del(sock, msg, from, sender) {
  try {
    await sock.sendMessage(from, { delete: { remoteJid: from, fromMe: false, id: msg.key.id, participant: msg.key.participant || sender } });
  } catch {}
}
async function kick(sock, from, user) {
  try { await sock.groupParticipantsUpdate(from, [user], 'remove'); } catch {}
}

// Avertissements communs (3 = expulsion)
async function strike(ctx, reason) {
  const { sock, from, sender, session } = ctx;
  const g = groupCfg(session.store, from);
  g.warns = g.warns || {};
  const wk = num(sender);
  const n = (g.warns[wk] = (g.warns[wk] || 0) + 1);
  session.store.save();
  const tag = '@' + num(sender);
  if (n >= 3) {
    await say(sock, from, `⛔ *EXPULSION*\n${tag} a atteint 3 avertissements.\nMotif : ${reason}\n\n> ${cfg.BRAND} 🇬🇳`, [sender]);
    await kick(sock, from, sender);
    delete g.warns[wk];
    session.store.save();
  } else {
    await say(sock, from, `⚠️ *AVERTISSEMENT ${n}/3*\n${tag}, ${reason}\n\n> ${cfg.BRAND} 🇬🇳`, [sender]);
  }
}

/**
 * Retourne true si le message a été traité (supprimé) par une protection.
 * ctx = { sock, msg, from, sender, isGroup, isAdmin, isOwner, isBotAdmin, session, text }
 */
async function run(ctx) {
  const { sock, msg, from, sender, isGroup, isAdmin, isOwner, isBotAdmin, session, text } = ctx;
  if (!isGroup || msg.key.fromMe || isOwner || isAdmin) return false;
  const g = groupCfg(session.store, from);
  const m = unwrap(msg.message);
  const type = typeOf(m);

  // ── antistatus (logique fournie par le propriétaire) ──
  if (g.antistatus) {
    if (await handleAntiStatus(ctx, g)) return true;
  }

  if (!isBotAdmin) return false; // les autres protections nécessitent que le bot soit admin

  // Membre réduit au silence (commande mute)
  if (g.muted?.[num(sender)]) { await del(sock, msg, from, sender); return true; }
  // Anti-tag : message qui mentionne beaucoup de monde (tagall / hidetag d'un non-admin)
  if (g.antitag && (m[type]?.contextInfo?.mentionedJid || []).length >= 5) {
    await del(sock, msg, from, sender);
    await strike(ctx, 'les mentions de masse sont interdites.');
    return true;
  }
  // Anti-mots interdits
  if (g.antibadword && text && hasBadword(text, g.badwords || DEFAULT_BADWORDS)) {
    await del(sock, msg, from, sender);
    await strike(ctx, 'langage inapproprié.');
    return true;
  }
  if (g.antilink && LINK_RE.test(text)) {
    await del(sock, msg, from, sender);
    await strike(ctx, 'les liens sont interdits dans ce groupe.');
    return true;
  }
  if (g.antimarabout && MARABOUT_RE.test(text)) {
    await del(sock, msg, from, sender);
    await strike(ctx, 'les annonces de marabout / arnaques sont interdites.');
    return true;
  }
  if (g.antisticker && type === 'stickerMessage') {
    await del(sock, msg, from, sender);
    await strike(ctx, 'les stickers sont interdits dans ce groupe.');
    return true;
  }
  if (g.antibot) {
    const id = msg.key.id || '';
    // Les bots Baileys génèrent des identifiants commençant par BAE5 (ou 16 caractères hexadécimaux)
    if (id.startsWith('BAE5') || /^[A-F0-9]{16}$/.test(id) && !id.startsWith('3EB0')) {
      await del(sock, msg, from, sender);
      await say(sock, from, `🤖 *ANTIBOT*\n@${num(sender)} ressemble à un bot et a été expulsé.\n\n> ${cfg.BRAND} 🇬🇳`, [sender]);
      await kick(sock, from, sender);
      return true;
    }
  }
  if (g.antispam) {
    const k = `${session.id}|${from}|${sender}`;
    const now = Date.now();
    const arr = (spamMap.get(k) || []).filter(t => now - t < 6000);
    arr.push(now);
    spamMap.set(k, arr);
    if (arr.length >= 6) {
      spamMap.delete(k);
      await del(sock, msg, from, sender);
      await strike(ctx, 'arrête de spammer (trop de messages en peu de temps).');
      return true;
    }
    if (arr.length > 6) await del(sock, msg, from, sender);
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// ANTISTATUS — statut de groupe mentionné / partagé
// ─────────────────────────────────────────────────────────────
async function handleAntiStatus(ctx, g) {
  const { sock, from, sender, msg, isAdmin, isOwner } = ctx;
  if (isOwner || isAdmin) return false;
  if (!from.endsWith('@g.us')) return false;

  // WhatsApp change souvent le nom du champ (groupStatusMentionMessage, statusMentionMessage, …V2)
  // → détection générique : toute clé du message contenant "status".
  let isStatus = Object.keys(msg?.message || {}).some(k => /status/i.test(k));

  const c = msg?.message?.extendedTextMessage?.contextInfo ||
    msg?.message?.imageMessage?.contextInfo ||
    msg?.message?.videoMessage?.contextInfo;
  if (c?.isGroupStatus) isStatus = true;

  const t = msg?.message?.extendedTextMessage?.text || msg?.message?.conversation || '';
  if (t.toLowerCase().includes('mentionné') || t.toLowerCase().includes('groupe a été mentionné')) isStatus = true;

  if (!isStatus) return false;

  await del(sock, msg, from, sender);

  g.antistatusWarnings = g.antistatusWarnings || {};
  const key = `antistatus_${from}_${sender}`;
  const warnings = g.antistatusWarnings[key] || 0;
  const senderNum = num(sender);
  const save = () => ctx.session.store.save();

  if (warnings === 0) {
    g.antistatusWarnings[key] = 1; save();
    await say(sock, from, `🚫 *STATUT INTERDIT*\n\n@${senderNum}, votre statut a été supprimé.\n⚠️ *Avertissement 1/3*\n> ${cfg.BRAND} 🇬🇳`, [sender]);
  } else if (warnings === 1) {
    g.antistatusWarnings[key] = 2; save();
    await say(sock, from, `⚠️ *DERNIER AVERTISSEMENT*\n\n@${senderNum}, encore un statut et vous serez expulsé.\n☢️ *Avertissement 2/3*\n> ${cfg.BRAND} 🇬🇳`, [sender]);
  } else {
    g.antistatusWarnings[key] = 3; save();
    await say(sock, from, `⛔ *EXPULSION*\n\n@${senderNum} a été expulsé pour avoir partagé des statuts 3 fois.\n> ${cfg.BRAND} 🇬🇳`, [sender]);
    await kick(sock, from, sender);
    delete g.antistatusWarnings[key]; save();
  }
  return true;
}

// ─────────────────────────────────────────────────────────────
// ANTIPURGE — un admin qui retire ≥4 membres en 60 s est rétrogradé, les membres sont réajoutés
// ─────────────────────────────────────────────────────────────
async function antiPurge(session, ev) {
  const { sock } = session;
  if (ev.action !== 'remove' || !ev.author) return;
  const g = groupCfg(session.store, ev.id);
  if (!g.antipurge) return;
  const author = ev.author;
  const botNum = num(sock.user?.id);
  if (num(author) === botNum || cfg.SUDO.includes(num(author))) return;

  const k = `${session.id}|${ev.id}|${author}`;
  const now = Date.now();
  let rec = purgeMap.get(k);
  if (!rec || now - rec.t > 60000) rec = { count: 0, users: [], t: now };
  const users = ev.participants.map(p => (typeof p === 'string' ? p : p.id || p.phoneNumber));
  rec.count += users.length;
  rec.users.push(...users);
  purgeMap.set(k, rec);

  if (rec.count >= 4) {
    purgeMap.delete(k);
    try { await sock.groupParticipantsUpdate(ev.id, [author], 'demote'); } catch {}
    try { await sock.groupParticipantsUpdate(ev.id, rec.users, 'add'); } catch {}
    await say(sock, ev.id, `🛡️ *ANTIPURGE*\n@${num(author)} a tenté de purger le groupe : il est rétrogradé et les membres retirés sont réajoutés.\n\n> ${cfg.BRAND} 🇬🇳`, [author]);
  }
}

module.exports = { run, antiPurge, groupCfg, say, kick, hasBadword, DEFAULT_BADWORDS };
