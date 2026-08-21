// storage.js — рекорд в localStorage (разделы 1, 11).
// Игра запускается с file://, где localStorage может быть недоступен или
// кидать на запись. Поэтому всё обёрнуто: не сохранилось — играем дальше
// без рекорда, а не падаем.
window.Game = window.Game || {};

(function (Game) {
  const KEY = 'honey-hour.best';
  const KEY_MUTED = 'honey-hour.muted';
  // Имя и ПИН игрока. Ключи с тем же префиксом, что и рекорд: хранилище одно,
  // и по префиксу видно, чьё оно. Сети пока нет — всё лежит локально.
  const KEY_NAME = 'honey-hour.name';
  const KEY_PIN = 'honey-hour.pin';

  function loadBest() {
    try {
      const raw = window.localStorage.getItem(KEY);
      const n = parseInt(raw, 10);
      // Мусор в хранилище не должен ломать HUD: берём только целое >= 0.
      return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch (e) {
      return 0;
    }
  }

  function saveBest(score) {
    try {
      window.localStorage.setItem(KEY, String(score));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Раздел 12: состояние кнопки отключения звука тоже переживает перезагрузку.
  function loadMuted() {
    try {
      return window.localStorage.getItem(KEY_MUTED) === '1';
    } catch (e) {
      return false;
    }
  }

  function saveMuted(muted) {
    try {
      window.localStorage.setItem(KEY_MUTED, muted ? '1' : '0');
      return true;
    } catch (e) {
      return false;
    }
  }

  // Профиль игрока. Читаем сырьём, а проверку берёт на себя profile.js:
  // хранилище не должно решать, какое имя правильное.
  function loadProfile() {
    try {
      return {
        name: window.localStorage.getItem(KEY_NAME) || '',
        pin: window.localStorage.getItem(KEY_PIN) || '',
      };
    } catch (e) {
      return { name: '', pin: '' };
    }
  }

  function saveProfile(name, pin) {
    try {
      window.localStorage.setItem(KEY_NAME, String(name));
      window.localStorage.setItem(KEY_PIN, String(pin));
      return true;
    } catch (e) {
      return false;
    }
  }

  Game.Storage = { loadBest, saveBest, loadMuted, saveMuted, loadProfile, saveProfile };
})(window.Game);
