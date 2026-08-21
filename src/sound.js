// sound.js — короткие синтезированные звуки через AudioContext (раздел 12).
// Файлов нет, всё считается на лету. Звук — вещь второстепенная: если
// AudioContext недоступен или падает, игра просто играет молча.
window.Game = window.Game || {};

(function (Game) {
  let audio = null;      // AudioContext, создаётся лениво
  let broken = false;    // не завелось — больше не пробуем
  let muted = false;

  function ensure() {
    if (audio || broken) return audio;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { broken = true; return null; }
    try {
      audio = new AC();
    } catch (e) {
      broken = true;
    }
    return audio;
  }

  // Браузер не даёт запускать звук до жеста пользователя, поэтому контекст
  // создаётся и разбуживается на первом нажатии/клике, а не при загрузке.
  function unlock() {
    const a = ensure();
    if (a && a.state === 'suspended' && a.resume) a.resume();
  }

  // Один писк: осциллятор с огибающей. Частота может ехать — этим и
  // различаются «поймал» (вверх) и «пропустил» (вниз).
  function beep(a, opts) {
    const t0 = a.currentTime + (opts.at || 0);
    const dur = opts.dur;

    const osc = a.createOscillator();
    const gain = a.createGain();

    osc.type = opts.type || 'square';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);

    // Огибающая через exponentialRamp: с нуля он не умеет, поэтому края —
    // не 0, а очень тихо. Резкий старт и мягкий спад, чтобы не щёлкало.
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(opts.gain || 0.12, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(gain);
    gain.connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const VOICES = {
    // Поймал зелёный — короткий писк вверх.
    catch: (a) => beep(a, { freq: 660, to: 990, dur: 0.07, gain: 0.10 }),
    // Пропустил зелёный — тусклый писк вниз.
    miss: (a) => beep(a, { freq: 320, to: 180, dur: 0.14, type: 'triangle', gain: 0.12 }),
    // Поймал красный — низкий рык, заметно громче и дольше остальных:
    // это ошибка игрока, и она должна звучать неприятно.
    red: (a) => beep(a, { freq: 170, to: 70, dur: 0.26, type: 'sawtooth', gain: 0.16 }),
    // Стрик добит — короткое арпеджио вверх.
    streak: (a) => {
      beep(a, { freq: 660, dur: 0.06, gain: 0.10, at: 0 });
      beep(a, { freq: 880, dur: 0.06, gain: 0.10, at: 0.06 });
      beep(a, { freq: 1320, dur: 0.10, gain: 0.10, at: 0.12 });
    },
  };

  function play(name) {
    if (muted) return;
    const a = ensure();
    if (!a || !VOICES[name]) return;
    try {
      VOICES[name](a);
    } catch (e) {
      // Звук не должен ронять партию ни при каких обстоятельствах.
      broken = true;
    }
  }

  function isMuted() { return muted; }

  function setMuted(value) {
    muted = !!value;
    Game.Storage.saveMuted(muted);
  }

  function toggle() { setMuted(!muted); }

  function init() { muted = Game.Storage.loadMuted(); }

  Game.Sound = { init, unlock, play, toggle, isMuted, setMuted };
})(window.Game);
