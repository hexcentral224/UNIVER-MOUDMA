const { add } = require('../core/registry');
const cfg = require('../core/config');
const media = require('../lib/media');
const attpLib = require('../lib/attp');
const { download, unwrap } = require('../lib/util');
const { pickMedia } = require('../lib/helpers');

add({ name: 'stiker', alias: ['sticker', 's'], cat: 'media', desc: 'créer un sticker à partir d\'une image ou d\'une vidéo', use: 'stiker  (en répondant à une image / vidéo)', async run(ctx) {
  const mm = pickMedia(ctx, ['imageMessage', 'videoMessage']);
  if (!mm) return ctx.reply('🎨 Envoie ou *réponds à une image / vidéo* avec *stiker*.');
  if (mm.type === 'video' && (mm.content.seconds || 0) > 12) return ctx.reply('⏱️ Vidéo trop longue (12 s max).');
  const buf = await download(mm.content, mm.type);
  await ctx.send({ sticker: await media.toSticker(buf, mm.type) });
} });

add({ name: 'take', cat: 'media', desc: 'changer le nom (pack et auteur) d\'un sticker', use: 'take nom du pack | auteur  (en répondant à un sticker)', async run(ctx) {
  const st = ctx.quoted?.stickerMessage;
  if (!st) return ctx.reply('🎨 *Réponds à un sticker* avec : *take nom du pack | auteur*\nExemple : *take Univers | Moudma*');
  const [packRaw, authorRaw] = ctx.q.split('|').map(x => x.trim());
  const pack = (packRaw || cfg.BOT_NAME).slice(0, 40);
  const author = (authorRaw || ctx.pushName || cfg.BOT_NAME).slice(0, 40);
  const buf = await download(st, 'sticker');
  await ctx.send({ sticker: await media.addExif(buf, pack, author) });
} });

add({ name: 'attp', cat: 'media', desc: 'transformer un texte en sticker animé coloré', use: 'attp ton texte', async run(ctx) {
  let text = ctx.q;
  if (!text && ctx.quoted) text = ctx.quoted.conversation || ctx.quoted.extendedTextMessage?.text || '';
  text = String(text || '').trim();
  if (!text) return ctx.reply('✨ Utilise : *attp ton texte*  (60 caractères max)');
  if (text.length > 60) return ctx.reply('❌ Texte trop long (60 caractères max).');
  const webp = await attpLib.make(text);
  let out = webp;
  try { out = await media.addExif(webp); } catch {}
  await ctx.send({ sticker: out });
} });

// setpp : photo de profil du bot (propriétaire) ou du groupe (admin, avec « groupe »)
add({ name: 'setpp', cat: 'media', desc: 'changer la photo de profil du bot ou du groupe', use: 'setpp  |  setpp groupe  (avec une image ou en répondant à une image)', async run(ctx) {
  const wantGroup = (ctx.args[0] || '').toLowerCase().startsWith('groupe') || (ctx.args[0] || '').toLowerCase() === 'group';
  if (wantGroup) {
    if (!ctx.isGroup) return ctx.reply('👥 *setpp groupe* fonctionne uniquement dans un groupe.');
    if (!(ctx.isAdmin || ctx.isOwner)) return ctx.reply('👑 Commande réservée aux admins du groupe.');
    if (!ctx.isBotAdmin) return ctx.reply('⚠️ Je dois être admin du groupe pour faire ça.');
  } else if (!ctx.isOwner) return ctx.reply('🔒 Commande réservée au propriétaire du bot.');

  const mm = pickMedia(ctx, ['imageMessage']);
  if (!mm) return ctx.reply('🖼️ Envoie une image avec *setpp* ou *réponds à une image*.');
  const buf = await download(mm.content, 'image');
  const target = wantGroup ? ctx.from : ctx.sock.user.id;
  await ctx.sock.updateProfilePicture(target, buf);
  await ctx.reply(wantGroup ? '✅ Photo du groupe mise à jour.' : '✅ Ma photo de profil a été mise à jour.');
} });
