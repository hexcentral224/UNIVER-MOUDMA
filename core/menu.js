// Menu UNIVER MOUDMA — design propre au bot (basé sur CENTRAL-HEX)
const cfg = require('./config');
const registry = require('./registry');

// [nom de la commande, usage affiché, description]
const SECTIONS = [
  ['🌐', '𝗚𝗘́𝗡𝗘́𝗥𝗔𝗟', [
    ['menu', 'menu', 'afficher le menu'],
    ['all-menu', 'all-menu', 'toutes les commandes'],
    ['help', 'help', 'aide sur une commande'],
    ['ping', 'ping', 'vitesse du bot'],
    ['test', 'test', 'tester le bot'],
    ['info', 'info', 'infos du bot'],
    ['owner', 'owner', 'contact du propriétaire'],
    ['script', 'script', 'le script du bot'],
    ['weather', 'weather', 'météo d\'une ville'],
    ['8ball', '8ball', 'pose une question'],
    ['staff', 'staff', 'liste des admins']]],
  ['🏰', '𝗚𝗘𝗦𝗧𝗜𝗢𝗡 𝗗𝗨 𝗚𝗥𝗢𝗨𝗣𝗘', [
    ['open', 'open', 'ouvrir le groupe'],
    ['close', 'close', 'fermer le groupe'],
    ['kick', 'kick', 'expulser un membre'],
    ['kickall', 'kickall', 'expulser tous les membres'],
    ['purge', 'purge', 'retirer les inactifs'],
    ['promote', 'promote', 'nommer admin'],
    ['demote', 'demote', 'retirer admin'],
    ['link', 'link', 'lien du groupe'],
    ['approve', 'approve', 'accepter les demandes'],
    ['totalmembres', 'totalmembres', 'nombre de membres'],
    ['clan', 'clan', 'fiche du groupe'],
    ['gstatuts', 'gstatuts', 'statut des protections']]],
  ['⚖️', '𝗠𝗢𝗗𝗘́𝗥𝗔𝗧𝗜𝗢𝗡', [
    ['warn', 'warn', 'avertir un membre'],
    ['sanction', 'sanction', 'avertissements et sanctions'],
    ['mute', 'mute', 'réduire au silence'],
    ['unmute', 'unmute', 'rendre la parole'],
    ['ban', 'ban', 'bannir un membre']]],
  ['📣', '𝗠𝗘𝗡𝗧𝗜𝗢𝗡𝗦', [
    ['tagall', 'tagall', 'mentionner tout le monde'],
    ['tag', 'tag', 'mention cachée de tous (pour tous)'],
    ['hidetag', 'hidetag', 'mention cachée de tous']]],
  ['🛡️', '𝗣𝗥𝗢𝗧𝗘𝗖𝗧𝗜𝗢𝗡𝗦', [
    ['antilink', 'antilink', 'bloquer les liens'],
    ['antibadword', 'antibadword', 'bloquer les insultes'],
    ['antibot', 'antibot', 'bloquer les bots'],
    ['antimention', 'antimention', 'statuts qui mentionnent le groupe'],
    ['antistiker', 'antistiker', 'bloquer les stickers'],
    ['antitag', 'antitag', 'bloquer les mentions de masse'],
    ['antidelete', 'antidelete', 'récupérer les messages supprimés'],
    ['anticall', 'anticall', 'refuser les appels']]],
  ['🎨', '𝗠𝗘́𝗗𝗜𝗔𝗦', [
    ['stiker', 'stiker', 'créer un sticker'],
    ['take', 'take', 'renommer un sticker'],
    ['attp', 'attp', 'texte animé en sticker'],
    ['setpp', 'setpp', 'changer la photo'],
    ['humm', 'humm', 'récupérer une vue unique'],
    ['ss', 'ss', 'capture d\'écran d\'un site']]],
  ['⚙️', '𝗥𝗘́𝗚𝗟𝗔𝗚𝗘𝗦', [
    ['mode', 'mode', 'public / privé'],
    ['prompt', 'prompt', 'changer le préfixe'],
    ['setting', 'setting', 'voir les réglages']]]
];

const fmtUptime = sec => {
  sec = Math.floor(sec);
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  return `${d ? d + 'j ' : ''}${h}h ${m}min`;
};
const now = () => new Date().toLocaleString('fr-FR', { timeZone: cfg.TZ, weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });
const greet = () => {
  const h = Number(new Date().toLocaleString('fr-FR', { timeZone: cfg.TZ, hour: '2-digit', hour12: false }));
  return h >= 5 && h < 18 ? 'Bonjour' : 'Bonsoir';
};

function header(ctx) {
  const p = ctx.p;
  return [
    '┏━━━━━━━━━━━━━━━━━━━━┓',
    '   ✦ 𝗨𝗡𝗜𝗩𝗘𝗥 𝗠𝗢𝗨𝗗𝗠𝗔 ✦',
    '┗━━━━━━━━━━━━━━━━━━━━┛',
    `${greet()} *${ctx.pushName}* 👋`,
    '',
    `◈ 👑 Propriétaire ⟶ *${cfg.OWNER.name}*`,
    `◈ 🔰 Préfixe ⟶ *[ ${p} ]*`,
    `◈ 📡 Mode ⟶ *${ctx.store.data.mode === 'private' ? 'privé' : 'public'}*`,
    `◈ 📚 Commandes ⟶ *${registry.total()}*`,
    `◈ ⏳ Activité ⟶ *${fmtUptime(process.uptime())}*`,
    `◈ 🕒 ${now()}`,
    ''
  ].join('\n');
}

const footer = () => `\n✦ _Écris_ *help <commande>* _pour le détail_\n✦ _Propulsé par_ *${cfg.BRAND}* ✦`;

function build(ctx) {
  const p = ctx.p;
  const out = [header(ctx)];
  for (const [emoji, title, items] of SECTIONS) {
    out.push(`╭─❖ ${emoji} 『 ${title} 』`);
    items.forEach(([, label]) => out.push(`│ ⟡ ${p}${label}`));
    out.push('╰───────────────⟢', '');
  }
  return out.join('\n') + footer();
}

// all-menu : version détaillée avec une description par commande
function full(ctx) {
  const p = ctx.p;
  const out = [`┏━━━━━━━━━━━━━━━━━━━━┓\n   ✦ 𝗧𝗢𝗨𝗧𝗘𝗦 𝗟𝗘𝗦 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗘𝗦 ✦\n┗━━━━━━━━━━━━━━━━━━━━┛\n_Préfixe :_ *[ ${p} ]*  •  *${registry.total()}* commandes\n`];
  for (const [emoji, title, items] of SECTIONS) {
    out.push(`${emoji} *${title}*`);
    items.forEach(([, label, desc]) => out.push(`  ▫️ *${p}${label}* — ${desc}`));
    out.push('');
  }
  return out.join('\n') + `\n✦ _Propulsé par_ *${cfg.BRAND}* ✦`;
}

module.exports = { build, full, SECTIONS, fmtUptime };
