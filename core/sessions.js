// Gestionnaire de sessions UNIVER MOUDMA (basé sur CENTRAL-HEX)
// Une session = un numéro WhatsApp connecté (dossier ./sessions/<numéro>)
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const QRCode = require('qrcode');
const baileys = require('@whiskeysockets/baileys');
const cfg = require('./config');
const db = require('./db');

const {
  default: makeWASocket, useMultiFileAuthState, DisconnectReason,
  fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers
} = baileys;

const ROOT = path.join(process.cwd(), 'sessions');
fs.mkdirSync(ROOT, { recursive: true });

const sessions = new Map(); // id -> état
let handlers = { onMessage: null, onGroup: null, onDelete: null, onCall: null };
let waVersion;

const clean = n => String(n || '').replace(/\D/g, '');
const dirOf = id => path.join(ROOT, id);
const logger = pino({ level: 'silent' });

function setHandlers(h) { handlers = { ...handlers, ...h }; }

function publicInfo(s) {
  return {
    id: s.id,
    status: s.status,
    since: s.since,
    reconnects: s.reconnects,
    name: s.sock?.user?.name || null
  };
}
function list() { return [...sessions.values()].map(publicInfo); }
function count() { return sessions.size; }
function get(id) { return sessions.get(id); }
function openCount() { return [...sessions.values()].filter(s => s.status === 'open').length; }

async function getVersion() {
  if (waVersion) return waVersion;
  try { waVersion = (await fetchLatestBaileysVersion()).version; } catch {}
  return waVersion;
}

// ─────────────────────────────────────────────────────────────
// Démarrage d'un socket pour une session
// ─────────────────────────────────────────────────────────────
async function boot(id, opts = {}) {
  const { pairNumber = null, temp = false } = opts;
  let s = sessions.get(id);
  if (!s) {
    s = { id, status: 'connecting', since: Date.now(), reconnects: 0, temp, qr: null, code: null, sock: null, cache: new Map(), timer: null };
    sessions.set(id, s);
  }
  s.temp = temp;
  if (s.sock) { try { s.sock.ev.removeAllListeners(); s.sock.end?.(); } catch {} }

  const { state, saveCreds } = await useMultiFileAuthState(dirOf(id));
  const version = await getVersion();

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    shouldSyncHistoryMessage: () => false,
    getMessage: async key => s.cache.get(key.id)?.message || undefined
  });
  s.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  let codeAsked = false;
  const askCode = async () => {
    if (codeAsked || !pairNumber || state.creds.registered) return;
    codeAsked = true;
    try {
      const raw = await sock.requestPairingCode(pairNumber);
      s.code = raw.match(/.{1,4}/g).join('-');
      s.status = 'waiting_code';
      if (s.onCode) s.onCode(s.code);
    } catch (e) {
      s.status = 'error';
      s.error = e.message;
      if (s.onCode) s.onCode(null, e);
    }
  };

  sock.ev.on('connection.update', async update => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      if (pairNumber) askCode();
      else { s.qr = qr; s.status = 'waiting_qr'; }
    }

    if (connection === 'open') {
      s.status = 'open';
      s.qr = null;
      s.reconnects = 0;
      s.since = Date.now();
      const num = clean(sock.user?.id?.split(':')[0]);
      // Session créée par QR : on la renomme avec le vrai numéro
      if (s.temp && num) return finalizeTemp(s, num);
      db.log(`Session connectée : +${id}`);
      try {
        await sock.sendMessage(sock.user.id.split(':')[0] + '@s.whatsapp.net', {
          text: `✅ *${cfg.BOT_NAME}* est connecté à ce numéro.\n\nEnvoie *${cfg.PREFIX}menu* dans n'importe quelle discussion pour commencer.`
        });
      } catch {}
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      s.status = 'closed';
      const loggedOut = code === DisconnectReason.loggedOut || code === 403;
      if (loggedOut) return destroy(id, 'Déconnecté depuis WhatsApp');
      if (!state.creds.registered && !s.temp && Date.now() - s.since > 5 * 60 * 1000) {
        return destroy(id, 'Pair code expiré');
      }
      s.reconnects++;
      const wait = Math.min(30000, 1000 * 2 ** Math.min(s.reconnects, 5));
      clearTimeout(s.timer);
      s.timer = setTimeout(() => {
        if (sessions.has(id)) boot(id, { pairNumber: state.creds.registered ? null : pairNumber, temp: s.temp }).catch(() => {});
      }, wait);
    }
  });

  sock.ev.on('messages.upsert', async ev => {
    if (handlers.onMessage) {
      try { await handlers.onMessage(s, ev); } catch (e) { console.error(`[${id}] message:`, e.message); }
    }
  });
  sock.ev.on('call', async calls => {
    if (handlers.onCall) {
      try { await handlers.onCall(s, calls); } catch (e) { console.error(`[${id}] call:`, e.message); }
    }
  });
  sock.ev.on('group-participants.update', async ev => {
    if (handlers.onGroup) {
      try { await handlers.onGroup(s, ev); } catch (e) { console.error(`[${id}] group:`, e.message); }
    }
  });

  return s;
}

