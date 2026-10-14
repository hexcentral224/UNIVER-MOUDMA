// Fonctions partagées entre les commandes
const fs = require('fs');
const cfg = require('../core/config');
const { download } = require('./util');

function menuImage(ctx) {
  const f = ctx.store.data.menuImage;
  if (f && f.startsWith('http')) return { url: f };
  if (f && fs.existsSync(f)) return fs.readFileSync(f);
  return { url: cfg.MENU_IMAGE };
}
const banner = (ctx, caption) => ctx.send({ image: menuImage(ctx), caption });

// Cherche un média dans le message lui-même ou dans le message cité
function pickMedia(ctx, types) {
  for (const src of [ctx.m, ctx.quoted]) {
    if (!src) continue;
    for (const t of types) if (src[t]) return { type: t.replace('Message', ''), content: src[t], msg: src };
  }
  return null;
}

// Récupère un média « vue unique » (en répondant dessus) et l'envoie en privé
async function viewOnce(ctx, silent) {
  const raw = ctx.quotedRaw;
  if (!raw) return silent ? null : ctx.reply('👉 *Réponds à un média « vue unique »* avec cette commande.');
  const wrapped = !!(raw.viewOnceMessage || raw.viewOnceMessageV2 || raw.viewOnceMessageV2Extension);
  const inner = ctx.quoted;
  const t = ['imageMessage', 'videoMessage', 'audioMessage'].find(k => inner?.[k] && (wrapped || inner[k].viewOnce));
  if (!t) return silent ? null : ctx.reply('ℹ️ Ce message n\'est pas un média à vue unique.');
  const kind = t.replace('Message', '');
  const buf = await download(inner[t], kind);
  const payload = { [kind]: buf, caption: `👁️ Vue unique récupérée\n> ${cfg.BRAND} 🇬🇳` };
  if (kind === 'audio') { payload.mimetype = 'audio/mp4'; delete payload.caption; }
  await ctx.sock.sendMessage(ctx.sender, payload);
  if (!silent) await ctx.reply('📥 Média envoyé dans ta discussion privée.');
}

module.exports = { pickMedia, viewOnce, menuImage, banner };
