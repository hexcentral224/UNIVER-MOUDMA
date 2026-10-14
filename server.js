// UNIVER MOUDMA — serveur web + bot WhatsApp (basé sur CENTRAL-HEX)
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const axios = require('axios');
const cfg = require('./core/config');
const db = require('./core/db');
const sessions = require('./core/sessions');
const handler = require('./core/handler');
require('./commands');
const registry = require('./core/registry');

// 24/7 : une erreur isolée ne doit jamais faire tomber le serveur
process.on('uncaughtException', e => console.error('uncaughtException:', e?.message || e));
process.on('unhandledRejection', e => console.error('unhandledRejection:', e?.message || e));

sessions.setHandlers({ onMessage: handler.handle, onGroup: handler.onGroup, onCall: handler.onCall });

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// ── Limitation de débit simple (par IP) ──
const hits = new Map();
function limit(max, windowMs) {
  return (req, res, next) => {
    const k = req.ip + req.path;
    const now = Date.now();
    const arr = (hits.get(k) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Trop de tentatives, patiente un instant.' });
    arr.push(now);
    hits.set(k, arr);
    next();
  };
}
setInterval(() => hits.clear(), 10 * 60 * 1000).unref();

const PUB = path.join(__dirname, 'public');
app.get('/', (_, res) => res.sendFile(path.join(PUB, 'index.html')));
app.get('/admin', (_, res) => res.sendFile(path.join(PUB, 'admin.html')));
app.use('/assets', express.static(path.join(PUB, 'assets'), { maxAge: '1d' }));
app.get('/health', (_, res) => res.json({ ok: true, uptime: process.uptime() }));

// ── API publique ──
app.get('/api/stats', (_, res) => {
  const g = db.global().data;
  res.json({ online: sessions.openCount(), total: sessions.count(), capacity: cfg.MAX_SESSIONS, commands: registry.total(), messages: g.messages, uptime: process.uptime() });
});

app.post('/api/pair', limit(6, 60_000), async (req, res) => {
  try {
    const code = await sessions.startPair(req.body?.number);
    res.json({ code, number: sessions.clean(req.body.number) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/pair/status', (req, res) => res.json(sessions.pairState(req.query.number)));

app.post('/api/qr', limit(6, 60_000), async (_, res) => {
  try { res.json({ id: await sessions.startQR() }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/qr/:id', async (req, res) => {
  try { res.json(await sessions.qrState(req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin ──
const tokens = new Map(); // token -> expiration
const safeEq = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
app.post('/api/admin/login', limit(8, 10 * 60_000), (req, res) => {
  if (!cfg.ADMIN_PASSWORD) return res.status(403).json({ error: 'Panneau admin désactivé (définis ADMIN_PASSWORD).' });
  if (!safeEq(req.body?.password || '', cfg.ADMIN_PASSWORD)) {
    db.log(`Tentative de connexion admin refusée (${req.ip})`);
    return res.status(401).json({ error: 'Mot de passe incorrect.' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, Date.now() + 12 * 3600_000);
  db.log(`Connexion admin (${req.ip})`);
  res.json({ token });
});
function auth(req, res, next) {
  const exp = tokens.get(req.get('x-admin-token'));
  if (!exp || exp < Date.now()) return res.status(401).json({ error: 'Session expirée.' });
  next();
}

app.get('/api/admin/overview', auth, (_, res) => {
  const g = db.global().data;
  const mem = process.memoryUsage();
  res.json({
    sessions: sessions.list(), capacity: cfg.MAX_SESSIONS, online: sessions.openCount(),
    messages: g.messages, commands: g.commands, totalCommands: registry.total(),
    banned: g.banned, logs: g.logs.slice(0, 60), uptime: process.uptime(),
    memory: { rss: mem.rss, heap: mem.heapUsed }, system: { total: os.totalmem(), free: os.freemem(), load: os.loadavg()[0], cpus: os.cpus().length }, version: cfg.VERSION, node: process.version
  });
});
app.post('/api/admin/session/:id/:action', auth, async (req, res) => {
  const { id, action } = req.params;
  try {
    if (action === 'restart') await sessions.restart(id);
    else if (action === 'logout') await sessions.logout(id);
    else if (action === 'delete') await sessions.destroy(id, 'Supprimée par l\'admin');
    else if (action === 'ban') {
      const g = db.global(); if (!g.data.banned.includes(id)) g.data.banned.push(id); g.save();
      await sessions.destroy(id, 'Bloquée par l\'admin');
    } else if (action === 'unban') {
      const g = db.global(); g.data.banned = g.data.banned.filter(x => x !== id); g.save();
    } else return res.status(400).json({ error: 'Action inconnue' });
    db.log(`Admin : ${action} → ${id}`);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/admin/logs/clear', auth, (_, res) => {
  const g = db.global(); g.data.logs = []; g.save(); db.log('Journal vidé par l\'admin'); res.json({ ok: true });
});
app.post('/api/admin/broadcast', auth, async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 1500);
  if (!text) return res.status(400).json({ error: 'Message vide.' });
  let sent = 0;
  for (const info of sessions.list()) {
    const s = sessions.get(info.id);
    if (s?.status !== 'open') continue;
    try {
      await s.sock.sendMessage(s.sock.user.id.split(':')[0] + '@s.whatsapp.net', { text: `📢 *ANNONCE ${cfg.BOT_NAME}*\n\n${text}` });
      sent++;
    } catch {}
    await new Promise(r => setTimeout(r, 700));
  }
  db.log(`Admin : annonce envoyée à ${sent} session(s)`);
  res.json({ sent });
});

// ── Démarrage ──
app.listen(cfg.PORT, '0.0.0.0', async () => {
  console.log(`🚀 ${cfg.BOT_NAME} v${cfg.VERSION} — http://localhost:${cfg.PORT}  (${registry.total()} commandes)`);
  await sessions.restoreAll();
});

// Keep-alive : évite la mise en veille des hébergeurs gratuits
const self = process.env.RENDER_EXTERNAL_URL || process.env.KOYEB_PUBLIC_DOMAIN && `https://${process.env.KOYEB_PUBLIC_DOMAIN}` || cfg.PUBLIC_URL;
if (self) setInterval(() => axios.get(self + '/health', { timeout: 15000 }).catch(() => {}), 4 * 60 * 1000).unref();
