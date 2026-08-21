// field.js — служебный просмотр игрового поля (в игру не входит).
// Подсовывает настоящему render.js минимальный поддельный canvas и снимает
// то, что игра реально рисует, в PNG. Так проверяется композиция целиком,
// а не спрайты по отдельности.
//
//   node field.js          — обычный вид
//   node field.js --gray   — в оттенках серого (проверка раздела 14)

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = require('path').join(__dirname, '..');
const GRAY = process.argv.includes('--gray');
const SCALE = Number(process.env.SCALE) || 3; // ×3 — минимальный масштаб, на котором ТЗ требует читаемости

// --- поддельный canvas ----------------------------------------------------
function parseColor(css) {
  const n = parseInt(String(css).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function makeCanvas(w, h) {
  const cv = {};
  // Настоящий canvas пересоздаёт буфер при записи в width/height, и render.js
  // на это рассчитывает: создаёт элемент, а размер ставит уже потом.
  let _w = 0, _h = 0;
  const realloc = () => { cv.data = new Uint8Array(_w * _h * 4); }; // alpha 0 = прозрачно
  Object.defineProperty(cv, 'width', {
    get: () => _w,
    set: (v) => { _w = v; realloc(); },
  });
  Object.defineProperty(cv, 'height', {
    get: () => _h,
    set: (v) => { _h = v; realloc(); },
  });
  cv.width = w;
  cv.height = h;
  cv.getContext = () => {
    // Сдвиг системы координат: им поле трясётся на пойманном красном.
    let tx = 0, ty = 0;
    const stack = [];
    const ctx = {
      canvas: cv,
      fillStyle: '#000000',
      imageSmoothingEnabled: true,
      save() { stack.push([tx, ty]); },
      restore() { const s = stack.pop(); if (s) { tx = s[0]; ty = s[1]; } },
      translate(dx, dy) { tx += dx; ty += dy; },
      fillRect(x, y, rw, rh) {
        const [r, g, b] = parseColor(ctx.fillStyle);
        x = Math.round(x + tx); y = Math.round(y + ty);
        for (let yy = y; yy < y + rh; yy++) {
          for (let xx = x; xx < x + rw; xx++) {
            if (xx < 0 || yy < 0 || xx >= cv.width || yy >= cv.height) continue;
            const i = (yy * cv.width + xx) * 4;
            cv.data[i] = r; cv.data[i + 1] = g; cv.data[i + 2] = b; cv.data[i + 3] = 255;
          }
        }
      },
      drawImage(img, dx, dy) {
        dx = Math.round(dx + tx); dy = Math.round(dy + ty);
        for (let yy = 0; yy < img.height; yy++) {
          for (let xx = 0; xx < img.width; xx++) {
            const si = (yy * img.width + xx) * 4;
            if (img.data[si + 3] === 0) continue; // прозрачный пиксель спрайта
            const tx = dx + xx, ty = dy + yy;
            if (tx < 0 || ty < 0 || tx >= cv.width || ty >= cv.height) continue;
            const ti = (ty * cv.width + tx) * 4;
            cv.data[ti] = img.data[si];
            cv.data[ti + 1] = img.data[si + 1];
            cv.data[ti + 2] = img.data[si + 2];
            cv.data[ti + 3] = 255;
          }
        }
      },
    };
    return ctx;
  };
  return cv;
}

// --- загрузка игровых модулей --------------------------------------------
const win = {
  Game: {},
  document: { createElement: (tag) => (tag === 'canvas' ? makeCanvas(1, 1) : {}) },
};
// render.js обращается к document как к глобали, а не к window.document
global.document = win.document;

function load(file) {
  new Function('window', fs.readFileSync(path.join(ROOT, 'src', file), 'utf8'))(win);
}
// Порядок как в index.html — иначе проверяем не то, что запускается.
win.localStorage = { getItem: () => null, setItem: () => {} };
load('palette.js');
  load('backdrop.js');
load('sprites.js');
load('storage.js');
  load('api.js');
  load('profile.js');
  load('leaderboard.js');
load('sound.js');
load('state.js');
load('render.js');
const Game = win.Game;
Game.Sound.init();
if (process.env.BACKDROP) Game.Backdrop.setStyle(process.env.BACKDROP);

// --- сцена для снимка -----------------------------------------------------
// Тигр ловит зелёный на своём желобе, на остальных — горшочки на разных шагах,
// чтобы разом увидеть и дальний, и ближний край желоба.
Game.state.screen = 'playing';
Game.state.score = 47;
Game.state.lives = 7;  // 3 сердца + половина
Game.state.streak = 6;

function scene(side, level) {
  Game.state.tiger = { side, level };
  const home = Game.posToChute(side, level);
  Game.state.pots = [
    { id: 1, chute: home, step: 3, type: 'green' },
    { id: 2, chute: (home + 1) % 4, step: 1, type: 'red' },
    { id: 3, chute: (home + 2) % 4, step: 0, type: 'green' },
    { id: 4, chute: (home + 3) % 4, step: 2, type: 'red' },
  ];
  const cv = makeCanvas(256, 192);
  Game.renderPlaying(cv.getContext('2d'));
  return cv;
}

// Склейка нескольких кадров 256×192 в один лист.
function sheet(parts, cols) {
  const rows = Math.ceil(parts.length / cols);
  const cv = makeCanvas(256 * cols, 192 * rows);
  parts.forEach((src, i) => {
    const ox = (i % cols) * 256;
    const oy = Math.floor(i / cols) * 192;
    for (let y = 0; y < 192; y++) {
      for (let x = 0; x < 256; x++) {
        const si = (y * 256 + x) * 4;
        const di = ((oy + y) * cv.width + (ox + x)) * 4;
        cv.data[di] = src.data[si];
        cv.data[di + 1] = src.data[si + 1];
        cv.data[di + 2] = src.data[si + 2];
        cv.data[di + 3] = 255;
      }
    }
  });
  return cv;
}

// --all     — все четыре позиции тигра: каждая поза должна тянуться к своему
//             желобу, а голова и корпус — стоять на месте (раздел 10).
// --screens — онбординг и гейм-овер, включая заблокированную кнопку первых
//             700 мс и подпись про новый рекорд (раздел 11).
// --fx      — кадры эффектов: обычный, вспышка с тряской на пойманном
//             красном, подсветка добитого стрика, отключённый звук.
const ALL = process.argv.includes('--all');
const SCREENS = process.argv.includes('--screens');
const FX = process.argv.includes('--fx');
const BACKDROPS = process.argv.includes('--backdrops');

function screenShot(draw) {
  const cv = makeCanvas(256, 192);
  draw(cv.getContext('2d'));
  return cv;
}

let screen;
if (ALL) {
  screen = sheet([
    scene('left', 'up'), scene('right', 'up'),
    scene('left', 'down'), scene('right', 'down'),
  ], 2);
} else if (SCREENS) {
  // Профиль подставляем руками: в field.js хранилище пустое, а онбординг
  // должен показать и строку «ТЫ: ИМЯ», и вид без неё.
  Game.Profile.profile.name = 'ПОЛОСАТЫЙ';
  Game.Profile.profile.pin = '4271';

  Game.state.best = 128;
  const onboarding = screenShot((c) => Game.renderOnboarding(c));

  // Онбординг без имени — так он выглядит, если профиль почему-то не поднялся.
  Game.Profile.profile.name = '';
  Game.Profile.profile.pin = '';
  Game.state.best = 0;
  const firstRun = screenShot((c) => Game.renderOnboarding(c));

  // Экран имени: пустой (первый заход) и заполненный, с активным полем ПИН.
  Game.Profile.beginEdit();
  const nameEmpty = screenShot((c) => Game.renderName(c, true));

  // DRAFT=... подставляет в поле любую строку: так проверяются глифы,
  // которых в русских надписях нет (латиница, цифры).
  Game.Profile.draft.name = process.env.DRAFT || 'ПОЛОСАТЫЙ';
  Game.Profile.draft.pin = '42';
  Game.Profile.draft.field = 'pin';
  const nameTyping = screenShot((c) => Game.renderName(c, true));

  // Ответ сервера «имя занято»: подсветка поля и сообщение на двух строках.
  Game.Profile.draft.pin = '4271';
  Game.Profile.draft.status = 'bad';
  Game.Profile.draft.badField = 'name';
  Game.Profile.draft.field = 'name';
  Game.Profile.draft.message = ['ТАКОЙ ТИГР УЖЕ ЕСТЬ В ИГРЕ,', 'ПРИДУМАЙ ДРУГОЕ ИМЯ'];
  const nameTaken = screenShot((c) => Game.renderName(c, false));

  // Запрос в пути: кнопка глухая и говорит, чего ждём.
  Game.Profile.draft.status = 'checking';
  Game.Profile.draft.badField = null;
  Game.Profile.draft.message = [];
  const nameChecking = screenShot((c) => Game.renderName(c, false));

  // Рейтинг с данными. Сеть в field.js не трогаем — кладём строки напрямую.
  Game.Profile.profile.name = 'ПОЛОСАТЫЙ';
  Game.Profile.profile.pin = '4271';
  const board = Game.Leaderboard.board;
  board.status = 'ready';
  board.rows = [
    { place: 1, player: 'KATYA', score: 142, isMe: false },
    { place: 2, player: 'ТИГРИЦА', score: 98, isMe: false },
    { place: 3, player: 'МУРЗИК', score: 91, isMe: false },
    { place: 4, player: 'BARSIK 7', score: 88, isMe: false },
    { place: 5, player: 'ЛАПА', score: 74, isMe: false },
    { place: 6, player: 'RUSTY', score: 69, isMe: false },
    { place: 7, player: 'ПОЛОСКА', score: 61, isMe: false },
    { place: 8, player: 'ТАЙГА', score: 57, isMe: false },
    { place: 9, player: 'SHERE KHAN', score: 52, isMe: false },
    { place: 10, player: 'КОТЛЕТА', score: 48, isMe: false },
  ];
  board.me = { place: 24, player: 'ПОЛОСАТЫЙ', score: 41, isMe: true };
  const ratingOut = screenShot((c) => Game.renderRating(c));

  // Тот же рейтинг, но игрок в десятке: отдельной строки «ТЫ:» быть не должно.
  board.rows[6] = { place: 7, player: 'ПОЛОСАТЫЙ', score: 61, isMe: true };
  board.me = null;
  const ratingIn = screenShot((c) => Game.renderRating(c));

  board.status = 'error';
  const ratingError = screenShot((c) => Game.renderRating(c));

  Game.state.best = 128;
  Game.state.score = 47;
  Game.state.newRecord = false;
  const gameoverLocked = screenShot((c) => Game.renderGameover(c, false));

  Game.state.score = 214;
  Game.state.best = 214;
  Game.state.newRecord = true;
  const gameoverRecord = screenShot((c) => Game.renderGameover(c, true));

  screen = sheet([
    onboarding, firstRun,
    nameEmpty, nameTyping,
    nameTaken, nameChecking,
    ratingOut, ratingIn,
    ratingError, gameoverLocked,
    gameoverRecord,
  ], 2);
} else if (BACKDROPS) {
  // Одна и та же сцена со всеми задниками: сравнивать имеет смысл только
  // так, потому что вопрос не «красиво ли», а «не мешает ли игре».
  const shots = Game.Backdrop.STYLES.map((name) => {
    Game.Backdrop.setStyle(name);
    return scene('left', 'up');
  });
  Game.Backdrop.setStyle('library');
  screen = sheet(shots, 2);
} else if (FX) {
  const fx = Game.state.fx;
  const zero = () => {
    fx.shake = 0; fx.flash = 0; fx.streakGlow = 0; fx.heartGlow = 0; fx.heartIndex = -1;
  };

  zero();
  const plain = scene('left', 'up');

  // Пойманный красный: тигр стоит там же, где красный горшочек.
  zero();
  fx.shake = 3; fx.flash = 5;
  Game.state.lives = 5;
  const hit = scene('left', 'up');

  // Добитый стрик: индикатор вспыхнул, третье сердце пополнилось.
  zero();
  fx.streakGlow = 20; fx.heartGlow = 20; fx.heartIndex = 2;
  Game.state.lives = 5;
  Game.state.streak = 0;
  const streak = scene('right', 'down');

  zero();
  Game.state.lives = 7;
  Game.state.streak = 6;
  Game.Sound.setMuted(true);
  const muted = scene('left', 'down');
  Game.Sound.setMuted(false);

  screen = sheet([plain, hit, streak, muted], 2);
} else {
  screen = scene('left', 'up');
}
const OUT_W = screen.width;
const OUT_H = screen.height;

// --- вывод в PNG ----------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const W = OUT_W * SCALE, H = OUT_H * SCALE;
const rgb = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const si = (Math.floor(y / SCALE) * OUT_W + Math.floor(x / SCALE)) * 4;
    let r = screen.data[si], g = screen.data[si + 1], b = screen.data[si + 2];
    if (GRAY) { const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b); r = g = b = l; }
    const di = (y * W + x) * 3;
    rgb[di] = r; rgb[di + 1] = g; rgb[di + 2] = b;
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
const raw = Buffer.alloc(H * (W * 3 + 1));
for (let y = 0; y < H; y++) {
  rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
}
const out = path.join(__dirname, (ALL?'poses':SCREENS?'screens':FX?'fx':'field')+(GRAY?'-gray':'')+'.png');
fs.writeFileSync(out, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]));
console.log('→ ' + out);
