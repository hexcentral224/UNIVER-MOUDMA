// Conversions média CENTRAL-HEX : stickers WebP (statiques/animés), sticker → image
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const ff = require('fluent-ffmpeg');
const webp = require('node-webpmux');
const cfg = require('../core/config');

try { ff.setFfmpegPath(require('ffmpeg-static')); } catch {}

const tmp = ext => path.join(os.tmpdir(), `chx_${crypto.randomBytes(6).toString('hex')}.${ext}`);
const rm = (...f) => f.forEach(x => fs.rm(x, { force: true }, () => {}));

async function imageToWebp(buf) {
  return sharp(buf).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 85 }).toBuffer();
}

// vidéo / gif → webp animé (8 s max, 512 px)
function videoToWebp(buf, inExt = 'mp4') {
  const inp = tmp(inExt), out = tmp('webp');
  fs.writeFileSync(inp, buf);
  return new Promise((resolve, reject) => {
    ff(inp)
      .outputOptions([
        '-vcodec', 'libwebp', '-an', '-loop', '0', '-t', '8', '-preset', 'default', '-vsync', '0',
        '-vf', 'fps=15,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=0x00000000,format=rgba'
      ])
      .on('error', e => { rm(inp, out); reject(e); })
      .on('end', () => { try { const b = fs.readFileSync(out); rm(inp, out); resolve(b); } catch (e) { reject(e); } })
      .save(out);
  });
}

// Ajoute le nom du pack / auteur au sticker
async function addExif(buf, pack = cfg.BOT_NAME, author = cfg.BOT_NAME) {
  const img = new webp.Image();
  await img.load(buf);
  const json = { 'sticker-pack-id': crypto.randomBytes(8).toString('hex'), 'sticker-pack-name': pack, 'sticker-pack-publisher': author, emojis: ['🤖'] };
  const head = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  const j = Buffer.from(JSON.stringify(json), 'utf8');
  const exif = Buffer.concat([head, j]);
  exif.writeUIntLE(j.length, 14, 4);
  img.exif = exif;
  return img.save(null);
}

async function toSticker(buf, kind = 'image') {
  const w = kind === 'video' ? await videoToWebp(buf) : await imageToWebp(buf);
  try { return await addExif(w); } catch { return w; }
}

// sticker → image (png) ou vidéo (mp4) si animé
async function stickerToMedia(buf) {
  const meta = await sharp(buf, { animated: true }).metadata();
  if (!meta.pages || meta.pages < 2) return { type: 'image', data: await sharp(buf).png().toBuffer() };
  const gif = await sharp(buf, { animated: true }).gif().toBuffer();
  const inp = tmp('gif'), out = tmp('mp4');
  fs.writeFileSync(inp, gif);
  await new Promise((res, rej) => ff(inp)
    .outputOptions(['-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2'])
    .on('error', rej).on('end', res).save(out));
  const data = fs.readFileSync(out);
  rm(inp, out);
  return { type: 'video', data };
}

module.exports = { toSticker, stickerToMedia, imageToWebp, addExif };
