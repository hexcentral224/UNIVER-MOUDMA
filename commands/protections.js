const { add } = require('../core/registry');
const protection = require('../core/protection');

const state = v => (v ? '🟢 activé' : '🔴 désactivé');

// Protections simples : <nom> on / off  (par groupe)
const SIMPLE = [
  ['antilink', 'antilink', 'bloquer les liens', 'les liens sont supprimés et le membre reçoit un avertissement'],
  ['antibot', 'antibot', 'bloquer les autres bots', 'les bots détectés sont supprimés puis expulsés'],
  ['antimention', 'antistatus', 'bloquer les statuts qui mentionnent le groupe', 'les statuts qui mentionnent le groupe sont supprimés (3 avertissements = expulsion)'],
  ['antistiker', 'antisticker', 'bloquer les stickers', 'les stickers sont supprimés et le membre reçoit un avertissement'],
  ['antitag', 'antitag', 'bloquer les mentions de masse', 'les messages de non-admins qui mentionnent 5 personnes ou plus sont supprimés']
];

for (const [name, key, desc, effect] of SIMPLE) {
  add({ name, alias: name === 'antistiker' ? ['antisticker'] : [], cat: 'protection', desc, use: `${name} on | off`, group: true, admin: true, async run(ctx) {
    const g = protection.groupCfg(ctx.store, ctx.from);
    const v = (ctx.args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(v)) return ctx.reply(`🛡️ *${name}* : ${state(g[key])}\n\n_${effect}._\n\n*${name} on* : activer\n*${name} off* : désactiver`);
    g[key] = v === 'on'; ctx.store.save();
    await ctx.reply(`${v === 'on' ? '🟢' : '🔴'} *${name}* ${v === 'on' ? 'activé' : 'désactivé'}.${v === 'on' && !ctx.isBotAdmin ? '\n⚠️ Le bot doit être *admin* du groupe pour agir.' : ''}`);
  } });
}

// antibadword : liste de mots modifiable
add({ name: 'antibadword', cat: 'protection', desc: 'bloquer les insultes et mots interdits', use: 'antibadword on | off | add mot | del mot | liste | reset', group: true, admin: true, async run(ctx) {
  const g = protection.groupCfg(ctx.store, ctx.from);
  const sub = (ctx.args[0] || '').toLowerCase();
  const words = () => (g.badwords = g.badwords || [...protection.DEFAULT_BADWORDS]);

  if (sub === 'on' || sub === 'off') {
    g.antibadword = sub === 'on'; ctx.store.save();
    return ctx.reply(`${sub === 'on' ? '🟢' : '🔴'} *antibadword* ${sub === 'on' ? 'activé' : 'désactivé'}.${sub === 'on' && !ctx.isBotAdmin ? '\n⚠️ Le bot doit être *admin* du groupe pour agir.' : ''}`);
  }
  if (sub === 'add' || sub === 'ajouter') {
    const w = ctx.args.slice(1).join(' ').trim().toLowerCase();
    if (!w) return ctx.reply('👉 Utilise : *antibadword add mot*');
    if (words().includes(w)) return ctx.reply('ℹ️ Ce mot est déjà dans la liste.');
    words().push(w); ctx.store.save();
    return ctx.reply(`✅ « ${w} » ajouté (${words().length} mots).`);
  }
  if (sub === 'del' || sub === 'retirer' || sub === 'supprimer') {
    const w = ctx.args.slice(1).join(' ').trim().toLowerCase();
    if (!w || !words().includes(w)) return ctx.reply('❌ Ce mot n\'est pas dans la liste. Voir : *antibadword liste*');
    g.badwords = words().filter(x => x !== w); ctx.store.save();
    return ctx.reply(`✅ « ${w} » retiré (${g.badwords.length} mots).`);
  }
  if (sub === 'liste' || sub === 'list') {
    return ctx.reply(`📋 *Mots interdits (${words().length})*\n\n${words().join(', ')}`);
  }
  if (sub === 'reset') { g.badwords = [...protection.DEFAULT_BADWORDS]; ctx.store.save(); return ctx.reply('♻️ Liste remise à la version d\'origine.'); }
  await ctx.reply(`🛡️ *antibadword* : ${state(g.antibadword)}  •  ${words().length} mots\n\n*antibadword on* / *off*\n*antibadword add mot*\n*antibadword del mot*\n*antibadword liste*\n*antibadword reset*\n\n_Le message est supprimé et le membre reçoit un avertissement (3 = expulsion)._`);
} });

// anticall : propriétaire
add({ name: 'anticall', cat: 'protection', desc: 'refuser automatiquement les appels', use: 'anticall on | off | block', owner: true, async run(ctx) {
  const v = (ctx.args[0] || '').toLowerCase();
  const cur = ctx.store.data.anticall;
  if (!['on', 'off', 'block'].includes(v)) return ctx.reply(`📵 *anticall* : ${cur === 'block' ? '🟢 activé + blocage' : state(cur)}\n\n*anticall on* : refuse les appels\n*anticall block* : refuse et bloque l'appelant\n*anticall off* : désactiver`);
  ctx.store.data.anticall = v === 'off' ? null : v; ctx.store.save();
  await ctx.reply(v === 'off' ? '🔴 *anticall* désactivé.' : `🟢 *anticall* activé${v === 'block' ? ' (les appelants seront aussi bloqués)' : ''}.\nTes contacts propriétaires ne sont pas concernés.`);
} });
