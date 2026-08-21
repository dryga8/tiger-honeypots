// spawner.js — генератор горшочков и сложность (разделы 8, 9).
// Спавнер намеренно создаёт конфликты: с растущей по счёту вероятностью
// вместо одиночки подставляет паттерн. Жёсткий лимит горшочков на поле.
window.Game = window.Game || {};

(function (Game) {
  const WINDOW_INTERVAL = 2; // тиков между спавн-окнами (пауза между волнами)
  const BAIT_DELAY = 2;      // выманивание: зелёный через 2 тика после красного

  // Минимальный интервал между вилками, в спавн-окнах.
  //
  // Одного веса мало. Частота вилок растёт по ходу партии сама, и растёт
  // круто: к 80 очкам в них терялось 12% всех зелёных против 1% в начале.
  // Складываются три вещи, и ни одна из них про вилку: вероятность паттерна
  // ползёт до потолка 0.55, лимит ханипотов растёт с 3 до 5 (вилке нужно два
  // свободных места — рано она часто не влезала и подменялась одиночкой,
  // поздно проходит всегда), а тик ускоряется до 230 мс. Вес против этого
  // бессилен: он-то постоянный.
  //
  // Интервал же бьёт именно туда, где больно: в ранней игре вилки и так
  // редки и до него не достают, а в поздней он ставит потолок частоты.
  const FORK_GAP = 14;

  let cooldown = 0;
  let forkCooldown = 0;
  let scheduled = []; // отложенные спавны: { at, chute, type }

  function reset() {
    cooldown = 0;
    forkCooldown = 0;
    scheduled = [];
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Лимит горшочков на поле: 3 на старте → до 5 к поздней игре (раздел 9).
  function maxPots(score) {
    if (score >= 80) return 5;
    if (score >= 40) return 4;
    return 3;
  }

  // Доля красных: 12% на старте → 22% к 100 очкам, дальше не растёт (раздел 8).
  function redFraction(score) {
    return 0.12 + 0.1 * (Math.min(score, 100) / 100);
  }

  // Вероятность подставить паттерн вместо одиночки — растёт со счётом.
  function patternProb(score) {
    return Math.min(0.55, score * 0.006);
  }

  // Желоба, свободные на шаге 0 (чтобы горшочки не накладывались).
  function freeChutes() {
    const st = Game.state;
    const busy = new Set(
      st.pots.filter((p) => p.step === 0).map((p) => p.chute)
    );
    const out = [];
    for (let c = 0; c < Game.CHUTE_COUNT; c++) {
      if (!busy.has(c)) out.push(c);
    }
    return out;
  }

  // Положить горшочек, если позволяет лимит и желоб свободен. → успех/нет.
  function tryPlace(chute, type) {
    const st = Game.state;
    if (st.pots.length >= maxPots(st.score)) return false;
    if (st.pots.some((p) => p.chute === chute && p.step === 0)) return false;
    Game.addPot(chute, type);
    return true;
  }

  // --- Паттерны ----------------------------------------------------------

  function spawnSingle(free, score) {
    const chute = pick(free);
    const type = Math.random() < redFraction(score) ? 'red' : 'green';
    Game.addPot(chute, type);
  }

  // Вилка: два зелёных, разрешающихся в один тик на разных желобах.
  function spawnFork(free, score) {
    // Нужно два свободных желоба и место в лимите под оба ханипота.
    if (free.length < 2 || Game.state.pots.length + 2 > maxPots(score)) {
      return spawnSingle(free, score);
    }
    const a = pick(free);
    const rest = free.filter((c) => c !== a);
    const b = pick(rest);
    Game.addPot(a, 'green');
    Game.addPot(b, 'green');
    // Интервал заводится только на состоявшейся вилке: если её подменили
    // одиночкой (выше), запирать следующую не за что.
    forkCooldown = FORK_GAP;
  }

  // Развилка внимания: красный и зелёный одновременно на противоположных
  // желобах (противоположный к c — это 3 - c при нашей индексации).
  function spawnAttention(free, score) {
    if (Game.state.pots.length + 2 > maxPots(score)) return spawnSingle(free, score);
    const pairs = free.filter((c) => free.includes(3 - c) && c < 3 - c);
    if (pairs.length === 0) return spawnSingle(free, score);
    const a = pick(pairs);
    const b = 3 - a;
    if (Math.random() < 0.5) {
      Game.addPot(a, 'red');
      Game.addPot(b, 'green');
    } else {
      Game.addPot(a, 'green');
      Game.addPot(b, 'red');
    }
  }

  // Выманивание: красный в желоб A, через 2 тика зелёный в тот же A.
  function spawnBait(free, score) {
    const chute = pick(free);
    Game.addPot(chute, 'red');
    scheduled.push({ at: Game.state.tick + BAIT_DELAY, chute, type: 'green' });
  }

  // Ложный красный: красный в желоб, где тигр уже стоит.
  function spawnFalseRed(free, score) {
    const st = Game.state;
    const tc = Game.posToChute(st.tiger.side, st.tiger.level);
    if (!free.includes(tc)) return spawnSingle(free, score);
    Game.addPot(tc, 'red');
  }

  // --- Выбор паттерна ----------------------------------------------------
  // Каталог: порог по счёту (раздел 9) и вес при жеребьёвке.
  //
  // Вес нужен из-за вилки. Это единственный паттерн с гарантированной
  // потерей: два зелёных разрешаются в один тик на разных желобах, тигр
  // может стоять только на одном, и полсердца уходит всегда, как ни играй.
  // Остальные три отыгрываются начисто, если не зевать, — они проверяют
  // внимание, а вилка просто забирает.
  //
  // При равном выборе вилка вдобавок била сильнее всего сразу после
  // разблокировки: на счёте 15–24 она была единственной парой к «развилке
  // внимания», то есть половиной всех паттернов. Вес 2 против 3 у остальных
  // убирает примерно четверть вилок на всех порогах, но не выводит их из
  // игры — это и есть ручка, которой дальше крутить частоту.
  const PATTERNS = [
    { spawn: spawnAttention, unlock: 10, weight: 3 },
    { spawn: spawnFork, unlock: 15, weight: 2 },
    { spawn: spawnBait, unlock: 25, weight: 3 },
    { spawn: spawnFalseRed, unlock: 30, weight: 3 },
  ];

  function pickWeighted(list) {
    let total = 0;
    for (const p of list) total += p.weight;
    let roll = Math.random() * total;
    for (const p of list) {
      roll -= p.weight;
      if (roll < 0) return p.spawn;
    }
    return list[list.length - 1].spawn; // страховка от ошибки округления
  }

  function choosePattern(score) {
    const eligible = PATTERNS.filter(function (p) {
      if (score < p.unlock) return false;
      // Вилка выбывает из жеребьёвки, пока не выдержан интервал.
      if (p.spawn === spawnFork && forkCooldown > 0) return false;
      return true;
    });
    if (eligible.length > 0 && Math.random() < patternProb(score)) {
      return pickWeighted(eligible);
    }
    return spawnSingle;
  }

  // --- Тик спавнера ------------------------------------------------------

  function onTick() {
    const st = Game.state;

    // 1) Отложенные спавны (выманивание). Не легло из-за лимита/занятости —
    //    даём один тик слака, потом бросаем.
    const pending = [];
    for (const job of scheduled) {
      if (job.at > st.tick) {
        pending.push(job);
      } else if (!tryPlace(job.chute, job.type) && st.tick <= job.at + 1) {
        pending.push(job);
      }
    }
    scheduled = pending;

    // 2) Спавн-окно с паузой между волнами.
    if (cooldown > 0) {
      cooldown -= 1;
      return;
    }
    if (st.pots.length >= maxPots(st.score)) return;

    const free = freeChutes();
    if (free.length === 0) return;

    // Интервал между вилками считается в спавн-окнах, а не в тиках: важно,
    // сколько волн прошло, а не сколько времени — время-то сжимается.
    if (forkCooldown > 0) forkCooldown -= 1;

    choosePattern(st.score)(free, st.score);
    cooldown = WINDOW_INTERVAL;
  }

  Game.Spawner = { reset, onTick };
})(window.Game);
