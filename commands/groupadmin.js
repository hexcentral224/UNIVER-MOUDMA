const { add } = require('../core/registry');
const cfg = require('../core/config');
const protection = require('../core/protection');
const { num } = require('../lib/util');

const jidOf = p => p.phoneNumber || p.id;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const idsOf = p => [p.id, p.lid, p.phoneNumber].filter(Boolean).map(num);
const isAdm = p => p.admin === 'admin' || p.admin === 'superadmin';
const botIds = ctx => [ctx.sock.user?.id, ctx.sock.user?.lid].filter(Boolean).map(num);
const G = { group: true, admin: true, botAdmin: true };

add({ name: 'open', cat: 'group', desc: 'ouvrir le groupe (tout le monde peut écrire)', use: 'open', ...G, async run(ctx) {
  await ctx.sock.groupSettingUpdate(ctx.from, 'not_announcement');
  await ctx.reply('🔓 *Groupe ouvert* : tout le monde peut écrire.');
} });

add({ name: 'close', cat: 'group', desc: 'fermer le groupe (seuls les admins écrivent)', use: 'close', ...G, async run(ctx) {
  await ctx.sock.groupSettingUpdate(ctx.from, 'announcement');
  await ctx.reply('🔒 *Groupe fermé* : seuls les admins peuvent écrire.');
} });

add({ name: 'kick', cat: 'group', desc: 'expulser un membre', use: 'kick @membre', ...G, async run(ctx) {
  const t = ctx.target();
  if (!t) return ctx.reply('👉 Mentionne le membre ou réponds à son message : *kick @membre*');
  if (botIds(ctx).includes(num(t))) return ctx.reply('😅 Je ne peux pas m\'expulser moi-même.');
  const p = (ctx.meta?.participants || []).find(x => idsOf(x).includes(num(t)));
  if (p && isAdm(p) && !ctx.isOwner) return ctx.reply('⚠️ Je n\'expulse pas un admin. Retire-lui d\'abord son rôle avec *demote*.');
  await ctx.sock.groupParticipantsUpdate(ctx.from, [t], 'remove');
  await ctx.reply(`👢 @${num(t)} a été expulsé.`, { mentions: [t] });
} });

add({ name: 'kickall', cat: 'group', desc: 'expulser tous les membres (sauf les admins)', use: 'kickall oui', ...G, async run(ctx) {
  const me = botIds(ctx);
  const targets = (ctx.meta?.participants || []).filter(p => !isAdm(p) && !idsOf(p).some(x => me.includes(x)) && !idsOf(p).includes(num(ctx.sender)));
  if (!targets.length) return ctx.reply('ℹ️ Aucun membre à expulser (il ne reste que des admins).');
  if ((ctx.args[0] || '').toLowerCase() !== 'oui') {
    return ctx.reply(`⚠️ *ATTENTION*\n\nCette commande expulse *${targets.length} membre(s)* (tous sauf les admins).\n\nPour confirmer, écris : *kickall oui*`);
  }
  await ctx.reply(`🧹 Expulsion de ${targets.length} membre(s) en cours…`);
  let done = 0;
  for (let i = 0; i < targets.length; i += 5) {
    const batch = targets.slice(i, i + 5).map(jidOf);
    try { await ctx.sock.groupParticipantsUpdate(ctx.from, batch, 'remove'); done += batch.length; } catch {}
    await sleep(1500);
  }
  await ctx.reply(`✅ *${done}/${targets.length}* membre(s) expulsé(s).`);
} });

