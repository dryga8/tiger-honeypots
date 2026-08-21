// preview.js — служебный просмотрщик спрайтов (в игру не входит).
// Загружает src/palette.js и src/sprites.js в фальшивый window, проверяет
// размеры и рендерит спрайты в PNG, чтобы можно было посмотреть на пиксель-арт.
//
//   node preview.js            — обычный вид
//   node preview.js --gray     — тот же лист в оттенках серого (проверка 14)
//
// Зависимостей нет: PNG собирается вручную через zlib из стандартной библиотеки.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = require('path').join(__dirname, '..');
const OUT_DIR = __dirname;
const GRAY = process.argv.includes('--gray');
const SCALE = 4;

// --- загрузка игровых модулей в фальшивый window --------------------------
const win = { Game: {} };
function load(file) {
  const code = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8');
  new Function('window', code)(win);
}
load('palette.js');
load('sprites.js');
const Game = win.Game;

// --- PNG ------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// rgb: Buffer длиной w*h*3
function writePng(file, w, h, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // бит на канал
  ihdr[9] = 2; // truecolor RGB
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0; // filter none
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ])
  );
}

// --- холст ----------------------------------------------------------------
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (GRAY) {
    const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    r = g = b = l;
  }
  return [r, g, b];
}

function makeCanvas(w, h) {
  const buf = Buffer.alloc(w * h * 3);
  return {
    w, h, buf,
    set(x, y, rgb) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 3;
      buf[i] = rgb[0]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[2];
    },
  };
}

// --- проверка и отрисовка спрайтов ----------------------------------------
const errors = [];

function checkSprite(name, sprite, w, h) {
  if (!sprite) { errors.push(`${name}: спрайт отсутствует`); return false; }
  if (sprite.length !== h) {
    errors.push(`${name}: строк ${sprite.length}, ожидалось ${h}`);
  }
  sprite.forEach((row, i) => {
    if (row.length !== w) {
      errors.push(`${name}: строка ${i} длиной ${row.length}, ожидалось ${w}`);
    }
    for (const ch of row) {
      if (ch === '.') continue;
      const idx = parseInt(ch, 36);
      if (Number.isNaN(idx) || idx >= Game.PALETTE_ORDER.length) {
        errors.push(`${name}: строка ${i}, символ '${ch}' вне палитры`);
      }
    }
  });
  return true;
}

// шахматка под прозрачностью, чтобы дырки в силуэте были видны
const CHECK_A = [40, 40, 48];
const CHECK_B = [58, 58, 68];

function blitSprite(cv, sprite, ox, oy) {
  const colors = Game.paletteByIndex.map(hexToRgb);
  for (let r = 0; r < sprite.length; r++) {
    for (let c = 0; c < sprite[r].length; c++) {
      const ch = sprite[r][c];
      let rgb;
      if (ch === '.') {
        rgb = (((c >> 1) + (r >> 1)) & 1) ? CHECK_B : CHECK_A;
      } else {
        rgb = colors[parseInt(ch, 36)] || [255, 0, 255]; // маркер битого символа
      }
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
          cv.set(ox + c * SCALE + dx, oy + r * SCALE + dy, rgb);
        }
      }
    }
  }
}

// --- лист со всеми спрайтами ----------------------------------------------
const S = Game.sprites || {};

const sheet = [
  ['TIGER_UP_LEFT', S.TIGER && S.TIGER.upLeft, 32, 40],
  ['TIGER_DOWN_LEFT', S.TIGER && S.TIGER.downLeft, 32, 40],
  ['TIGER_UP_RIGHT', S.TIGER && S.TIGER.upRight, 32, 40],
  ['TIGER_DOWN_RIGHT', S.TIGER && S.TIGER.downRight, 32, 40],
  ['POT_GREEN', S.POT_GREEN, 12, 12],
  ['POT_RED', S.POT_RED, 12, 12],
  ['CHUTE_TILE', S.CHUTE_TILE, 16, 16],
  ['HEART_FULL', S.HEART_FULL, 9, 8],
  ['HEART_HALF', S.HEART_HALF, 9, 8],
  ['HEART_EMPTY', S.HEART_EMPTY, 9, 8],
  ['ARROW_LEFT', S.ARROW_LEFT, 7, 7],
  ['ARROW_RIGHT', S.ARROW_RIGHT, 7, 7],
  ['ARROW_UP', S.ARROW_UP, 7, 7],
  ['ARROW_DOWN', S.ARROW_DOWN, 7, 7],
  ['SOUND_ON', S.SOUND_ON, 9, 9],
  ['SOUND_OFF', S.SOUND_OFF, 9, 9],
].filter((e) => e[1]);

const PAD = 6;
let x = PAD, maxH = 0, totalW = PAD;
const placed = [];
for (const [name, spr, w, h] of sheet) {
  checkSprite(name, spr, w, h);
  placed.push({ spr, x });
  x += w * SCALE + PAD;
  maxH = Math.max(maxH, h * SCALE);
}
totalW = x;

const cv = makeCanvas(totalW, maxH + PAD * 2);
for (let i = 0; i < cv.buf.length; i++) cv.buf[i] = 24;
for (const p of placed) blitSprite(cv, p.spr, p.x, PAD);

const outFile = path.join(OUT_DIR, GRAY ? 'sheet-gray.png' : 'sheet.png');
writePng(outFile, cv.w, cv.h, cv.buf);

if (errors.length) {
  console.log('ОШИБКИ:');
  for (const e of errors) console.log('  ' + e);
} else {
  console.log('размеры спрайтов в порядке (' + placed.length + ' шт.)');
}
console.log('→ ' + outFile);
