// main.js — игровой цикл и переключение экранов.
// Canvas, целочисленный масштаб, цикл на rAF с накоплением времени и
// дискретными тиками (длительность тика — из state, зависит от счёта).
window.Game = window.Game || {};

(function (Game) {
  const LOGICAL_W = 256;
  const LOGICAL_H = 192;
  const MAX_FRAME_MS = 250; // защита от «спирали смерти» при зависшей вкладке

  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // --- Целочисленный масштаб под размер окна -----------------------------
  // Внутреннее разрешение canvas остаётся 256×192; растягиваем только через
  // CSS-размер и только на целое число раз. Дробный масштаб запрещён (раздел 1).
  function fitScale() {
    const scale = Math.max(
      1,
      Math.floor(Math.min(window.innerWidth / LOGICAL_W, window.innerHeight / LOGICAL_H))
    );
    canvas.style.width = LOGICAL_W * scale + 'px';
    canvas.style.height = LOGICAL_H * scale + 'px';
  }

  // --- Пауза на гейм-овере (раздел 11) ------------------------------------
  // Кнопка не принимает ввод первые 700 мс, иначе игрок случайным нажатием
  // проскочит экран и не увидит результат.
  const GAMEOVER_LOCK_MS = 700;

  let screenSince = 0;          // когда вошли в текущий экран
  let prevScreen = null;

  function buttonEnabled(now) {
    if (Game.state.screen !== Game.SCREENS.GAMEOVER) return true;
    return now - screenSince >= GAMEOVER_LOCK_MS;
  }

  // Курсор в поле ввода мигает по часам, а не по кадрам: частота не должна
  // зависеть от того, сколько кадров успевает браузер.
  const CURSOR_BLINK_MS = 500;

  function render(now) {
    switch (Game.state.screen) {
      case Game.SCREENS.NAME:
        Game.renderName(ctx, Math.floor(now / CURSOR_BLINK_MS) % 2 === 0);
        break;
      case Game.SCREENS.ONBOARDING:
        Game.renderOnboarding(ctx);
        break;
      case Game.SCREENS.PLAYING:
        Game.renderPlaying(ctx);
        break;
      case Game.SCREENS.GAMEOVER:
        Game.renderGameover(ctx, buttonEnabled(now));
        break;
      case Game.SCREENS.RATING:
        Game.renderRating(ctx);
        break;
    }
  }

  // --- Разбор ввода -------------------------------------------------------
  // На экране имени клавиатура работает принципиально иначе: пробел — это
  // символ, а не «начать», M — буква, а не выключение звука. Поэтому у него
  // свой обработчик, а не общий с оговорками.
  function handleNameEvent(ev) {
    const Profile = Game.Profile;
    if (ev.type === 'char') {
      Profile.type(ev.ch);
    } else if (ev.type === 'edit') {
      if (ev.action === 'backspace') Profile.backspace();
      else Profile.nextField();
    } else if (ev.type === 'confirm' && ev.key === 'Enter') {
      // submit() асинхронный: сам переведёт экран, когда ответит сервер.
      Profile.submit();
    } else if (ev.type === 'back') {
      // Esc отменяет смену имени — но только если игроку есть куда вернуться.
      // На первом заходе профиля ещё нет, и уходить с экрана некуда.
      if (Profile.hasProfile() && Profile.draft.status !== 'checking') {
        Game.gotoOnboarding();
      }
    } else if (ev.type === 'click') {
      const hit = Game.hitButton(ev.x, ev.y);
      if (hit === 'field-name') Profile.focusField('name');
      else if (hit === 'field-pin') Profile.focusField('pin');
      else if (hit === 'go') Profile.submit();
      else if (hit === 'sound') Game.Sound.toggle();
    }
  }

  // Рейтинг: на экране одна кнопка, поэтому и Esc, и подтверждение, и клик
  // по «НАЗАД» делают одно и то же — возвращают туда, откуда пришли.
  function handleRatingEvent(ev) {
    if (ev.type === 'back' || ev.type === 'confirm') {
      Game.closeRating();
    } else if (ev.type === 'click') {
      const hit = Game.hitButton(ev.x, ev.y);
      if (hit === 'back') Game.closeRating();
      else if (hit === 'sound') Game.Sound.toggle();
    } else if (ev.type === 'sound') {
      Game.Sound.toggle();
    }
  }

  // Остальные экраны: стрелки сразу двигают тигра (мгновенный переход),
  // подтверждение и клик по кнопке — жмут кнопку. Печатные символы здесь
  // не нужны и игнорируются.
  function handleGameEvent(ev, now) {
    if (ev.type === 'dir') {
      Game.moveTiger(ev.dir);
    } else if (ev.type === 'sound') {
      Game.Sound.toggle();
    } else if (ev.type === 'confirm') {
      if (buttonEnabled(now)) Game.advanceScreen();
    } else if (ev.type === 'click') {
      // Кнопки те, что были нарисованы в прошлом кадре: экран за кадр
      // не менялся, значит координаты актуальны.
      const hit = Game.hitButton(ev.x, ev.y);
      if (hit === 'sound') {
        Game.Sound.toggle(); // отключение звука работает и во время паузы
      } else if (hit === 'rating') {
        Game.gotoRating();
      } else if (hit === 'change') {
        Game.gotoName();
      } else if (hit === 'start' && buttonEnabled(now)) {
        Game.advanceScreen();
      }
    }
  }

  // --- Игровой цикл: rAF + накопление времени, дискретные тики ------------
  let last = 0;
  let acc = 0; // накопленное неотигканное время, мс

  function frame(now) {
    if (last === 0) last = now;
    let dt = now - last;
    last = now;
    if (dt > MAX_FRAME_MS) dt = MAX_FRAME_MS;

    // Длительность тика зависит от счёта (раздел 8) — перечитываем после
    // каждого тика, т.к. очки внутри тика могли измениться.
    acc += dt;
    let tickMs = Game.currentTickMs();
    while (acc >= tickMs) {
      acc -= tickMs;
      Game.tick();
      tickMs = Game.currentTickMs();
    }

    // Смену экрана засекаем здесь: экран мог переключиться и сам (жизни
    // кончились в тике), и по кнопке. Отсюда же считается пауза 700 мс.
    if (Game.state.screen !== prevScreen) {
      prevScreen = Game.state.screen;
      screenSince = now;
    }

    // Ввод разбираем каждый кадр, по порядку. Какой обработчик — решает
    // экран: событий копится больше, чем нужно любому из них по отдельности.
    const events = Game.Input.consume();

    // Браузер не даёт запускать звук до жеста пользователя, поэтому контекст
    // разбуживается на первом же любом вводе, каким бы он ни был.
    if (events.length) Game.Sound.unlock();

    for (const ev of events) {
      if (Game.state.screen === Game.SCREENS.NAME) handleNameEvent(ev);
      else if (Game.state.screen === Game.SCREENS.RATING) handleRatingEvent(ev);
      else handleGameEvent(ev, now);
    }

    // Эффекты живут в кадрах, а не в тиках (разделы 5, 6).
    Game.stepFx();

    render(now);
    requestAnimationFrame(frame);
  }

  function start() {
    Game.state.best = Game.Storage.loadBest();
    Game.state.bestMs = Game.Storage.loadBestMs();

    // Экран имени показывается один раз: если игрок уже представился, сразу
    // онбординг. Второй вход туда — только по «СМЕНИТЬ».
    if (Game.Profile.load()) {
      Game.gotoOnboarding();
      // Рекорд мог быть поставлен без сети и не дойти до рейтинга. Пробуем
      // дослать его при запуске: сервер хранит максимум, так что повторная
      // отправка того же результата ничего не портит.
      Game.syncBest();
    } else {
      Game.gotoName();
    }

    Game.Sound.init();
    Game.Input.init(canvas);
    fitScale();
    window.addEventListener('resize', fitScale);
    requestAnimationFrame(frame);
  }

  start();
})(window.Game);