add({ name: 'purge', cat: 'group', desc: 'retirer les membres qui n\'ont jamais écrit', use: 'purge  (puis)  purge oui', ...G, async run(ctx) {
  const g = protection.groupCfg(ctx.store, ctx.from);
  const counts = g.counts || {};
  const since = g.countSince || Date.now();
  const days = (Date.now() - since) / 86400000;
  const me = botIds(ctx);
  const inactive = (ctx.meta?.participants || []).filter(p => !isAdm(p) && !idsOf(p).some(x => me.includes(x)) && !idsOf(p).some(x => counts[x] > 0));
  if (days < 7) {
    return ctx.reply(`⏳ *Purge impossible pour le moment*\n\nLe bot compte les messages de ce groupe depuis *${days < 1 ? 'moins d\'un jour' : Math.floor(days) + ' jour(s)'}*. Pour ne pas retirer des membres actifs par erreur, attends au moins *7 jours* de comptage.`);
  }
  if (!inactive.length) return ctx.reply('✅ Tous les membres ont déjà écrit au moins un message depuis que le bot compte.');
  if ((ctx.args[0] || '').toLowerCase() !== 'oui') {
    const sample = inactive.slice(0, 15).map(p => `• @${num(jidOf(p))}`).join('\n');
    return ctx.reply(`🧹 *PURGE*\n\n*${inactive.length}* membre(s) n'ont écrit aucun message depuis *${Math.floor(days)} jours* :\n\n${sample}${inactive.length > 15 ? `\n… et ${inactive.length - 15} autre(s)` : ''}\n\nPour les retirer, écris : *purge oui*`, { mentions: inactive.slice(0, 15).map(jidOf) });
  }
  await ctx.reply(`🧹 Retrait de ${inactive.length} membre(s) inactif(s)…`);
  let done = 0;
  for (let i = 0; i < inactive.length; i += 5) {
    const batch = inactive.slice(i, i + 5).map(jidOf);
    try { await ctx.sock.groupParticipantsUpdate(ctx.from, batch, 'remove'); done += batch.length; } catch {}
    await sleep(1500);
  }
  await ctx.reply(`✅ *${done}/${inactive.length}* membre(s) inactif(s) retiré(s).`);
} });

for (const [name, action, label] of [['promote', 'promote', 'nommé admin 👑'], ['demote', 'demote', 'n\'est plus admin']]) {
  add({ name, cat: 'group', desc: name === 'promote' ? 'nommer un membre admin' : 'retirer le rôle d\'admin', use: `${name} @membre`, ...G, async run(ctx) {
    const t = ctx.target();
    if (!t) return ctx.reply(`👉 Mentionne le membre ou réponds à son message : *${name} @membre*`);
    const p = (ctx.meta?.participants || []).find(x => idsOf(x).includes(num(t)));
    if (name === 'promote' && p && isAdm(p)) return ctx.reply('ℹ️ Ce membre est déjà admin.');
    if (name === 'demote' && p && !isAdm(p)) return ctx.reply('ℹ️ Ce membre n\'est pas admin.');
    await ctx.sock.groupParticipantsUpdate(ctx.from, [t], action);
    await ctx.reply(`✅ @${num(t)} ${label}`, { mentions: [t] });
  } });
}

add({ name: 'link', cat: 'group', desc: 'lien d\'invitation du groupe', use: 'link', ...G, async run(ctx) {
  const code = await ctx.sock.groupInviteCode(ctx.from);
  await ctx.reply(`🔗 *Lien du groupe*\n*${ctx.meta?.subject || ''}*\n\nhttps://chat.whatsapp.com/${code}`);
} });

add({ name: 'approve', cat: 'group', desc: 'accepter les demandes d\'adhésion au groupe', use: 'approve  |  approve liste  |  approve refuser', group: true, admin: true, botAdmin: true, async run(ctx) {
  let list = [];
  try { list = await ctx.sock.groupRequestParticipantsList(ctx.from); } catch { return ctx.reply('❌ Impossible de lire les demandes (le groupe doit avoir l\'approbation des nouveaux membres activée).'); }
  if (!list?.length) return ctx.reply('📭 Aucune demande d\'adhésion en attente.');
  const jids = list.map(x => x.jid || x.phone_number || x.id).filter(Boolean);
  const sub = (ctx.args[0] || '').toLowerCase();
  if (sub === 'liste' || sub === 'list') {
    return ctx.reply(`📋 *${jids.length} demande(s) en attente*\n\n${jids.slice(0, 30).map(j => '• +' + num(j)).join('\n')}${jids.length > 30 ? `\n… et ${jids.length - 30} autre(s)` : ''}\n\n*approve* : tout accepter\n*approve refuser* : tout refuser`);
  }
  const action = sub === 'refuser' || sub === 'reject' ? 'reject' : 'approve';
  let done = 0;
  for (let i = 0; i < jids.length; i += 10) {
    const batch = jids.slice(i, i + 10);
    try { await ctx.sock.groupRequestParticipantsUpdate(ctx.from, batch, action); done += batch.length; } catch {}
    await sleep(1000);
  }
  await ctx.reply(`${action === 'approve' ? '✅' : '🚫'} *${done}/${jids.length}* demande(s) ${action === 'approve' ? 'acceptée(s)' : 'refusée(s)'}.`);
} });

