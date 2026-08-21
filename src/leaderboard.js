// leaderboard.js — состояние экрана рейтинга.
//
// Держит отдельно от api.js, потому что это не транспорт, а экран: статус
// загрузки, разобранные строки и память о том, откуда игрок сюда пришёл.
// Рисование — как и у остальных экранов, в render.js.
window.Game = window.Game || {};

(function (Game) {
  const TOP = 10;

  const board = {
    status: 'idle',  // 'idle' | 'loading' | 'ready' | 'error'
    rows: [],        // [{ place, player, score, isMe }]
    me: null,        // строка игрока, если он НЕ попал в топ-10
    returnTo: null,  // экран, с которого открыли рейтинг
  };

  // Каждый запрос получает номер. Ответ на устаревший запрос (игрок успел
  // уйти с экрана и вернуться) молча выбрасывается — иначе поздний ответ
  // затрёт свежий.
  let requestId = 0;

  // Имена приходят с сервера, а шрифт у нас растровый и конечный. Всё, чему
  // нет глифа, выкидываем: лучше короткое имя, чем строка с дырами.
  function sanitize(name) {
    const glyphs = Game.font.glyphs;
    let out = '';
    for (const ch of String(name == null ? '' : name).toUpperCase()) {
      if (ch === ' ' || glyphs[ch]) out += ch;
      if (out.length >= 12) break;
    }
    return out;
  }

  function toRow(raw) {
    return {
      place: Number(raw.place) || 0,
      player: sanitize(raw.player),
      score: Math.max(0, Number(raw.score) || 0),
      isMe: raw.is_me === true,
    };
  }

  // Открыть экран. from — куда возвращаться по «НАЗАД» и Esc.
  function open(from) {
    board.returnTo = from;
    load();
  }

  function load() {
    const id = ++requestId;
    board.status = 'loading';
    board.rows = [];
    board.me = null;

    // Имени может не быть вовсе (профиль не поднялся) — рейтинг всё равно
    // показываем, просто без подсветки своей строки.
    const name = Game.Profile.hasProfile() ? Game.Profile.profile.name : '';

    Game.Api.getLeaderboard(name).then(function (res) {
      if (id !== requestId) return; // ответ устарел
      if (!res.ok) {
        board.status = 'error';
        return;
      }

      const all = res.data.map(toRow);
      board.rows = all.filter(function (r) { return r.place <= TOP; });

      // Своя строка дублируется отдельно, только если игрок не в десятке:
      // иначе он увидит себя дважды.
      const mine = all.filter(function (r) { return r.isMe; })[0];
      board.me = mine && mine.place > TOP ? mine : null;

      board.status = 'ready';
    });
  }

  Game.Leaderboard = { TOP, board, open, load };
})(window.Game);
