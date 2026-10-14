const { add, get, all } = require('../core/registry');
const cfg = require('../core/config');

function access(c) {
  const a = [];
  if (c.owner) a.push('👑 propriétaire du bot');
  else if (c.admin) a.push('🛡️ admins du groupe');
  else a.push('👥 tout le monde');
  if (c.group) a.push('dans un groupe');
  if (c.botAdmin) a.push('le bot doit être admin');
  return a.join(' · ');
}

add({ name: 'help', cat: 'general', desc: 'aide sur le bot', use: 'help [commande]', async run(ctx) {
  const p = ctx.p;
  const name = (ctx.args[0] || '').toLowerCase().replace(/^[.!\/#]/, '');
  if (!name) {
    return ctx.reply(`🆘 *AIDE — ${cfg.BOT_NAME}*\n\n` +
      `◈ Préfixe : *[ ${p} ]* — écris par exemple *${p}menu*\n` +
      `◈ *${p}help <commande>* explique une commande (ex : *${p}help kick*)\n` +
      `◈ Commandes de groupe : le bot doit être *admin*\n` +
      `◈ Réponds à un message ou à un membre pour viser la bonne cible\n` +
      `◈ Protections : *${p}antilink on* / *${p}antilink off*\n` +
      `◈ Mode privé : seul le propriétaire utilise le bot (*${p}mode prive*)\n\n` +
      `👑 Propriétaire : ${cfg.OWNER.name}\n✦ Propulsé par ${cfg.BRAND}`);
  }
  const c = get(name);
  if (!c) {
    const near = all().map(x => x.name).filter(n => n.startsWith(name.slice(0, 2)) || n.includes(name)).slice(0, 6);
    return ctx.reply(`❓ Commande *${name}* introuvable.${near.length ? `\nTu voulais dire : ${near.map(n => '*' + p + n + '*').join(', ')} ?` : ''}\nÉcris *${p}menu* pour voir toutes les commandes.`);
  }
  await ctx.reply(`📖 *AIDE — ${p}${c.name}*\n\n📝 ${c.desc}\n\n⌨️ *Utilisation*\n${p}${c.use || c.name}\n\n🔐 *Accès* : ${access(c)}` +
    (c.alias?.length ? `\n🔁 *Alias* : ${c.alias.map(a => p + a).join(', ')}` : ''));
} });