add({ name: 'totalmembres', alias: ['totalmembre'], cat: 'group', desc: 'nombre de membres du groupe', use: 'totalmembres', group: true, async run(ctx) {
  const ps = ctx.meta?.participants || [];
  const admins = ps.filter(isAdm).length;
  await ctx.reply(`👥 *${ctx.meta?.subject || 'Groupe'}*\n\n👤 Total : *${ps.length}* membres\n👑 Admins : *${admins}*\n🙂 Membres : *${ps.length - admins}*`);
} });

add({ name: 'staff', cat: 'general', desc: 'liste des admins du groupe', use: 'staff', group: true, async run(ctx) {
  const ps = ctx.meta?.participants || [];
  const owner = ps.filter(p => p.admin === 'superadmin');
  const admins = ps.filter(p => p.admin === 'admin');
  if (!owner.length && !admins.length) return ctx.reply('ℹ️ Aucun admin trouvé.');
  let t = `👑 *STAFF — ${ctx.meta?.subject || 'Groupe'}*\n`;
  if (owner.length) t += `\n🏆 *Fondateur*\n${owner.map(p => `▫️ @${num(jidOf(p))}`).join('\n')}\n`;
  if (admins.length) t += `\n🛡️ *Admins (${admins.length})*\n${admins.map(p => `▫️ @${num(jidOf(p))}`).join('\n')}\n`;
  await ctx.reply(t, { mentions: [...owner, ...admins].map(jidOf) });
} });

add({ name: 'clan', cat: 'group', desc: 'fiche complète du groupe', use: 'clan', group: true, async run(ctx) {
  const m = ctx.meta || {};
  const ps = m.participants || [];
  const admins = ps.filter(isAdm).length;
  const g = protection.groupCfg(ctx.store, ctx.from);
  const prot = ['antilink', 'antibadword', 'antibot', 'antistatus', 'antisticker', 'antitag'].filter(k => g[k]).length;
  const created = m.creation ? new Date(m.creation * 1000).toLocaleDateString('fr-FR', { timeZone: cfg.TZ, day: '2-digit', month: 'long', year: 'numeric' }) : 'inconnue';
  const t = `🏰 *${m.subject || 'Groupe'}*\n\n` +
    `📝 ${m.desc ? String(m.desc).slice(0, 400) : '_Aucune description_'}\n\n` +
    `👥 Membres : *${ps.length}*  •  👑 Admins : *${admins}*\n` +
    `🗓️ Créé le : *${created}*\n` +
    `💬 Messages : *${m.announce ? 'réservés aux admins 🔒' : 'ouverts à tous 🔓'}*\n` +
    `🛡️ Protections actives : *${prot}/6*`;
  let pp = null;
  try { pp = await ctx.sock.profilePictureUrl(ctx.from, 'image'); } catch {}
  if (pp) await ctx.send({ image: { url: pp }, caption: t }); else await ctx.reply(t);
} });

add({ name: 'gstatuts', alias: ['gstatus'], cat: 'group', desc: 'état des protections du groupe', use: 'gstatuts', group: true, async run(ctx) {
  const g = protection.groupCfg(ctx.store, ctx.from);
  const on = v => (v ? '🟢' : '🔴');
  await ctx.reply(`🛡️ *STATUT DU GROUPE*\n*${ctx.meta?.subject || ''}*\n\n💬 Groupe : *${ctx.meta?.announce ? 'fermé 🔒' : 'ouvert 🔓'}*\n🤖 Bot admin : *${ctx.isBotAdmin ? 'oui ✅' : 'non ❌'}*\n\n` +
    `${on(g.antilink)} antilink\n${on(g.antibadword)} antibadword\n${on(g.antibot)} antibot\n${on(g.antistatus)} antimention\n${on(g.antisticker)} antistiker\n${on(g.antitag)} antitag\n${on(ctx.store.data.antidelete)} antidelete\n${on(ctx.store.data.anticall)} anticall\n\n` +
    `🚫 Bannis : *${Object.keys(g.banned || {}).length}*  •  🔇 Muets : *${Object.keys(g.muted || {}).length}*`);
} });
