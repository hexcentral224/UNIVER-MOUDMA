// ATTP : texte → sticker animé (couleurs qui défilent), généré localement avec ffmpeg (aucune API externe)
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const FONTS = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
  '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf'
];
const COLORS = ['0xFF2D2D', '0xFF8A00', '0xFFE600', '0x19D46B', '0x00B7FF', '0x8A5BFF', '0xFF3DAA'];

// ffmpeg système en priorité (Docker), sinon ffmpeg-static
const ffmpegPath = () => { if (fs.existsSync('/usr/bin/ffmpeg')) return '/usr/bin/ffmpeg'; try { return require('ffmpeg-static') || 'ffmpeg'; } catch { return 'ffmpeg'; } };
const fontPath = () => FONTS.find(f => fs.existsSync(f));

// Coupe le texte en lignes courtes (12 caractères max, les très longs mots sont coupés)
function wrap(text, max = 12) {
  const lines = [];
  let cur = '';
  for (let w of text.split(/\s+/).filter(Boolean)) {
    while (w.length > max) { if (cur) { lines.push(cur); cur = ''; } lines.push(w.slice(0, max)); w = w.slice(max); }
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= max) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function make(text) {
  const font = fontPath();
  if (!font) return Promise.reject(new Error('police introuvable (installe fonts-dejavu-core)'));
  const lines = wrap(String(text).slice(0, 60));
  const longest = Math.max(...lines.map(l => l.length));
  const size = Math.max(36, Math.min(150, Math.floor(Math.min(440 / (longest * 0.72), 440 / (lines.length * 1.35)))));

  const id = crypto.randomBytes(6).toString('hex');
  const txt = path.join(os.tmpdir(), `attp_${id}.txt`), out = path.join(os.tmpdir(), `attp_${id}.webp`);
  fs.writeFileSync(txt, lines.join('\n'));

  const slot = 0.25;
  const draw = COLORS.map((c, i) =>
    `drawtext=fontfile='${font}':textfile='${txt}':fontsize=${size}:fontcolor=${c}:borderw=${Math.max(2, Math.round(size / 18))}:bordercolor=black:line_spacing=${Math.round(size / 8)}:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${(i * slot).toFixed(2)},${((i + 1) * slot - 0.001).toFixed(3)})'`
  ).join(',');
  const dur = (COLORS.length * slot).toFixed(2);

  const args = ['-y', '-f', 'lavfi', '-i', `color=c=black@0.0:s=512x512:r=15:d=${dur},format=rgba`,
    '-vf', draw, '-vcodec', 'libwebp', '-lossless', '0', '-q:v', '60', '-loop', '0', '-an', '-vsync', '0', out];

  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), args);
    let err = '';
    p.stderr.on('data', d => { err += d; if (err.length > 4000) err = err.slice(-4000); });
    p.on('error', e => { fs.rmSync(txt, { force: true }); reject(e); });
    p.on('close', code => {
      fs.rmSync(txt, { force: true });
      if (code !== 0 || !fs.existsSync(out)) { fs.rmSync(out, { force: true }); return reject(new Error('ffmpeg a échoué : ' + (err.split('\n').filter(Boolean).pop() || code))); }
      const buf = fs.readFileSync(out); fs.rmSync(out, { force: true });
      resolve(buf);
    });
  });
}

module.exports = { make, wrap };
