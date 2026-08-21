// api.js — вызовы Supabase (рейтинг).
//
// Главное правило модуля: **сеть необязательна**. Ни один вызов отсюда не
// имеет права уронить игру, задержать кадр или помешать играть. Поэтому:
//
//   - каждый вызов обёрнут в try/catch и таймаут 5 секунд;
//   - наружу возвращается { ok: false, ... } вместо исключения;
//   - всё, что пошло не так, уходит в console, а не на экран;
//   - вызывающий код обязан уметь работать с ok:false — экран имени пускает
//     игрока дальше, рейтинг показывает заглушку, партия идёт как шла.
//
// Схема и функции в базе уже созданы, здесь их только зовут.
window.Game = window.Game || {};

(function (Game) {
  const BASE = 'https://nmuljditshfwhqlrtsjw.supabase.co';
  const KEY = 'sb_publishable_C_3fA-TFl_XM1JW-xC3UZw_QkMydSxQ';
  const TIMEOUT_MS = 5000;

  // Ключ публикуемый (publishable) — он и предназначен для клиента, доступ
  // ограничен политиками на стороне базы. Прятать его в вебе всё равно негде.
  function headers() {
    return {
      'apikey': KEY,
      'Authorization': 'Bearer ' + KEY,
      'Content-Type': 'application/json',
    };
  }

  // Общий вызов RPC. Возвращает { ok: true, data } либо { ok: false, error }.
  // Исключений не бросает никогда — это контракт модуля.
  async function rpc(fn, params) {
    // В node-заглушках (tools/) fetch нет вовсе: там это не ошибка, а ровно
    // тот режим «без сети», который игра обязана переживать.
    if (typeof fetch !== 'function') return { ok: false, error: 'no-fetch' };

    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(function () {
      if (ctrl) ctrl.abort();
    }, TIMEOUT_MS);

    try {
      const res = await fetch(BASE + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(params),
        signal: ctrl ? ctrl.signal : undefined,
      });

      if (!res.ok) {
        const text = await res.text().catch(function () { return ''; });
        console.warn('[рейтинг] ' + fn + ': HTTP ' + res.status + ' ' + text);
        return { ok: false, error: 'http-' + res.status };
      }

      return { ok: true, data: await res.json() };
    } catch (e) {
      // Сюда попадает и обрыв сети, и таймаут (abort), и CORS.
      console.warn('[рейтинг] ' + fn + ' не ответил:', e && e.message ? e.message : e);
      return { ok: false, error: 'network' };
    } finally {
      clearTimeout(timer);
    }
  }

  // join_game -> 'created' | 'ok' | 'taken' | 'bad_name' | 'bad_pin'
  async function joinGame(name, pin) {
    return rpc('join_game', { p_name: name, p_pin: pin });
  }

  // submit_score -> 'ok' | 'bad_pin' | 'impossible' | 'too_fast'
  // Отправляется молча: результат нужен только в консоли, игроку — нет.
  //
  // В лог идёт и то, что отправили. Без этого разбирать расхождения между
  // счётом на экране и счётом в рейтинге приходится вслепую: по одному слову
  // «ok» не видно, какое число ушло на сервер.
  async function submitScore(name, pin, score, playedMs) {
    const sent = score + ' очков за ' + Math.round(playedMs / 1000) + ' с';
    const res = await rpc('submit_score', {
      p_name: name,
      p_pin: pin,
      p_score: score,
      p_played_ms: playedMs,
    });
    if (res.ok) {
      // 'ok' — сервер принял. Всё остальное он вернул как отказ, и это стоит
      // отличать: «отправлено» и «зачтено» — разные вещи.
      const verdict = res.data === 'ok' ? 'зачтено' : 'ОТКЛОНЕНО (' + res.data + ')';
      console.log('[рейтинг] ' + sent + ' -> ' + verdict);
    }
    return res;
  }

  // get_leaderboard -> [{ place, player, score, is_me }]
  async function getLeaderboard(name) {
    const res = await rpc('get_leaderboard', { p_name: name });
    if (res.ok && !Array.isArray(res.data)) {
      console.warn('[рейтинг] get_leaderboard вернул не массив:', res.data);
      return { ok: false, error: 'bad-shape' };
    }
    return res;
  }

  Game.Api = { joinGame, submitScore, getLeaderboard, TIMEOUT_MS };
})(window.Game);
