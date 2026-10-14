// Stockage JSON léger avec écriture différée (évite de saturer le disque à 150 sessions)
const fs = require('fs');
const path = require('path');
const DIR = path.join(process.cwd(), 'data');
fs.mkdirSync(DIR, { recursive: true });

const cache = new Map();
const timers = new Map();
const fileOf = n => path.join(DIR, n.replace(/[^\w.-]/g, '_') + '.json');

function load(name, def = {}) {
  if (cache.has(name)) return cache.get(name);
  let v = def;
  try { v = JSON.parse(fs.readFileSync(fileOf(name), 'utf8')); } catch {}
  cache.set(name, v);
  return v;
}
function save(name) {
  if (timers.has(name)) return;
  timers.set(name, setTimeout(() => {
    timers.delete(name);
    const f = fileOf(name);
    fs.writeFile(f + '.tmp', JSON.stringify(cache.get(name)), err => {
      if (!err) fs.rename(f + '.tmp', f, () => {});
    });
  }, 800));
}
function flushAll() {
  for (const [n] of timers) {
    try { fs.writeFileSync(fileOf(n), JSON.stringify(cache.get(n))); } catch {}
  }
}
process.on('SIGTERM', () => { flushAll(); process.exit(0); });
process.on('SIGINT', () => { flushAll(); process.exit(0); });

// Données propres à une session (un numéro connecté)
function session(id) {
  const name = 's_' + id;
  const data = load(name, { mode: 'public', menuImage: null, groups: {}, dmAntiDelete: false, prefix: null, anticall: null });
  data.groups = data.groups || {};
  return { data, save: () => save(name) };
}

// Données globales (stats, logs, sessions bannies)
function global() {
  const name = 'global';
  const data = load(name, { messages: 0, commands: 0, banned: [], logs: [], sessions: {} });
  return { data, save: () => save(name) };
}
function log(text) {
  const g = global();
  g.data.logs.unshift({ t: Date.now(), text });
  g.data.logs.length = Math.min(g.data.logs.length, 200);
  g.save();
}
function removeSession(id) {
  cache.delete('s_' + id);
  try { fs.unlinkSync(fileOf('s_' + id)); } catch {}
}

module.exports = { load, save, session, global, log, removeSession };
