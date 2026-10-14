// Antidelete CENTRAL-HEX — logique reprise de ITACHI-XMD-V2
// • Activé : chaque message reçu (texte + médias) est gardé en mémoire
// • Quand quelqu'un le supprime, un rapport est envoyé EN PRIVÉ au propriétaire du bot
const fs = require('fs');
const os = require('os');
const path = require('path');
const { num, unwrap, typeOf, textOf, download } = require('../lib/util');

const DIR = path.join(os.tmpdir(), 'chx_antidelete');
fs.mkdirSync(DIR, { recursive: true });

const MAX_ENTRIES = 400;           // messages gardés par session
const MAX_MEDIA = 30 * 1024 * 1024; // médias > 30 Mo ignorés
const EXT = { image: 'jpg', video: 'mp4', sticker: 'webp', audio: 'mp3', document: 'bin' };

const stores = new Map(); // sessionId -> Map(messageId -> entrée)
const storeOf = id => { if (!stores.has(id)) stores.set(id, new Map()); return stores.get(id); };
const rm = f => { if (f) fs.rm(f, { force: true }, () => {}); };
const ownerJid = s => s.sock.user.id.split(':')[0] + '@s.whatsapp.net';
const isOn = s => !!s.store?.data?.antidelete;

// Sauvegarde un message entrant
async function store(s, msg) {
  try {
    if (!isOn(s) || !msg.key?.id || !msg.message || msg.key.fromMe) return;
    if (msg.message.protocolMessage) return;

    const raw = msg.message;
    const m = unwrap(raw);
    const type = typeOf(m);
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const sender = isGroup
      ? (msg.key.participantAlt || msg.key.participant || msg.participant)
      : (msg.key.remoteJidAlt || from);

    const entry = { content: '', mediaType: '', mediaPath: '', mime: '', fileName: '', sender, group: isGroup ? from : null, ts: Date.now() };

    if (type === 'conversation' || type === 'extendedTextMessage') {
      entry.content = textOf(m);
    } else if (['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(type)) {
      const kind = type.replace('Message', '');
      entry.mediaType = kind;
      entry.content = m[type].caption || '';
      entry.mime = m[type].mimetype || '';
      entry.fileName = m[type].fileName || '';
      const size = Number(m[type].fileLength || 0);
      if (size && size > MAX_MEDIA) {
        entry.tooBig = true;
      } else {
        const buf = await download(m[type], kind);
        entry.mediaPath = path.join(DIR, `${s.id}_${msg.key.id}.${EXT[kind]}`);
        fs.writeFileSync(entry.mediaPath, buf);
      }
    } else {
      return; // réactions, sondages, etc. : ignorés
    }

    const st = storeOf(s.id);
    st.set(msg.key.id, entry);
    while (st.size > MAX_ENTRIES) {
      const k = st.keys().next().value;
      rm(st.get(k)?.mediaPath);
      st.delete(k);
    }
  } catch (e) {
    console.error(`[${s.id}] antidelete.store:`, e.message);
  }
}

// Traite une suppression (message de type « revoke »). Retourne true si c'était une suppression.
async function revoke(s, msg) {
  const proto = msg.message?.protocolMessage;
  if (!proto || proto.type !== 0 || !proto.key?.id) return false;
  try {
    if (!isOn(s)) return true;
    const st = storeOf(s.id);
    const original = st.get(proto.key.id);
    if (!original) return true;

    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const deletedBy = (isGroup ? (msg.key.participantAlt || msg.key.participant) : (msg.key.remoteJidAlt || from)) || original.sender;
    const owner = ownerJid(s);
    // Suppression faite par le bot / le propriétaire lui-même : on ignore
    if (msg.key.fromMe || num(deletedBy) === num(s.sock.user.id)) { rm(original.mediaPath); st.delete(proto.key.id); return true; }

    const sender = original.sender;
    let groupName = '';
    if (original.group) { try { groupName = (await s.sock.groupMetadata(original.group)).subject; } catch {} }

    const time = new Date().toLocaleString('fr-FR', {
      timeZone: 'Africa/Conakry', hour: '2-digit', minute: '2-digit', second: '2-digit',
      day: '2-digit', month: '2-digit', year: 'numeric'
    });

    let text = `*🔰 RAPPORT ANTIDELETE 🔰*\n\n` +
      `*🗑️ Supprimé par :* @${num(deletedBy)}\n` +
      `*👤 Expéditeur :* @${num(sender)}\n` +
      `*📱 Numéro :* +${num(sender)}\n` +
      `*🕒 Heure :* ${time}\n`;
    if (groupName) text += `*👥 Groupe :* ${groupName}\n`;
    else text += `*💬 Lieu :* Discussion privée\n`;
    if (original.content) text += `\n*💬 Message supprimé :*\n${original.content}`;
    if (original.tooBig) text += `\n\n⚠️ Média trop lourd : non sauvegardé.`;

    const mentions = [...new Set([deletedBy, sender].filter(Boolean))];
    await s.sock.sendMessage(owner, { text, mentions });

    if (original.mediaType && original.mediaPath && fs.existsSync(original.mediaPath)) {
      const buf = fs.readFileSync(original.mediaPath);
      const caption = `*Supprimé : ${original.mediaType}*\nDe : @${num(sender)}`;
      try {
        switch (original.mediaType) {
          case 'image': await s.sock.sendMessage(owner, { image: buf, caption, mentions: [sender] }); break;
          case 'video': await s.sock.sendMessage(owner, { video: buf, caption, mentions: [sender] }); break;
          case 'sticker': await s.sock.sendMessage(owner, { sticker: buf }); break;
          case 'audio': await s.sock.sendMessage(owner, { audio: buf, mimetype: 'audio/mpeg', ptt: false }); break;
          case 'document': await s.sock.sendMessage(owner, { document: buf, mimetype: original.mime || 'application/octet-stream', fileName: original.fileName || 'fichier', caption, mentions: [sender] }); break;
        }
      } catch (err) {
        await s.sock.sendMessage(owner, { text: `⚠️ Erreur d'envoi du média : ${err.message}` });
      }
    }
    rm(original.mediaPath);
    st.delete(proto.key.id);
  } catch (e) {
    console.error(`[${s.id}] antidelete.revoke:`, e.message);
  }
  return true;
}

// Nettoyage des fichiers d'une session fermée
function clear(id) {
  const st = stores.get(id);
  if (st) for (const e of st.values()) rm(e.mediaPath);
  stores.delete(id);
}

module.exports = { store, revoke, clear, isOn };
