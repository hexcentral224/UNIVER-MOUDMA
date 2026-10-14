require('dotenv').config();
module.exports = {
  BOT_NAME: 'UNIVER MOUDMA',
  BRAND: 'CENTRAL-HEX',                       // le bot est basé sur CENTRAL-HEX
  VERSION: '1.0.0',
  PREFIX: process.env.PREFIX || '.',
  PORT: Number(process.env.PORT) || 3000,
  // Mot de passe du panneau /admin : à définir dans les variables d'environnement (désactivé si vide)
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  MAX_SESSIONS: Number(process.env.MAX_SESSIONS) || 1,
  PUBLIC_URL: process.env.PUBLIC_URL || '',
  MENU_IMAGE: 'https://i.ibb.co/XkbtKFdM/IMG-20261013-WA1183.jpg',
  OWNER: { name: 'UNIVER MOUDMA', number: process.env.OWNER_NUMBER || '224623068725' },
  CREATOR: { name: 'CENTRAL-HEX', number: '224662675862' },
  // Bot privé : seul le numéro propriétaire peut le connecter
  LOCK_TO_OWNER: process.env.LOCK_TO_OWNER !== 'false',
  SCRIPT_URL: process.env.SCRIPT_URL || '',
  TZ: 'Africa/Conakry',
  // Numéros toujours considérés comme propriétaires
  SUDO: [process.env.OWNER_NUMBER || '224623068725']
};
