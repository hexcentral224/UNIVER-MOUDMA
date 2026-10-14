const { add } = require('../core/registry');
const cfg = require('../core/config');
const { num, unwrap, textOf } = require('../lib/util');

const jidOf = p => p.phoneNumber || p.id;
const idsOf = p => [p.id, p.lid, p.phoneNumber].filter(Boolean).map(num);

// tagall : un seul message, une seule liste (admins puis membres)
add({ name: 'tagall', cat: 'tags', desc: 'mentionner tout le monde dans un seul message', use: 'tagall [message]', group: true, admin: true, async run(ctx) {
  const me = [ctx.sock.user?.id, ctx.sock.user?.lid].filter(Boolean).map(num);
  const list = (ctx.meta?.participants || []).filter(p => !idsOf(p).some(x => me.includes(x)));
  const admins = list.filter(p => p.admin), members = list.filter(p => !p.admin);
  if (!list.length) return ctx.reply('ℹ️ Personne à mentionner.');
  const msg = ctx.args.join(' ').trim();
  const when = new Date().toLocaleString('fr-FR', { timeZone: cfg.TZ, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  const tag = p => `│ ⟡ @${num(jidOf(p))}`;
  let body = `┏━━━━━━━━━━━━━━━━━━━━┓\n   📣 𝗔𝗣𝗣𝗘𝗟 𝗚𝗘́𝗡𝗘́𝗥𝗔𝗟\n┗━━━━━━━━━━━━━━━━━━━━┛\n` +
    `◈ 🏰 *${ctx.meta?.subject || 'Groupe'}*\n◈ 🙋 Par : @${num(ctx.sender)}\n◈ 👥 *${list.length}* membres  •  🕒 ${when}\n` + (msg ? `◈ 💬 *${msg}*\n` : '') + '\n';
  if (admins.length) body += `╭─❖ 👑 『 𝗔𝗗𝗠𝗜𝗡𝗦 』\n${admins.map(tag).join('\n')}\n╰───────────────⟢\n\n`;
  if (members.length) body += `╭─❖ 🌐 『 𝗠𝗘𝗠𝗕𝗥𝗘𝗦 』\n${members.map(tag).join('\n')}\n╰───────────────⟢\n\n`;
  body += `> ${cfg.BRAND} 🇬🇳`;
  await ctx.sock.sendMessage(ctx.from, { text: body, mentions: [...list.map(jidOf), ctx.sender] }, { quoted: ctx.msg });
} });

// tag : tout le monde est notifié sans afficher aucun nom — utilisable par TOUS les membres (comme le @tous des admins)
add({ name: 'tag', cat: 'tags', desc: 'mentionner tous les membres sans afficher les noms (pour tout le monde)', use: 'tag message', group: true, async run(ctx) {
  let text = ctx.args.join(' ').trim();
  if (!text && ctx.quotedRaw) { try { text = textOf(unwrap(ctx.quotedRaw)).trim(); } catch {} }
  if (!text) text = '📣';
  const mentions = (ctx.meta?.participants || []).map(jidOf);
  if (!mentions.length) return ctx.reply('ℹ️ Impossible de récupérer les membres du groupe.');
  await ctx.sock.sendMessage(ctx.from, { text, mentions });
} });

// hidetag : tout le monde est notifié, sans afficher aucun nom
add({ name: 'hidetag', cat: 'tags', desc: 'mentionner tout le monde sans afficher les noms', use: 'hidetag message', group: true, admin: true, async run(ctx) {
  let text = ctx.args.join(' ').trim();
  if (!text && ctx.quotedRaw) { try { text = textOf(unwrap(ctx.quotedRaw)).trim(); } catch {} }
  if (!text) text = '📣';
  const mentions = (ctx.meta?.participants || []).map(jidOf);
  if (!mentions.length) return ctx.reply('ℹ️ Impossible de récupérer les membres du groupe.');
  await ctx.sock.sendMessage(ctx.from, { text, mentions });
} });
