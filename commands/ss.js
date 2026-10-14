const { add } = require('../core/registry');
const cfg = require('../core/config');
const { getBuffer, firstOk } = require('../lib/util');

add({ name: 'ss', cat: 'media', desc: "capture d'écran d'un site web", use: 'ss https://exemple.com', async run(ctx) {
  let url = ctx.args[0];
  if (!url) return ctx.reply('📸 Utilise : *ss https://exemple.com*');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const buf = await firstOk([
    async () => getBuffer(`https://api.siputzx.my.id/api/tools/ssweb?url=${encodeURIComponent(url)}&theme=light&device=desktop`),
    async () => getBuffer(`https://image.thum.io/get/width/1280/crop/800/${url}`),
    async () => getBuffer(`https://s0.wp.com/mshots/v1/${encodeURIComponent(url)}?w=1280&h=800`)
  ]);
  await ctx.send({ image: buf, caption: `📸 ${url}\n> ${cfg.BRAND} 🇬🇳` });
} });
