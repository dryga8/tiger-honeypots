// state.js — состояние игры и тик логики.
// Этап 3: тигр { side, level } и мгновенное перемещение стрелками (раздел 4).
// Этап 4: разрешение горшочков, жизни, стрик (разделы 5, 6).
// Этап 5: длительность тика зависит от счёта (раздел 8); спавн — в spawner.js.
window.Game = window.Game || {};

(function (Game) {
  const SCREENS = {
    NAME: 'name',           // экран «представься»: имя и ПИН
    ONBOARDING: 'onboarding',
    PLAYING: 'playing',
    GAMEOVER: 'gameover',
    RATING: 'rating',       // таблица результатов; открывается с двух экранов
  };

  const CHUTE_COUNT = 4; // 0=верх-лево, 1=низ-лево, 2=верх-право, 3=низ-право
  const STEP_COUNT = 4;  // шаги 0..3, дальше — разрешение

  // Жизни считаем в полусердцах: 10 = 5 сердец (раздел 6).
  const LIVES_MAX = 10;
  const LIVES_START = 10;
  const STREAK_TARGET = 10; // 10 зелёных подряд → +0,5 сердца

  // Кривая сложности (раздел 8): тик ×0,94 каждые 5 очков, но не ниже 230 мс.
  const TICK_BASE = 550;
  const TICK_MIN = 230;
  const TICK_DECAY = 0.94;
  const SCORE_STEP = 5;

  // Эффекты попадания (разделы 5, 6). Считаются в кадрах, а не в тиках:
  // ТЗ задаёт тряску «на 3–4 кадра», и она должна быть одинаковой независимо
  // от того, насколько разогналась игра.
  const SHAKE_FRAMES = 4;
  const FLASH_FRAMES = 6;
  const GLOW_FRAMES = 24;

  const fx = {
    shake: 0,       // кадров тряски поля
    flash: 0,       // кадров красной вспышки
    streakGlow: 0,  // кадров подсветки индикатора стрика
    heartGlow: 0,   // кадров подсветки пополненного сердца
    heartIndex: -1, // какое из пяти сердец пополнилось
  };

  function clearFx() {
    fx.shake = 0;
    fx.flash = 0;
    fx.streakGlow = 0;
    fx.heartGlow = 0;
    fx.heartIndex = -1;
  }

  // Отсчёт эффектов идёт по кадрам, поэтому дёргается из цикла, а не из тика.
  function stepFx() {
    if (fx.shake > 0) fx.shake -= 1;
    if (fx.flash > 0) fx.flash -= 1;
    if (fx.streakGlow > 0) fx.streakGlow -= 1;
    if (fx.heartGlow > 0) fx.heartGlow -= 1;
  }

  const state = {
    screen: SCREENS.ONBOARDING,
    tick: 0,      // сколько дискретных тиков прошло на экране playing
    pots: [],     // активные горшочки { id, chute, step, type }
    tiger: null,  // { side, level }
    score: 0,
    lives: LIVES_START, // в полусердцах, 0..10
    streak: 0,          // зелёных подряд, 0..9 (на 10 срабатывает и обнуляется)
    best: 0,            // рекорд из localStorage, грузится при старте (main.js)
    newRecord: false,   // рекорд побит в этой партии — отдельная подпись
    startedAt: 0,       // Date.now() на старте партии
    playedMs: 0,        // длительность партии, мс; уходит в submit_score
    fx,                 // счётчики эффектов, отсчитываются в кадрах
  };

  let nextId = 1;

  // (side, level) → индекс желоба. Соответствие индексации раздела 3.
  function posToChute(side, level) {
    return (side === 'right' ? 2 : 0) + (level === 'down' ? 1 : 0);
  }

  // Текущая длительность тика по счёту (раздел 8). Читается циклом каждый тик.
  function currentTickMs() {
    const steps = Math.floor(state.score / SCORE_STEP);
    return Math.max(TICK_MIN, Math.round(TICK_BASE * Math.pow(TICK_DECAY, steps)));
  }

  // Добавить горшочек на поле (шаг 0). Управление id — здесь; спавнер решает
  // что и куда класть (spawner.js), а лимиты/капасити проверяет он же.
  function addPot(chute, type) {
    state.pots.push({ id: nextId++, chute, step: 0, type });
  }

  // Мгновенный переход тигра по нажатию стрелки (раздел 4).
  // Нажатие, ничего не меняющее (например left, когда уже слева), просто
  // не меняет позицию.
  function moveTiger(dir) {
    const t = state.tiger;
    if (!t) return;
    if (dir === 'left') t.side = 'left';
    else if (dir === 'right') t.side = 'right';
    else if (dir === 'up') t.level = 'up';
    else if (dir === 'down') t.level = 'down';
  }

  // Сбросить игровое поле при входе в playing. Рекорд (best) переживает
  // партию — сбрасывается только счёт и подпись «новый рекорд».
  function resetPlay() {
    state.tick = 0;
    state.pots = [];
    state.tiger = { side: 'left', level: 'up' };
    state.score = 0;
    state.lives = LIVES_START;
    state.streak = 0;
    state.newRecord = false;
    // Длительность партии нужна серверу, чтобы отсеивать невозможные счета.
    // Время берём стенное (Date.now), а не игровое: цикл считает кадры, а
    // здесь важны реальные секунды.
    state.startedAt = Date.now();
    state.playedMs = 0;
    clearFx();
    nextId = 1;
    Game.Spawner.reset();
  }

  // Конец партии. Рекорд обновляется здесь, а не в цикле: так он попадает
  // в localStorage любым путём, каким бы игра ни закончилась.
  function endGame() {
    state.screen = SCREENS.GAMEOVER;
    state.playedMs = Math.max(0, Date.now() - state.startedAt);

    // Локальный рекорд пишется всегда и первым: он не зависит от сети и
    // показывается на онбординге мгновенно.
    if (state.score > state.best) {
      state.best = state.score;
      state.newRecord = true;
      Game.Storage.saveBest(state.best);
    } else {
      state.newRecord = false;
    }

    // Счёт уходит в рейтинг молча и не блокируя: ни ждать ответа, ни
    // показывать ошибку игроку не нужно — всё, что пошло не так, в консоли.
    if (Game.Profile.hasProfile()) {
      Game.Api.submitScore(
        Game.Profile.profile.name,
        Game.Profile.profile.pin,
        state.score,
        state.playedMs
      );
    }
  }

  // Разрешение одного горшочка после шага 3 (раздел 5).
  // Ловля зависит только от того, стоит ли тигр на этом желобе.
  function resolvePot(p) {
    const onChute =
      Game.posToChute(state.tiger.side, state.tiger.level) === p.chute;

    if (p.type === 'green') {
      if (onChute) {
        state.score += 1;
        state.streak += 1;
        Game.Sound.play('catch');
        if (state.streak >= STREAK_TARGET) {
          state.streak = 0;
          // +0,5 сердца, но не выше 5 сердец — лишнее лечение сгорает.
          const before = state.lives;
          state.lives = Math.min(LIVES_MAX, before + 1);
          // Подсветка индикатора — всегда, подсветка сердца — только если
          // оно правда пополнилось: на полном здоровье лечение сгорает,
          // и подсвечивать было бы нечего.
          fx.streakGlow = GLOW_FRAMES;
          if (state.lives > before) {
            fx.heartIndex = Math.floor(before / 2);
            fx.heartGlow = GLOW_FRAMES;
          }
          Game.Sound.play('streak');
        }
      } else {
        state.lives = Math.max(0, state.lives - 1); // пропущен зелёный: −0,5
        state.streak = 0;
        Game.Sound.play('miss');
      }
    } else {
      // red
      if (onChute) {
        state.lives = Math.max(0, state.lives - 2); // пойман красный: −1 сердце
        state.streak = 0;
        // Вспышка и тряска: игрок должен понять, что это была именно его
        // ошибка, а не просто «жизнь куда-то делась» (раздел 5).
        fx.shake = SHAKE_FRAMES;
        fx.flash = FLASH_FRAMES;
        Game.Sound.play('red');
      }
      // красный в другом месте — ничего, стрик не трогаем.
    }
  }

  // Один дискретный тик логики.
  function tick() {
    if (state.screen !== SCREENS.PLAYING) return;

    state.tick += 1;

    // Сдвигаем каждый горшочек на шаг; всё, что прошло шаг 3, — разрешаем.
    const survivors = [];
    for (const p of state.pots) {
      p.step += 1;
      if (p.step < STEP_COUNT) survivors.push(p);
      else resolvePot(p);
    }
    state.pots = survivors;

    // Жизни кончились → конец игры (раздел 6). Счёт сохраняем для гейм-овера.
    if (state.lives <= 0) {
      endGame();
      return;
    }

    Game.Spawner.onTick();
  }

  // Кнопка экрана: onboarding → playing и gameover → playing.
  // Во время игры подтверждение ничего не делает — партия кончается только
  // по жизням. (На каркасе Enter обрывал партию; это была заглушка.)
  // С гейм-овера «сыграть ещё раз» ведёт сразу в игру: экран имени
  // показывается только при первом заходе и по «СМЕНИТЬ».
  function advanceScreen() {
    if (state.screen === SCREENS.ONBOARDING || state.screen === SCREENS.GAMEOVER) {
      state.screen = SCREENS.PLAYING;
      resetPlay();
    }
  }

  // Экран имени: вход по первому заходу или по «СМЕНИТЬ» на онбординге.
  function gotoName() {
    Game.Profile.beginEdit();
    state.screen = SCREENS.NAME;
  }

  function gotoOnboarding() {
    state.screen = SCREENS.ONBOARDING;
  }

  // Рейтинг открывается и с онбординга, и с гейм-овера, и возвращает туда же,
  // откуда пришли, — иначе с гейм-овера игрок терял бы свой результат с глаз.
  function gotoRating() {
    if (state.screen === SCREENS.RATING) return;
    Game.Leaderboard.open(state.screen);
    state.screen = SCREENS.RATING;
  }

  function closeRating() {
    const back = Game.Leaderboard.board.returnTo;
    state.screen = back === SCREENS.GAMEOVER ? SCREENS.GAMEOVER : SCREENS.ONBOARDING;
  }

  Game.SCREENS = SCREENS;
  Game.CHUTE_COUNT = CHUTE_COUNT;
  Game.STEP_COUNT = STEP_COUNT;
  Game.state = state;
  Game.tick = tick;
  Game.advanceScreen = advanceScreen;
  Game.gotoName = gotoName;
  Game.gotoOnboarding = gotoOnboarding;
  Game.gotoRating = gotoRating;
  Game.closeRating = closeRating;
  Game.moveTiger = moveTiger;
  Game.endGame = endGame;
  Game.stepFx = stepFx;
  Game.posToChute = posToChute;
  Game.addPot = addPot;
  Game.currentTickMs = currentTickMs;
})(window.Game);
