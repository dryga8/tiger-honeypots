// input.js — клавиатура и мышь.
// Копим события по порядку за кадр; их разбирает главный цикл.
// События — объекты:
//   { type:'confirm', key }        Enter / пробел
//   { type:'dir', dir }            стрелки
//   { type:'sound' }               M / Ь
//   { type:'char', ch }            печатный символ (экран имени)
//   { type:'edit', action }        'backspace' | 'tab' (экран имени)
//   { type:'back' }                Esc
//   { type:'click', x, y }
//
// Ввод текста не отдельный режим ввода, а дополнительный поток событий:
// печатные символы копятся всегда, а решает, слушать их или нет, главный
// цикл — по текущему экрану. Так клавиатура не зависит от того, что сейчас
// на экране, и не может «залипнуть» в текстовом режиме.
window.Game = window.Game || {};

(function (Game) {
  // Раздел 11: кнопки экранов реагируют и на Enter, и на Space.
  const KEYMAP = {
    Enter: 'confirm',
    ' ': 'confirm',
    Spacebar: 'confirm', // старое имя клавиши пробела в некоторых браузерах
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    // Раздел 12: звук выключается и с клавиатуры. На русской раскладке та же
    // физическая клавиша даёт 'ь', поэтому ловим оба варианта.
    m: 'sound', M: 'sound', ь: 'sound', Ь: 'sound',
  };

  // Печатным считаем то, что даёт ровно один символ и не является сочетанием
  // с модификатором. Строгий белый список символов — уже в profile.js, у
  // каждого поля он свой (имя и ПИН принимают разное).
  const PRINTABLE = /^[A-Za-zА-Яа-яЁё0-9 ]$/;

  const events = []; // нормализованные события за кадр, по порядку
  let canvas = null;

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // не перехватываем сочетания браузера

    const name = KEYMAP[e.key];
    if (name) {
      e.preventDefault();    // чтобы стрелки/пробел не скроллили страницу
      if (e.repeat) {
        // Автоповтор удержания не считаем за новое нажатие — но для набора
        // текста повтор как раз нужен, поэтому дальше по функции идём.
      } else if (name === 'confirm') {
        events.push({ type: 'confirm', key: e.key });
      } else if (name === 'sound') {
        events.push({ type: 'sound' });
      } else {
        events.push({ type: 'dir', dir: name });
      }
    }

    // Esc — «назад»: уйти с рейтинга, отменить смену имени.
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      events.push({ type: 'back' });
      return;
    }

    // Backspace иначе уводит со страницы назад, Tab — на адресную строку.
    if (e.key === 'Backspace' || e.key === 'Tab') {
      e.preventDefault();
      events.push({ type: 'edit', action: e.key === 'Tab' ? 'tab' : 'backspace' });
      return;
    }

    if (e.key.length === 1 && PRINTABLE.test(e.key)) {
      events.push({ type: 'char', ch: e.key });
    }
  }

  // Клик приходит в координатах окна, а игра живёт в логических 256×192.
  // Пересчёт идёт через реальный размер canvas на экране, поэтому работает
  // при любом целочисленном масштабе и при любом положении на странице.
  function onClick(e) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    events.push({
      type: 'click',
      x: Math.floor((e.clientX - rect.left) * (canvas.width / rect.width)),
      y: Math.floor((e.clientY - rect.top) * (canvas.height / rect.height)),
    });
  }

  const Input = {
    init(canvasEl) {
      canvas = canvasEl || null;
      window.addEventListener('keydown', onKeyDown);
      if (canvas) canvas.addEventListener('click', onClick);
    },
    // Вернуть накопленные события по порядку и очистить буфер.
    consume() {
      const out = events.slice();
      events.length = 0;
      return out;
    },
  };

  Game.Input = Input;
})(window.Game);
