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
  //
  // status — что сейчас происходит с проверкой на сервере:
  //   'idle'     — ждём ввода
  //   'checking' — запрос ушёл, кнопка неактивна
  //   'bad'      — сервер не принял; badField подсвечен, message объясняет
  //   'welcome'  — имя узнали, сейчас пропустим дальше
  //   'offline'  — сервер не ответил, пускаем играть без рейтинга
  // message — строки под полями (несколько, потому что в 256 пикселей длинная
  // фраза не влезает и её приходится ломать вручную).
  const draft = {
    name: '',
    pin: '',
    field: 'name',
    status: 'idle',
    message: [],
    badField: null,
  };

  // Сколько держать «С ВОЗВРАЩЕНИЕМ!» перед тем, как пустить дальше.
  const NOTICE_MS = 900;

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
    draft.status = 'idle';
    draft.message = [];
    draft.badField = null;
  }

  // Любая правка снимает подсветку ошибки: держать её после того, как игрок
  // уже что-то исправил, — значит ругаться на текст, которого больше нет.
  function clearError() {
    if (draft.status === 'bad') {
      draft.status = 'idle';
      draft.message = [];
      draft.badField = null;
    }
  }

  // --- Правка черновика ----------------------------------------------------
  function type(ch) {
    if (draft.status === 'checking') return; // пока проверяем — поля заморожены
    clearError();
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
    if (draft.status === 'checking') return;
    clearError();
    if (draft.field === 'name') draft.name = draft.name.slice(0, -1);
    else draft.pin = draft.pin.slice(0, -1);
  }

  function nextField() {
    if (draft.status === 'checking') return;
    draft.field = draft.field === 'name' ? 'pin' : 'name';
  }

  function focusField(field) {
    if (draft.status === 'checking') return;
    if (field === 'name' || field === 'pin') draft.field = field;
  }

  function commit() {
    if (!draftValid()) return false;
    const next = normalizeName(draft.name);

    // Другое имя — другой игрок. Память о том, какой счёт сервер уже
    // принял, относилась к прежнему аккаунту, и переносить её нельзя:
    // иначе у нового имени результат ниже запомненного вообще не уйдёт
    // в таблицу, и игрок снова окажется в списке игроков без строки
    // в рейтинге — ровно та, болезнь, ради которой память заводилась.
    if (next !== profile.name) {
      Game.state.sent = -1;
      Game.Storage.saveSent(-1);
    }

    profile.name = next;
    profile.pin = draft.pin;
    draft.name = profile.name;
    Game.Storage.saveProfile(profile.name, profile.pin);
    return true;
  }

  // --- Подтверждение с проверкой на сервере --------------------------------
  // Кнопка «ВПЕРЁД!» и Enter ведут сюда. Локальные правила проверяются первыми
  // и без сети: гонять запрос ради имени из одной буквы незачем.
  function fail(field, lines) {
    draft.status = 'bad';
    draft.badField = field;
    draft.field = field;
    draft.message = lines;
  }

  // Пропустить игрока дальше. Задержка нужна, только чтобы он успел прочитать
  // надпись; при нулевой уходим сразу.
  function letIn(delayMs) {
    if (!delayMs) {
      Game.gotoOnboarding();
      return;
    }
    setTimeout(function () {
      // За время задержки игрок мог уйти сам (Esc) — тогда не дёргаем экран.
      if (Game.state.screen === Game.SCREENS.NAME) Game.gotoOnboarding();
    }, delayMs);
  }

  async function submit() {
    if (draft.status === 'checking') return; // повторные нажатия игнорируем

    // Локальная проверка. Молчаливое «ничего не произошло» игрок читает как
    // поломку, поэтому фокус переводится на то поле, которое виновато.
    if (!nameValid(draft.name)) {
      return fail('name', ['ИМЯ - ОТ 2 ДО 12 СИМВОЛОВ']);
    }
    if (!pinValid(draft.pin)) {
      return fail('pin', ['ПИН - РОВНО 4 ЦИФРЫ']);
    }

    draft.status = 'checking';
    draft.message = [];
    draft.badField = null;

    const res = await Game.Api.joinGame(normalizeName(draft.name), draft.pin);

    // Игрок мог уйти с экрана, пока шёл запрос.
    if (Game.state.screen !== Game.SCREENS.NAME) return;

    if (!res.ok) {
      // Сети нет — это не повод не пускать играть (раздел 15). Имя
      // сохраняется локально, счёт просто не уедет в рейтинг.
      commit();
      draft.status = 'offline';
      draft.message = ['НЕТ СВЯЗИ,', 'ИГРАЕМ БЕЗ РЕЙТИНГА'];
      return letIn(NOTICE_MS);
    }

    switch (res.data) {
      case 'created': // имя свободно, игрок заведён
        commit();
        draft.status = 'idle';
        return letIn(0);

      case 'ok': // имя занято, но ПИН верный — это он же
        commit();
        draft.status = 'welcome';
        draft.message = ['С ВОЗВРАЩЕНИЕМ!'];
        return letIn(NOTICE_MS);

      case 'taken': // имя занято, ПИН не подошёл
        return fail('name', ['ТАКОЙ ТИГР УЖЕ ЕСТЬ В ИГРЕ,', 'ПРИДУМАЙ ДРУГОЕ ИМЯ']);

      case 'bad_name':
        return fail('name', ['ИМЯ НЕ ПОДОШЛО,', 'ПОПРОБУЙ ДРУГОЕ']);

      case 'bad_pin':
        return fail('pin', ['ПИН НЕ ПОДОШЁЛ,', 'НУЖНЫ 4 ЦИФРЫ']);

      default:
        // Сервер ответил что-то незнакомое: в консоль, а игрока пускаем —
        // застревать на экране имени из-за чужой ошибки он не должен.
        console.warn('[рейтинг] join_game вернул неизвестное:', res.data);
        commit();
        draft.status = 'idle';
        return letIn(0);
    }
  }

  Game.Profile = {
    NAME_MIN, NAME_MAX, PIN_LEN, NOTICE_MS,
    profile, draft,
    normalizeName, nameValid, pinValid, draftValid, hasProfile,
    load, beginEdit, type, backspace, nextField, focusField, submit, commit,
  };
})(window.Game);
