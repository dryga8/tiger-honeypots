// profile.js — имя и ПИН игрока: хранение, ввод, проверка.
//
// Ввод свой, на canvas: HTML-инпут сломал бы пиксельную стилистику, поэтому
// поле — это просто строка, которую правят keydown-события, а рисует её
// render.js тем же растровым шрифтом.
//
// Сети и базы пока нет: имя ни на что не проверяется на занятость, всё
// лежит в localStorage. ПИН нужен, чтобы позже вернуться под своим именем
// с другого компьютера, поэтому он хранится и показывается открыто.
window.Game = window.Game || {};

(function (Game) {
  const NAME_MIN = 2;
  const NAME_MAX = 12;
  const PIN_LEN = 4;

  // Белый список символов имени. Кириллица, латиница, цифры и пробел
  // (внутренний, одиночный). Ё вне диапазона А-Я в Unicode, поэтому названа
  // отдельно. Регистр приводится к верхнему до проверки — в шрифте только
  // заглавные, строчных глифов просто нет.
  const NAME_CHAR = /^[А-ЯЁA-Z0-9 ]$/;
  const DIGIT = /^[0-9]$/;

  // Сохранённый профиль. Пустой, пока игрок не представился.
  const profile = { name: '', pin: '' };

  // Черновик экрана имени: то, что игрок набрал, но ещё не подтвердил.
  const draft = { name: '', pin: '', field: 'name' };

  // Пробелы по краям режем, внутренние схлопываем в один, регистр — верхний.
  function normalizeName(raw) {
    return String(raw).toUpperCase().replace(/\s+/g, ' ').trim();
  }

  function nameValid(raw) {
    const n = normalizeName(raw);
    if (n.length < NAME_MIN || n.length > NAME_MAX) return false;
    for (const ch of n) if (!NAME_CHAR.test(ch)) return false;
    return true;
  }

  function pinValid(raw) {
    return /^[0-9]{4}$/.test(String(raw));
  }

  // Кнопка «ВПЕРЁД!» неактивна, пока оба поля не заполнены корректно.
  function draftValid() {
    return nameValid(draft.name) && pinValid(draft.pin);
  }

  function hasProfile() {
    return nameValid(profile.name) && pinValid(profile.pin);
  }

  // Профиль из хранилища. Битые или недозаполненные данные считаем за
  // «игрок ещё не представился» — тогда экран имени покажется снова.
  function load() {
    const saved = Game.Storage.loadProfile();
    const name = normalizeName(saved.name);
    if (nameValid(name) && pinValid(saved.pin)) {
      profile.name = name;
      profile.pin = saved.pin;
    } else {
      profile.name = '';
      profile.pin = '';
    }
    return hasProfile();
  }

  // Начать правку: черновик берётся из сохранённого профиля, чтобы по
  // «СМЕНИТЬ» игрок видел текущее имя, а не пустое поле.
  function beginEdit() {
    draft.name = profile.name;
    draft.pin = profile.pin;
    draft.field = 'name';
  }

  // --- Правка черновика ----------------------------------------------------
  function type(ch) {
    if (draft.field === 'name') {
      const up = ch.toUpperCase();
      if (!NAME_CHAR.test(up)) return;
      if (draft.name.length >= NAME_MAX) return;
      // Пробел в начале и второй пробел подряд не набираются вовсе: иначе
      // игрок видит в поле одно, а сохраняется другое.
      if (up === ' ' && (draft.name.length === 0 || draft.name.slice(-1) === ' ')) return;
      draft.name += up;
    } else {
      if (!DIGIT.test(ch)) return;
      if (draft.pin.length >= PIN_LEN) return;
      draft.pin += ch;
    }
  }

  function backspace() {
    if (draft.field === 'name') draft.name = draft.name.slice(0, -1);
    else draft.pin = draft.pin.slice(0, -1);
  }

  function nextField() {
    draft.field = draft.field === 'name' ? 'pin' : 'name';
  }

  function focusField(field) {
    if (field === 'name' || field === 'pin') draft.field = field;
  }

  // Enter: если всё заполнено — подтверждаем, иначе переводим фокус на первое
  // незаполненное поле. Молчаливое «ничего не произошло» игрок читает как
  // поломку.
  function submit() {
    if (draftValid()) return commit();
    draft.field = nameValid(draft.name) ? 'pin' : 'name';
    return false;
  }

  function commit() {
    if (!draftValid()) return false;
    profile.name = normalizeName(draft.name);
    profile.pin = draft.pin;
    draft.name = profile.name;
    Game.Storage.saveProfile(profile.name, profile.pin);
    return true;
  }

  Game.Profile = {
    NAME_MIN, NAME_MAX, PIN_LEN,
    profile, draft,
    normalizeName, nameValid, pinValid, draftValid, hasProfile,
    load, beginEdit, type, backspace, nextField, focusField, submit, commit,
  };
})(window.Game);
