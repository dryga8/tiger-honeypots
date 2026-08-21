// storage.js — рекорд в localStorage (разделы 1, 11).
// Игра запускается с file://, где localStorage может быть недоступен или
// кидать на запись. Поэтому всё обёрнуто: не сохранилось — играем дальше
// без рекорда, а не падаем.
window.Game = window.Game || {};

(function (Game) {
  const KEY = 'honey-hour.best';
  // Длительность партии, в которой поставлен рекорд. Нужна, чтобы рекорд
  // можно было переотправить в рейтинг: сервер проверяет счёт на
  // правдоподобие по времени, и выдумывать время нельзя.
  const KEY_BEST_MS = 'honey-hour.bestMs';
  // Счёт, который сервер **принял** (ответил 'ok'). Нужен, чтобы не слать
  // впустую то, что в таблице уже стоит: у сервера кулдаун после каждой
  // принятой отправки, и тратить его на повтор известного числа — значит
  // подставить следующий настоящий рекорд под отказ 'too_fast'.
  // -1 означает «мы ещё ничего не отправляли», и это не то же самое, что 0:
  // ноль — законный результат партии, в которой игрок не поймал ничего.
  const KEY_SENT = 'honey-hour.sent';
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

  function loadBestMs() {
    try {
      const n = parseInt(window.localStorage.getItem(KEY_BEST_MS), 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch (e) {
      return 0;
    }
  }

  function saveBest(score, playedMs) {
    try {
      window.localStorage.setItem(KEY, String(score));
      if (playedMs > 0) window.localStorage.setItem(KEY_BEST_MS, String(playedMs));
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadSent() {
    try {
      const n = parseInt(window.localStorage.getItem(KEY_SENT), 10);
      return Number.isFinite(n) && n >= 0 ? n : -1;
    } catch (e) {
      return -1;
    }
  }

  function saveSent(score) {
    try {
      window.localStorage.setItem(KEY_SENT, String(score));
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

  Game.Storage = {
    loadBest, loadBestMs, saveBest,
    loadSent, saveSent,
    loadMuted, saveMuted,
    loadProfile, saveProfile,
  };
})(window.Game);
