const { add } = require('../core/registry');
const menu = require('../core/menu');
const { banner } = require('../lib/helpers');

add({ name: 'menu', cat: 'general', desc: 'afficher le menu', use: 'menu', async run(ctx) {
  const text = menu.build(ctx);
  try { await banner(ctx, text); } catch { await ctx.reply(text); }
} });

add({ name: 'all-menu', alias: ['allmenu'], cat: 'general', desc: 'toutes les commandes détaillées', use: 'all-menu', async run(ctx) {
  const text = menu.full(ctx);
  try { await banner(ctx, text); } catch { await ctx.reply(text); }
} });
