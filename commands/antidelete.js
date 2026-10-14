const { add } = require('../core/registry');

// Les messages supprimés (groupes + privé) sont envoyés en privé au propriétaire du bot.
add({ name: 'antidelete', cat: 'protection', desc: 'récupérer les messages supprimés', use: 'antidelete on | off', owner: true, async run(ctx) {
  const v = (ctx.args[0] || '').toLowerCase();
  const cur = !!ctx.store.data.antidelete;
  if (!v) return ctx.reply(`🗑️ *ANTIDELETE*\n\nStatut : ${cur ? '🟢 activé' : '🔴 désactivé'}\n\n*antidelete on* : activer\n*antidelete off* : désactiver\n\n_Quand quelqu'un supprime un message, tu reçois en privé le message d'origine (texte, photo, vidéo, audio, sticker, document)._`);
  if (v !== 'on' && v !== 'off') return ctx.reply('❌ Utilise : *antidelete on* ou *antidelete off*');
  ctx.store.data.antidelete = v === 'on'; ctx.store.save();
  await ctx.reply(`🗑️ *Antidelete ${v === 'on' ? 'activé' : 'désactivé'}*`);
} });
