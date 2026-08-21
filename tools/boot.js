// boot.js — служебный прогон игры целиком (в игру не входит).
// Грузит все модули в том же порядке, что и index.html, с минимальными
// заглушками DOM, и крутит настоящий игровой цикл: так ловятся ошибки
// порядка загрузки и падения в тике/отрисовке, которых не видно в field.js.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VIEW_SCALE = 3; // «масштаб окна» для пересчёта координат клика

// --- заглушки DOM ---------------------------------------------------------
function makeCanvas(w, h) {
  const cv = {};
  let _w = 0, _h = 0;
  const realloc = () => { cv.data = new Uint8Array(_w * _h * 4); };
  Object.defineProperty(cv, 'width', { get: () => _w, set: (v) => { _w = v; realloc(); } });
  Object.defineProperty(cv, 'height', { get: () => _h, set: (v) => { _h = v; realloc(); } });
  cv.width = w; cv.height = h;
  cv.style = {};
  cv.listeners = {};
  cv.addEventListener = (name, fn) => { (cv.listeners[name] = cv.listeners[name] || []).push(fn); };
  cv.getBoundingClientRect = () => ({
    left: 0, top: 0, width: cv.width * VIEW_SCALE, height: cv.height * VIEW_SCALE,
  });
  cv.getContext = () => ({
    canvas: cv,
    fillStyle: '#000',
    font: '',
    textAlign: '',
    imageSmoothingEnabled: true,
    // Здесь важно только то, что игра не падает: пиксели проверяет field.js.
    save() {},
    restore() {},
    translate() {},
    fillRect() {},
    fillText() {},
    drawImage() {},
  });
  return cv;
}

const screen = makeCanvas(256, 192);
const listeners = {};
let rafQueue = [];

// Хранилище в памяти: рекорд должен переживать «перезагрузку страницы»,
// поэтому проверяем именно то, что игра пишет и читает (раздел 14).
const store = {};

global.document = {
  getElementById: (id) => (id === 'screen' ? screen : null),
  createElement: (tag) => (tag === 'canvas' ? makeCanvas(1, 1) : {}),
};
global.window = {
  innerWidth: 1280,
  innerHeight: 800,
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  },
  addEventListener: (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); },
  requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
};
global.requestAnimationFrame = global.window.requestAnimationFrame;

// Сеть в прогоне отключена намеренно, по двум причинам. Первая: проверять
// надо именно режим «без сети» — он обязателен по ТЗ, а живой сервер сделал
// бы прогон недетерминированным. Вторая и более важная: прогон доигрывает
// сотни партий, и без заглушки каждая улетала бы в настоящий рейтинг
// мусорным счётом. В node (18+) свой глобальный fetch, так что молчание
// само собой не получится — его надо поставить руками.
global.fetch = function () {
  return Promise.reject(new Error('сеть отключена в прогоне'));
};

// Жалобы api.js на отсутствие сети ожидаемы — считаем их, но не печатаем,
// иначе они зальют вывод. Всё остальное пропускаем как есть.
let netWarnings = 0;
const realWarn = console.warn;
console.warn = function () {
  if (typeof arguments[0] === 'string' && arguments[0].indexOf('[рейтинг]') === 0) {
    netWarnings += 1;
    return;
  }
  realWarn.apply(console, arguments);
};

