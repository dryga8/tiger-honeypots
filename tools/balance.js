// balance.js — замер баланса вилок (в игру не входит).
//
// Вилка (два зелёных в один тик на разных желобах) — единственный паттерн с
// гарантированной потерей: как ни играй, полсердца уходит. Частоту вилок
// нельзя оценить на глаз — этот скрипт её считает.
//
// Игрок в симуляции ведётся оптимально в пределах одного тика: перед
// разрешением встаёт под зелёный, который вот-вот доедет, а если едут только
// красные — уходит с занятого желоба. Значит все потери, которые он всё-таки
// несёт, вынужденные, и это ровно вилки.
//
//   node tools/balance.js
//   node tools/balance.js --spawner путь/к/другому/spawner.js   # сравнить версии
//   GAMES=1000 node tools/balance.js                            # точнее

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GAMES = Number(process.env.GAMES) || 400;

const argIdx = process.argv.indexOf('--spawner');
const spawnerPath = argIdx >= 0 && process.argv[argIdx + 1]
  ? path.resolve(process.argv[argIdx + 1])
  : path.join(ROOT, 'src/spawner.js');

// Сеть отключена: замер прогоняет сотни партий, и каждый гейм-овер иначе
// улетал бы в настоящий рейтинг. У node (18+) есть свой fetch, молчание надо
// ставить руками.
global.fetch = function () {
  return Promise.reject(new Error('сеть отключена в замере'));
};
console.warn = function () {};

// --- загрузка игровых модулей --------------------------------------------
// Отрисовка не нужна, поэтому берём только логику; document подменяется
// заглушкой ради запекания спрайтов в render-независимых модулях.
global.document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({ fillRect() {}, drawImage() {} }),
  }),
};

const win = { localStorage: { getItem: () => null, setItem() {} } };
for (const f of ['palette.js', 'sprites.js', 'storage.js', 'profile.js', 'sound.js', 'state.js']) {
  new Function('window', fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'))(win);
}
new Function('window', fs.readFileSync(spawnerPath, 'utf8'))(win);

const Game = win.Game;
Game.Sound.init();
Game.Sound.setMuted(true);

const NAMES = [['left', 'up'], ['left', 'down'], ['right', 'up'], ['right', 'down']];

// Разбивка по счёту — главная таблица этого замера.
//
// Среднее по партии обманывает: оно смешивает начало, где вилок почти нет,
// с концом, где их втрое-вчетверо больше. Один раз на это уже наступили —
// средние 8.7% прятали 12.4% в поздней игре, а игроку неприятно именно там,
// потому что там же и самый быстрый тик.
const BANDS = [[0, 19], [20, 39], [40, 59], [60, 79], [80, 99], [100, 139], [140, 1e9]];
const bandForks = BANDS.map(() => 0);
const bandGreens = BANDS.map(() => 0);

function bandOf(score) {
  for (let i = 0; i < BANDS.length; i++) {
    if (score >= BANDS[i][0] && score <= BANDS[i][1]) return i;
  }
  return BANDS.length - 1;
}

function playGame() {
  const S = Game.state;
  S.screen = 'playing';
  S.tick = 0;
  S.pots = [];
  S.tiger = { side: 'left', level: 'up' };
  S.score = 0;
  S.lives = 10;
  S.streak = 0;
  Game.Spawner.reset();

  let forks = 0;       // тиков, где к разрешению шло 2+ зелёных
  let forcedMiss = 0;  // сколько зелёных при этом терялось неизбежно
  let greens = 0;      // всего разрешившихся зелёных
  let maxPots = 0;

  const GUARD = 5000; // потолок тиков на партию, чтобы замер не завис
  let guard = 0;
  while (S.screen === 'playing' && guard++ < GUARD) {
    const due = S.pots.filter((p) => p.step === 3);
    const dueGreen = due.filter((p) => p.type === 'green');

    if (dueGreen.length) {
      // Больше одного зелёного за тик всё равно не поймать — встаём под первый.
      const n = NAMES[dueGreen[0].chute];
      S.tiger = { side: n[0], level: n[1] };
      greens += dueGreen.length;
      const b = bandOf(S.score);
      bandGreens[b] += dueGreen.length;
      if (dueGreen.length > 1) {
        forks += 1;
        forcedMiss += dueGreen.length - 1;
        bandForks[b] += dueGreen.length - 1;
      }
    } else if (due.length) {
      // Едут только красные: уходим на любой свободный желоб.
      const busy = due.map((p) => p.chute);
      for (let c = 0; c < 4; c++) {
        if (busy.indexOf(c) < 0) {
          S.tiger = { side: NAMES[c][0], level: NAMES[c][1] };
          break;
        }
      }
    }

    Game.tick();
    maxPots = Math.max(maxPots, S.pots.length);
  }

  // Упёрлись в потолок — партия не кончилась сама. Это не мелочь: такой
  // «игрок» уворачивается ещё и от красных, и при редких вилках лечение за
  // стрик догоняет потери. Тогда средний счёт — не результат, а потолок.
  return { score: S.score, forks, forcedMiss, greens, maxPots, capped: guard >= GUARD };
}

let score = 0, forks = 0, forcedMiss = 0, greens = 0, maxPots = 0, capped = 0;
for (let i = 0; i < GAMES; i++) {
  const r = playGame();
  if (r.capped) capped += 1;
  score += r.score;
  forks += r.forks;
  forcedMiss += r.forcedMiss;
  greens += r.greens;
  maxPots = Math.max(maxPots, r.maxPots);
}

console.log('спавнер: ' + path.relative(ROOT, spawnerPath));
console.log('партий идеального игрока: ' + GAMES);
console.log('');
console.log('  средний счёт:              ' + (score / GAMES).toFixed(1));
console.log('  вилок за партию:           ' + (forks / GAMES).toFixed(2));
console.log('  вилок на 100 очков:        ' + (100 * forks / Math.max(1, score)).toFixed(2));
console.log('  вынужденных потерь/партию: ' + (forcedMiss / GAMES).toFixed(2) +
  ' (= ' + (forcedMiss / GAMES / 2).toFixed(2) + ' сердца)');
console.log('  доля зелёных в вилках:     ' +
  (100 * forcedMiss / Math.max(1, greens)).toFixed(1) + '%');
console.log('  максимум ханипотов:        ' + maxPots + ' (лимит по ТЗ — 5)');
if (capped) {
  console.log('');
  console.log('  ВНИМАНИЕ: ' + capped + ' из ' + GAMES + ' партий не кончились сами,');
  console.log('  а упёрлись в потолок замера. Средний счёт выше — не результат,');
  console.log('  а этот потолок; смотреть надо на таблицу по диапазонам.');
}
console.log('');
console.log('доля зелёных, теряемых в вилках, по ходу партии:');
console.log('  счёт        зелёных   потеряно   доля');
for (let i = 0; i < BANDS.length; i++) {
  if (!bandGreens[i]) continue;
  const hi = BANDS[i][1] >= 1e9 ? '+' : '-' + BANDS[i][1];
  const label = (BANDS[i][0] + hi).padEnd(12);
  const share = (100 * bandForks[i] / bandGreens[i]).toFixed(1) + '%';
  console.log('  ' + label + String(bandGreens[i]).padEnd(10) +
    String(bandForks[i]).padEnd(11) + share);
}
