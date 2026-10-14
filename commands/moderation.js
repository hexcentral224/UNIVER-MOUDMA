const { add } = require('../core/registry');
const protection = require('../core/protection');
const { num } = require('../lib/util');

const G = { group: true, admin: true, botAdmin: true };
const idsOf = p => [p.id, p.lid, p.phoneNumber].filter(Boolean).map(num);
const isAdminJid = (ctx, jid) => (ctx.meta?.participants || []).some(p => (p.admin === 'admin' || p.admin === 'superadmin') && idsOf(p).includes(num(jid)));
const gc = ctx => protection.groupCfg(ctx.store, ctx.from);

add({ name: 'warn', cat: 'moderation', desc: 'avertir un membre (3 avertissements = expulsion)', use: 'warn @membre [raison]', ...G, async run(ctx) {
  const t = ctx.target();
  if (!t) return ctx.reply('👉 Utilise : *warn @membre raison*');
  if (isAdminJid(ctx, t)) return ctx.reply('⚠️ On ne peut pas avertir un admin.');
  const g = gc(ctx);
  g.warns = g.warns || {};
  const k = num(t);
  const reason = ctx.args.filter(a => !a.startsWith('@')).join(' ').trim();
  const n = (g.warns[k] = (g.warns[k] || 0) + 1);
  if (n >= 3) {
    delete g.warns[k]; ctx.store.save();
    await ctx.reply(`⛔ @${k} a atteint *3/3* avertissements : expulsion.${reason ? `\nDernier motif : ${reason}` : ''}`, { mentions: [t] });
    await ctx.sock.groupParticipantsUpdate(ctx.from, [t], 'remove');
  } else {
    ctx.store.save();
    await ctx.reply(`⚠️ *AVERTISSEMENT ${n}/3*\n@${k}${reason ? `\nMotif : ${reason}` : ''}\n\n_À 3 avertissements, le membre est expulsé._`, { mentions: [t] });
  }
} });

add({ name: 'sanction', cat: 'moderation', desc: 'voir ou effacer les avertissements et sanctions', use: 'sanction  |  sanction @membre  |  sanction reset @membre', group: true, admin: true, async run(ctx) {
  const g = gc(ctx);
  const warns = g.warns || {}, muted = g.muted || {}, banned = g.banned || {};
  const sub = (ctx.args[0] || '').toLowerCase();

  if (sub === 'reset' || sub === 'effacer') {
    const t = ctx.target();
    if (!t) return ctx.reply('👉 Utilise : *sanction reset @membre*');
    const k = num(t);
    delete warns[k]; delete muted[k]; delete (g.antistatusWarnings || {})[`antistatus_${ctx.from}_${t}`];
    ctx.store.save();
    return ctx.reply(`🧽 Avertissements et silence de @${k} effacés.`, { mentions: [t] });
  }

  const t = ctx.mentioned[0] || ctx.quotedSender;
  if (t) {
    const k = num(t);
    return ctx.reply(`⚖️ *Sanctions de @${k}*\n\n⚠️ Avertissements : *${warns[k] || 0}/3*\n🔇 Muet : *${muted[k] ? 'oui' : 'non'}*\n🚫 Banni : *${banned[k] ? 'oui' : 'non'}*`, { mentions: [t] });
  }

  const w = Object.entries(warns).filter(([, n]) => n > 0);
  const m = Object.keys(muted), b = Object.keys(banned);
  if (!w.length && !m.length && !b.length) return ctx.reply('✅ Aucune sanction en cours dans ce groupe.');
  let txt = '⚖️ *SANCTIONS EN COURS*\n';
  if (w.length) txt += `\n⚠️ *Avertissements*\n${w.map(([k, n]) => `▫️ @${k} : ${n}/3`).join('\n')}\n`;
  if (m.length) txt += `\n🔇 *Muets*\n${m.map(k => `▫️ @${k}`).join('\n')}\n`;
  if (b.length) txt += `\n🚫 *Bannis*\n${b.map(k => `▫️ +${k}`).join('\n')}\n`;
  txt += '\n_Détail : *sanction @membre* • Effacer : *sanction reset @membre*_';
  await ctx.reply(txt, { mentions: [...w.map(([k]) => k + '@s.whatsapp.net'), ...m.map(k => k + '@s.whatsapp.net')] });
} });

add({ name: 'mute', cat: 'moderation', desc: 'réduire un membre au silence (ses messages sont supprimés)', use: 'mute @membre', ...G, async run(ctx) {
  const t = ctx.target();
  if (!t) return ctx.reply('👉 Utilise : *mute @membre*');
  if (isAdminJid(ctx, t)) return ctx.reply('⚠️ On ne peut pas réduire un admin au silence.');
  const g = gc(ctx); g.muted = g.muted || {};
  g.muted[num(t)] = true; ctx.store.save();
  await ctx.reply(`🔇 @${num(t)} est réduit au silence : ses messages seront supprimés.\nPour lui rendre la parole : *unmute @membre*`, { mentions: [t] });
} });

add({ name: 'unmute', cat: 'moderation', desc: 'rendre la parole à un membre', use: 'unmute @membre', group: true, admin: true, async run(ctx) {
  const t = ctx.target();
  if (!t) return ctx.reply('👉 Utilise : *unmute @membre*');
  const g = gc(ctx);
  if (!g.muted?.[num(t)]) return ctx.reply('ℹ️ Ce membre n\'est pas muet.');
  delete g.muted[num(t)]; ctx.store.save();
  await ctx.reply(`🔊 @${num(t)} peut de nouveau écrire.`, { mentions: [t] });
} });

add({ name: 'ban', cat: 'moderation', desc: 'bannir un membre (expulsé et retiré automatiquement s\'il revient)', use: 'ban @membre  |  ban liste  |  ban retirer @membre', ...G, async run(ctx) {
  const g = gc(ctx); g.banned = g.banned || {};
  const sub = (ctx.args[0] || '').toLowerCase();

  if (sub === 'liste' || sub === 'list') {
    const b = Object.keys(g.banned);
    return ctx.reply(b.length ? `🚫 *Membres bannis (${b.length})*\n\n${b.map(k => '▫️ +' + k).join('\n')}` : '✅ Aucun membre banni dans ce groupe.');
  }
  if (sub === 'retirer' || sub === 'unban') {
    const t = ctx.target();
    if (!t) return ctx.reply('👉 Utilise : *ban retirer @membre* (ou *ban retirer 224XXXXXXXXX*)');
    if (!g.banned[num(t)]) return ctx.reply('ℹ️ Ce numéro n\'est pas banni.');
    delete g.banned[num(t)]; ctx.store.save();
    return ctx.reply(`✅ +${num(t)} n'est plus banni.`);
  }

  const t = ctx.target();
  if (!t) return ctx.reply('👉 Utilise : *ban @membre*');
  if ([ctx.sock.user?.id, ctx.sock.user?.lid].filter(Boolean).map(num).includes(num(t))) return ctx.reply('😅 Je ne peux pas me bannir moi-même.');
  if (isAdminJid(ctx, t) && !ctx.isOwner) return ctx.reply('⚠️ Je ne bannis pas un admin. Retire-lui d\'abord son rôle avec *demote*.');
  g.banned[num(t)] = true; ctx.store.save();
  try { await ctx.sock.groupParticipantsUpdate(ctx.from, [t], 'remove'); } catch {}
  await ctx.reply(`🚫 @${num(t)} est *banni* du groupe.\nS'il revient, il sera retiré automatiquement.`, { mentions: [t] });
} });