// --- загрузка в порядке index.html ---------------------------------------
const ORDER = [
  'palette.js', 'backdrop.js', 'sprites.js', 'api.js', 'storage.js', 'profile.js',
  'leaderboard.js', 'sound.js', 'input.js',
  'state.js', 'spawner.js', 'render.js', 'main.js',
];
for (const f of ORDER) {
  new Function('window', fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'))(global.window);
}
const Game = global.window.Game;

// Экран, с которого игра поднялась: хранилище пустое, профиля нет, поэтому
// main.js обязан был открыть экран имени, а не онбординг.
const bootScreen = Game.state.screen;

// --- вспомогательное ------------------------------------------------------
let now = 0;
let failed = false;

function key(k) {
  for (const fn of listeners.keydown || []) fn({ key: k, repeat: false, preventDefault() {} });
}

// Клик приходит в координатах окна, поэтому логические умножаем на масштаб —
// ровно так же, как это делает браузер.
function click(lx, ly) {
  for (const fn of screen.listeners.click || []) {
    fn({ clientX: lx * VIEW_SCALE, clientY: ly * VIEW_SCALE });
  }
}

function step() {
  const fn = rafQueue.shift();
  if (!fn) throw new Error('цикл rAF оборвался');
  now += 16.7;
  fn(now);
}

function ok(what, cond) {
  console.log((cond ? '  ok   ' : '  ПРОВАЛ ') + what);
  if (!cond) { failed = true; process.exitCode = 1; }
}

// --- точечные проверки таблицы разрешения (разделы 5, 6) ------------------
// Горшочек разрешается после шага 3, поэтому кладём его сразу на шаг 3
// и делаем один тик. Экран ставим напрямую: Enter лишь копится в буфере ввода
// и разбирается внутри кадра, а тут кадров ещё нет.
function resolveOnce({ lives, streak, tiger, chute, type }) {
  Game.state.screen = 'playing';
  Game.state.tiger = tiger;
  Game.state.lives = lives;
  Game.state.streak = streak;
  Game.state.pots = [{ id: 999, chute, step: 3, type }];
  Game.tick();
  return { lives: Game.state.lives, streak: Game.state.streak };
}

function expect(what, got, want) {
  ok(`${what}: жизни ${got.lives}, стрик ${got.streak}`,
    got.lives === want.lives && got.streak === want.streak);
}

console.log('разрешение горшочков (раздел 5):');
expect('пропущен зелёный',
  resolveOnce({ lives: 8, streak: 5, tiger: { side: 'left', level: 'up' }, chute: 1, type: 'green' }),
  { lives: 7, streak: 0 });
expect('пойман красный',
  resolveOnce({ lives: 8, streak: 5, tiger: { side: 'left', level: 'up' }, chute: 0, type: 'red' }),
  { lives: 6, streak: 0 });
expect('красный мимо',
  resolveOnce({ lives: 8, streak: 5, tiger: { side: 'left', level: 'up' }, chute: 3, type: 'red' }),
  { lives: 8, streak: 5 });
expect('стрик добит на полном здоровье',
  resolveOnce({ lives: 10, streak: 9, tiger: { side: 'left', level: 'up' }, chute: 0, type: 'green' }),
  { lives: 10, streak: 0 });
expect('стрик добит с недобором',
  resolveOnce({ lives: 5, streak: 9, tiger: { side: 'left', level: 'up' }, chute: 0, type: 'green' }),
  { lives: 6, streak: 0 });

// --- эффекты попадания (разделы 5, 6) -------------------------------------
const fx = Game.state.fx;
function zeroFx() {
  fx.shake = 0; fx.flash = 0; fx.streakGlow = 0; fx.heartGlow = 0; fx.heartIndex = -1;
}
const HOME = { side: 'left', level: 'up' };

console.log('\nэффекты попадания (разделы 5, 6):');

zeroFx();
resolveOnce({ lives: 8, streak: 5, tiger: HOME, chute: 0, type: 'red' });
ok('пойманный красный даёт вспышку и тряску', fx.shake > 0 && fx.flash > 0);
ok('тряска укладывается в 3–4 кадра', fx.shake <= 4);

const shakeFrames = fx.shake;
for (let i = 0; i < shakeFrames; i++) Game.stepFx();
ok('тряска сама заканчивается', fx.shake === 0);

zeroFx();
resolveOnce({ lives: 4, streak: 9, tiger: HOME, chute: 0, type: 'green' });
ok('добитый стрик подсвечивает индикатор', fx.streakGlow > 0);
ok('подсвечено именно пополнившееся сердце (третье)',
  fx.heartGlow > 0 && fx.heartIndex === 2);

zeroFx();
resolveOnce({ lives: 10, streak: 9, tiger: HOME, chute: 0, type: 'green' });
ok('на полном здоровье сердце не подсвечивается — лечение сгорело',
  fx.streakGlow > 0 && fx.heartGlow === 0);

zeroFx();
resolveOnce({ lives: 8, streak: 5, tiger: HOME, chute: 3, type: 'red' });
ok('красный мимо тигра эффектов не даёт', fx.shake === 0 && fx.flash === 0);

// --- экраны, пауза 700 мс, клик, рекорд (раздел 11) -----------------------
Game.Input.consume();
Game.state.screen = 'onboarding';
console.log('\nэкраны (раздел 11):');

function btn(id) {
  return Game.ui.buttons.filter((b) => b.id === id)[0];
}
function clickButton(id) {
  const b = btn(id);
  if (!b) throw new Error('кнопки нет на экране: ' + id);
  click(b.x + b.w / 2, b.y + b.h / 2);
}

step(); // первый кадр: онбординг отрисован, кнопки получили координаты
const startBtn = Object.assign({}, btn('start'));
ok('на онбординге нарисована кнопка «НАЧАТЬ»', !!startBtn.w);
ok('на онбординге есть кнопка звука', !!btn('sound'));

// Клик мимо кнопки не должен запускать игру.
click(2, 2);
step();
ok('клик мимо кнопки игру не начинает', Game.state.screen === 'onboarding');

// Кнопка звука на том же экране переключает звук, а игру не начинает.
const wasMuted = Game.Sound.isMuted();
clickButton('sound');
step();
ok('клик по кнопке звука переключает звук', Game.Sound.isMuted() !== wasMuted);
ok('клик по кнопке звука игру не начинает', Game.state.screen === 'onboarding');
ok('состояние звука ушло в хранилище',
  store['honey-hour.muted'] === (Game.Sound.isMuted() ? '1' : '0'));

key('m'); // раздел 12: то же самое с клавиатуры
step();
ok('клавиша M переключает звук обратно', Game.Sound.isMuted() === wasMuted);

// Клик по кнопке — начинает.
click(startBtn.x + startBtn.w / 2, startBtn.y + startBtn.h / 2);
step();
ok('клик по кнопке начинает игру', Game.state.screen === 'playing');

// Доводим партию до конца: тигру в лапы красный при двух полусердцах.
Game.state.score = 42;
Game.state.lives = 2;
Game.state.tiger = { side: 'left', level: 'up' };
Game.state.pots = [{ id: 1000, chute: 0, step: 3, type: 'red' }];
let guard = 0;
while (Game.state.screen === 'playing' && guard++ < 200) step();
ok('жизни кончились — гейм-овер', Game.state.screen === 'gameover');

const overAt = now;
ok('рекорд записан в хранилище', store['honey-hour.best'] === '42');
ok('подпись про новый рекорд поднята', Game.state.newRecord === true);

// Первые 700 мс кнопка глухая — и к клавише, и к клику.
key('Enter');
step();
ok('сразу после гейм-овера ВВОД не срабатывает', Game.state.screen === 'gameover');

clickButton('start');
step();
ok('сразу после гейм-овера клик не срабатывает', Game.state.screen === 'gameover');

// А звук на паузе отключать можно: это не «продолжить», а настройка.
const mutedBeforePause = Game.Sound.isMuted();
clickButton('sound');
step();
ok('во время паузы кнопка звука всё равно работает',
  Game.Sound.isMuted() !== mutedBeforePause && Game.state.screen === 'gameover');
Game.Sound.setMuted(mutedBeforePause);

while (now - overAt < 700) step();
ok('700 мс ещё не прошло — экран прежний', Game.state.screen === 'gameover');

key(' '); // раздел 11: кнопка реагирует и на пробел
step();
ok('после паузы пробел начинает новую партию', Game.state.screen === 'playing');
ok('счёт сброшен, рекорд сохранён',
  Game.state.score === 0 && Game.state.best === 42);

// --- дальше — проверки, которым нужно дождаться промисов -------------------
// Экран имени и рейтинг ходят на сервер. В заглушках `fetch` нет вовсе, и это
// не изъян теста, а ровно тот режим, который игра обязана переживать: сети
// нет — играем дальше. Поэтому весь хвост прогона асинхронный.
(async function () {
  // Дать отработать всем накопившимся промисам.
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  console.log('\nэкран имени:');

  ok('первый заход открывает экран имени', bootScreen === 'name');

  Game.Input.consume();
  Game.gotoName();
  step();
  ok('при входе в фокусе поле имени', Game.Profile.draft.field === 'name');
  ok('кнопка ВПЕРЁД! нарисована', !!btn('go'));

  // Пока поля пусты, кнопка неактивна и жалуется на то поле, что виновато.
  clickButton('go');
  await settle();
  step();
  ok('с пустыми полями ВПЕРЁД! не пускает дальше', Game.state.screen === 'name');
  ok('подсвечено поле имени', Game.Profile.draft.badField === 'name');

  // Набор имени: регистр к верхнему, мусор не набирается вовсе.
  'полосатый'.split('').forEach((ch) => key(ch));
  key('!');
  key('#');
  step();
  ok('имя набирается в верхнем регистре, мусор отсеян',
    Game.Profile.draft.name === 'ПОЛОСАТЫЙ');
  ok('правка снимает подсветку ошибки', Game.Profile.draft.badField === null);

  // Пробел здесь — символ, а не «начать».
  key(' ');
  'кот'.split('').forEach((ch) => key(ch));
  step();
  ok('пробел печатается, а не начинает игру', Game.state.screen === 'name');
  ok('имя обрезано на 12 символах',
    Game.Profile.draft.name === 'ПОЛОСАТЫЙ КО' && Game.Profile.draft.name.length === 12);

  key('Backspace'); key('Backspace'); key('Backspace');
  step();
  ok('Backspace стирает', Game.Profile.draft.name === 'ПОЛОСАТЫЙ');

  // M на этом экране — буква, а не выключение звука.
  const mutedOnName = Game.Sound.isMuted();
  key('m');
  step();
  ok('M — буква, а не выключение звука',
    Game.Sound.isMuted() === mutedOnName && Game.Profile.draft.name === 'ПОЛОСАТЫЙM');
  key('Backspace');
  step();

  key('Tab');
  step();
  ok('ТАБ переключает поле', Game.Profile.draft.field === 'pin');

  '12а34'.split('').forEach((ch) => key(ch));
  step();
  ok('ПИН принимает только цифры и ровно четыре', Game.Profile.draft.pin === '1234');

  // Подтверждение: запрос уходит, кнопка на время запроса глухая.
  key('Enter');
  step();
  ok('пока идёт проверка — статус «проверяем»',
    Game.Profile.draft.status === 'checking');
  ok('во время проверки поля заморожены', (function () {
    const before = Game.Profile.draft.pin;
    key('9');
    return Game.Profile.draft.pin === before;
  })());

  await settle();
  step();
  ok('сети нет — игрок всё равно принят',
    Game.Profile.draft.status === 'offline' && Game.Profile.hasProfile());
  ok('имя и ПИН ушли в хранилище',
    store['honey-hour.name'] === 'ПОЛОСАТЫЙ' && store['honey-hour.pin'] === '1234');
  ok('экран имени ещё держится, чтобы показать надпись',
    Game.state.screen === 'name');

  await wait(Game.Profile.NOTICE_MS + 120);
  step();
  ok('после надписи игрок уходит на онбординг', Game.state.screen === 'onboarding');

  // Нормализация имени и границы проверок — без экрана, напрямую.
  ok('пробелы по краям режутся, внутренние схлопываются',
    Game.Profile.normalizeName('  тигр   полосатый  ') === 'ТИГР ПОЛОСАТЫЙ');
  ok('имя короче двух символов не проходит', !Game.Profile.nameValid('я'));
  ok('имя длиннее 12 символов не проходит', !Game.Profile.nameValid('ОЧЕНЬДЛИННОЕИМЯ'));
  ok('латиница и цифры в имени разрешены', Game.Profile.nameValid('tiger42'));
  ok('ПИН из трёх цифр не проходит', !Game.Profile.pinValid('123'));
  ok('ПИН из букв не проходит', !Game.Profile.pinValid('абвг'));

  // «СМЕНИТЬ» — второй и единственный другой вход на экран имени.
  ok('на онбординге есть «СМЕНИТЬ»', !!btn('change'));
  clickButton('change');
  step();
  ok('«СМЕНИТЬ» открывает экран имени', Game.state.screen === 'name');
  ok('в черновике текущее имя', Game.Profile.draft.name === 'ПОЛОСАТЫЙ');

  // Esc отменяет смену имени — теперь игроку есть куда возвращаться.
  key('Escape');
  step();
  ok('Esc уводит со смены имени обратно на онбординг',
    Game.state.screen === 'onboarding');

  // --- рейтинг -------------------------------------------------------------
  console.log('\nрейтинг:');

  ok('на онбординге есть кнопка РЕЙТИНГ', !!btn('rating'));
  clickButton('rating');
  step();
  ok('РЕЙТИНГ открывает свой экран', Game.state.screen === 'rating');
  ok('пока грузится — статус «загружаем»',
    Game.Leaderboard.board.status === 'loading');

  await settle();
  step();
  ok('без сети рейтинг честно говорит, что недоступен',
    Game.Leaderboard.board.status === 'error');

  key('Escape');
  step();
  ok('Esc возвращает на онбординг', Game.state.screen === 'onboarding');

  // С гейм-овера рейтинг обязан возвращать на гейм-овер, а не на онбординг:
  // иначе игрок теряет из виду свой результат.
  Game.state.screen = 'gameover';
  Game.state.score = 77;
  step();
  clickButton('rating');
  step();
  ok('с гейм-овера рейтинг тоже открывается', Game.state.screen === 'rating');
  clickButton('back');
  step();
  ok('«НАЗАД» возвращает именно на гейм-овер', Game.state.screen === 'gameover');
  ok('счёт партии на месте', Game.state.score === 77);

  // --- длительность партии -------------------------------------------------
  console.log('\nдлительность партии:');

  Game.Input.consume();
  Game.state.screen = 'playing';
  Game.state.score = 0;
  Game.advanceScreen(); // не сработает на playing — просто убеждаемся, что не сбросит
  Game.state.screen = 'onboarding';
  key('Enter');
  step();
  ok('партия началась', Game.state.screen === 'playing');
  ok('время старта засечено', Game.state.startedAt > 0);

  // Подменяем момент старта, чтобы не ждать реальных секунд.
  Game.state.startedAt = Date.now() - 12345;
  Game.state.lives = 2;
  Game.state.tiger = { side: 'left', level: 'up' };
  Game.state.pots = [{ id: 5000, chute: 0, step: 3, type: 'red' }];
  let guard2 = 0;
  while (Game.state.screen === 'playing' && guard2++ < 200) step();
  ok('гейм-овер наступил', Game.state.screen === 'gameover');
  ok('длительность партии посчитана в мс',
    Game.state.playedMs >= 12345 && Game.state.playedMs < 12345 + 5000);

  await settle();
  ok('отправка счёта без сети игру не роняет', Game.state.screen === 'gameover');

  // --- в рейтинг уходит рекорд, а не последняя партия ----------------------
  console.log('\nрекорд в рейтинге:');
  {
    const sent = [];
    const realSubmit = Game.Api.submitScore;
    Game.Api.submitScore = function (name, pin, score, ms) {
      sent.push({ score: score, ms: ms });
      return realSubmit.apply(null, arguments);
    };

    // Партия с рекордом.
    Game.state.best = 0;
    Game.state.bestMs = 0;
    Game.state.score = 120;
    Game.state.startedAt = Date.now() - 90000;
    Game.endGame();
    await settle();
    ok('рекорд уходит в рейтинг', sent.length === 1 && sent[0].score === 120);
    ok('вместе с длительностью той партии, где он поставлен',
      sent[0].ms >= 90000 && sent[0].ms < 95000);
    ok('длительность рекорда легла в хранилище',
      parseInt(store['honey-hour.bestMs'], 10) >= 90000);

    // Слабая партия следом: в таблицу всё равно должен уйти рекорд, иначе
    // одна неудачная игра стирала бы достижение из рейтинга.
    Game.state.score = 30;
    Game.state.startedAt = Date.now() - 20000;
    Game.endGame();
    await settle();
    ok('слабая партия повторяет рекорд, а не шлёт свой счёт',
      sent.length === 2 && sent[1].score === 120 && sent[1].ms >= 90000);

    // Пропавшая отправка чинится сама: следующий гейм-овер шлёт тот же рекорд.
    ok('каждый гейм-овер пересылает рекорд заново (самопочинка)',
      sent[0].score === sent[1].score);

    Game.Api.submitScore = realSubmit;
  }

  // --- длинный случайный прогон --------------------------------------------
  console.log('\nдлинный прогон:');
  const DIRS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  let frames = 0;
  let maxPots = 0;
  let minTick = Infinity;

  Game.state.screen = 'gameover';
  while (frames < 20000) {
    frames += 1;

    // Каждый пятый кадр — случайная стрелка, плюс иногда пачка подряд:
    // проверка «быстрое многократное нажатие не ломает состояние» (раздел 14).
    if (frames % 5 === 0) key(DIRS[Math.floor(Math.random() * 4)]);
    if (frames % 37 === 0) { key(DIRS[0]); key(DIRS[3]); key(DIRS[1]); key(DIRS[2]); }

    step();

    if (Game.state.screen === 'playing') {
      maxPots = Math.max(maxPots, Game.state.pots.length);
      minTick = Math.min(minTick, Game.currentTickMs());
      if (Game.state.lives < 0 || Game.state.lives > 10) {
        throw new Error('жизни вышли из диапазона 0..10: ' + Game.state.lives);
      }
      if (Game.state.streak < 0 || Game.state.streak >= 10) {
        throw new Error('стрик вне 0..9: ' + Game.state.streak);
      }
      const t = Game.state.tiger;
      if (!['left', 'right'].includes(t.side) || !['up', 'down'].includes(t.level)) {
        throw new Error('позиция тигра повреждена: ' + JSON.stringify(t));
      }
      for (const p of Game.state.pots) {
        if (!Game.geometry.STEP_POS[p.chute] || !Game.geometry.STEP_POS[p.chute][p.step]) {
          throw new Error('ханипот вне геометрии: ' + JSON.stringify(p));
        }
      }
    }

    // Дошли до гейм-овера — ждём паузу и начинаем заново.
    if (Game.state.screen === 'gameover' && frames % 60 === 0) key('Enter');
  }

  // --- «перезагрузка страницы» (раздел 14) ----------------------------------
  // Поднимаем игру с нуля поверх того же хранилища: рекорд должен подхватиться
  // при старте, а не остаться нулём.
  console.log('\nперезагрузка страницы:');
  {
    const before = store['honey-hour.best'];
    const win2 = {
      innerWidth: 1280,
      innerHeight: 800,
      localStorage: global.window.localStorage, // то же хранилище, что и было
      addEventListener() {},
      requestAnimationFrame: () => 1,
    };
    const savedRaf = global.requestAnimationFrame;
    global.requestAnimationFrame = win2.requestAnimationFrame;
    for (const f of ORDER) {
      new Function('window', fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'))(win2);
    }
    global.requestAnimationFrame = savedRaf;

    ok(`рекорд ${before} подхватился после перезапуска`,
      String(win2.Game.state.best) === String(before) && win2.Game.state.best > 0);

    ok('имя подхватилось после перезапуска',
      win2.Game.Profile.profile.name === 'ПОЛОСАТЫЙ' &&
      win2.Game.Profile.profile.pin === '1234');
    ok('с сохранённым профилем экран имени больше не показывается',
      win2.Game.state.screen === 'onboarding');
  }

  console.log('');
  console.log('  кадров прогнано:    ' + frames);
  console.log('  максимум ханипотов: ' + maxPots + ' (лимит по ТЗ — 5)');
  console.log('  минимальный тик:    ' + minTick + ' мс (нижняя граница — 230)');
  console.log('  рекорд в хранилище: ' + store['honey-hour.best']);
  console.log('  сеть недоступна:    ' + netWarnings + ' раз (так и задумано)');
  console.log(failed ? '\nЕСТЬ ПРОВАЛЫ.' : '\nвсё сошлось.');
})();