// Renomme le dossier temporaire (QR) vers le numéro réel puis relance
async function finalizeTemp(s, num) {
  const oldId = s.id;
  try { s.sock.ev.removeAllListeners(); s.sock.end?.(); } catch {}
  sessions.delete(oldId);
  if (sessions.has(num)) { // ce numéro était déjà connecté : on garde l'ancien
    fs.rmSync(dirOf(oldId), { recursive: true, force: true });
    return;
  }
  fs.rmSync(dirOf(num), { recursive: true, force: true });
  fs.renameSync(dirOf(oldId), dirOf(num));
  tempMap.set(oldId, num);
  await boot(num);
}
const tempMap = new Map(); // tempId -> numéro final

// ─────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────
function checkCapacity(id) {
  if (db.global().data.banned.includes(id)) throw new Error('Ce numéro est bloqué.');
  if (!sessions.has(id) && sessions.size >= cfg.MAX_SESSIONS) {
    throw new Error(`Capacité maximale atteinte (${cfg.MAX_SESSIONS} sessions).`);
  }
}

async function startPair(rawNumber) {
  const id = clean(rawNumber);
  if (id.length < 8 || id.length > 15) throw new Error('Numéro invalide. Utilise le format international, ex : 224621963059');
  if (cfg.LOCK_TO_OWNER && id !== clean(cfg.OWNER.number)) throw new Error('Ce bot est privé : seul le numéro du propriétaire peut se connecter.');
  checkCapacity(id);
  const existing = sessions.get(id);
  if (existing?.status === 'open') throw new Error('Ce numéro est déjà connecté au bot.');
  if (existing) await destroy(id, 'Nouvelle demande de pair', true);
  fs.rmSync(dirOf(id), { recursive: true, force: true });

  const s = await boot(id, { pairNumber: id });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Délai dépassé, réessaie.')), 40000);
    s.onCode = (code, err) => {
      clearTimeout(timeout);
      code ? resolve(code) : reject(err || new Error('Impossible de générer le code.'));
    };
  });
}

async function startQR() {
  if (cfg.LOCK_TO_OWNER) throw new Error('Ce bot est privé : utilise le code de jumelage avec le numéro du propriétaire.');
  const tempId = 'qr_' + Math.random().toString(36).slice(2, 10);
  if (sessions.size >= cfg.MAX_SESSIONS) throw new Error(`Capacité maximale atteinte (${cfg.MAX_SESSIONS} sessions).`);
  await boot(tempId, { temp: true });
  // nettoyage si personne ne scanne
  setTimeout(() => {
    const s = sessions.get(tempId);
    if (s && s.temp && s.status !== 'open') destroy(tempId, 'QR expiré');
  }, 3 * 60 * 1000);
  return tempId;
}

async function qrState(tempId) {
  const finalId = tempMap.get(tempId);
  if (finalId) return { status: 'connected', number: finalId };
  const s = sessions.get(tempId);
  if (!s) return { status: 'expired' };
  if (!s.qr) return { status: 'waiting' };
  return { status: 'qr', qr: await QRCode.toDataURL(s.qr, { margin: 1, width: 320 }) };
}

function pairState(id) {
  const s = sessions.get(clean(id));
  return s ? { status: s.status, connected: s.status === 'open' } : { status: 'none', connected: false };
}

async function destroy(id, reason = '', keepDir = false) {
  const s = sessions.get(id);
  clearTimeout(s?.timer);
  if (s?.sock) {
    try { s.sock.ev.removeAllListeners(); } catch {}
    try { s.sock.end?.(); } catch {}
  }
  sessions.delete(id);
  if (!keepDir) {
    fs.rmSync(dirOf(id), { recursive: true, force: true });
    db.removeSession(id);
  }
  if (reason) db.log(`Session ${id} supprimée : ${reason}`);
}

async function logout(id) {
  const s = sessions.get(id);
  try { await s?.sock?.logout(); } catch {}
  await destroy(id, 'Déconnexion demandée');
}

async function restart(id) {
  const s = sessions.get(id);
  if (!s) throw new Error('Session introuvable');
  await boot(id);
}

// Relance toutes les sessions enregistrées au démarrage du serveur
async function restoreAll() {
  let dirs = [];
  try { dirs = fs.readdirSync(ROOT).filter(d => fs.statSync(dirOf(d)).isDirectory()); } catch {}
  let n = 0;
  for (const id of dirs) {
    if (id.startsWith('qr_') || !fs.existsSync(path.join(dirOf(id), 'creds.json'))) {
      fs.rmSync(dirOf(id), { recursive: true, force: true });
      continue;
    }
    if (n >= cfg.MAX_SESSIONS) break;
    try { await boot(id); n++; } catch (e) { console.error(`restore ${id}:`, e.message); }
    await new Promise(r => setTimeout(r, 1200)); // étale les connexions
  }
  console.log(`♻️  ${n} session(s) restaurée(s)`);
}

module.exports = {
  setHandlers, list, count, openCount, get, startPair, startQR, qrState, pairState,
  destroy, logout, restart, restoreAll, clean
};
