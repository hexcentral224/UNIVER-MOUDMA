const axios = require('axios');
const baileys = require('@whiskeysockets/baileys');

const num = jid => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
const toJid = n => num(n) + '@s.whatsapp.net';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pick = a => a[Math.floor(Math.random() * a.length)];
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' };

async function getJson(url, opts = {}) {
  const r = await axios.get(url, { timeout: 20000, headers: UA, ...opts });
  return r.data;
}
async function getBuffer(url, opts = {}) {
  const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000, headers: UA, maxContentLength: 120 * 1024 * 1024, ...opts });
  return Buffer.from(r.data);
}
// Essaie plusieurs sources l'une après l'autre ; chaque fn retourne une valeur ou lève une erreur
async function firstOk(fns) {
  let last;
  for (const fn of fns) {
    try { const v = await fn(); if (v) return v; } catch (e) { last = e; }
  }
  throw last || new Error('Toutes les sources ont échoué');
}
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}
// Retire les enveloppes (éphémère, vue unique, etc.)
function unwrap(m) {
  let x = m;
  for (let i = 0; i < 5 && x; i++) {
    const inner = x.ephemeralMessage?.message || x.viewOnceMessage?.message || x.viewOnceMessageV2?.message ||
      x.viewOnceMessageV2Extension?.message || x.documentWithCaptionMessage?.message || x.editedMessage?.message?.protocolMessage?.editedMessage;
    if (!inner) break;
    x = inner;
  }
  return x || {};
}
function typeOf(m) {
  return Object.keys(m || {}).find(k => k !== 'messageContextInfo' && k !== 'senderKeyDistributionMessage') || '';
}
function textOf(m) {
  return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption ||
    m.documentMessage?.caption || m.buttonsResponseMessage?.selectedButtonId || m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.templateButtonReplyMessage?.selectedId || '';
}
async function download(content, type) {
  const stream = await baileys.downloadContentFromMessage(content, type);
  return streamToBuffer(stream);
}
const fmtUptime = s => {
  s = Math.floor(s);
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return `${d ? d + 'j ' : ''}${h}h ${m}m ${s % 60}s`;
};
const fmtBytes = b => b > 1e9 ? (b / 1e9).toFixed(2) + ' Go' : b > 1e6 ? (b / 1e6).toFixed(1) + ' Mo' : (b / 1e3).toFixed(0) + ' Ko';

module.exports = { num, toJid, sleep, pick, UA, getJson, getBuffer, firstOk, streamToBuffer, unwrap, typeOf, textOf, download, fmtUptime, fmtBytes };
