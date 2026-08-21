// backdrop.js — задник игрового поля.
//
// Поле висело в пустоте: голый bg0 за желобами. Задник даёт месту вид, но
// у него ровно одна обязанность — не мешать. Правила, из которых он собран:
//
//   1. Только тёмные тона палитры (bg1, wood2, изредка wood1). Зелёный и
//      красный не используются вовсе: ими закодированы ханипоты, и любое
//      зелёное пятно на фоне сбивает чтение поля.
//   2. Рисуется один раз в offscreen-canvas и дальше кладётся одним
//      drawImage — на кадр не тратится ничего.
//   3. Прозрачен там, где ничего не нарисовано: под ним остаётся заливка
//      renderPlaying, и на вспышке задник просто не рисуется.
//   4. Не трясётся вместе с полем — иначе по краям экрана вылезут дыры.
window.Game = window.Game || {};

(function (Game) {
  const W = 256;
  const H = 192;

  const STYLES = ['plain', 'library', 'newsroom', 'maze'];

  // Верхняя полоса под HUD: задник в неё не заходит. Счёт и сердца поверх
  // фактуры не читаются, а полоса чистого фона выглядит как строка состояния,
  // то есть намеренно.
  const HUD_H = 19;

  // Детерминированный генератор: задник должен быть одинаковым в каждом
  // запуске и в каждом кадре, иначе он будет мерцать и его не сверить по
  // скриншоту.
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // --- Библиотека ---------------------------------------------------------
  // Стеллажи во всю стену: полки горизонтальными полосами, между ними —
  // корешки книг разной ширины и высоты. Корешки почти все в самом тёмном
  // тоне дерева, светлые попадаются редко — так стеллаж читается фактурой,
  // а не рябит.
  const LIB = {
    BAND: 28,   // шаг полок по вертикали
    BOOKS: 22,  // высота просвета под книги
    UNIT: 64,   // ширина одного шкафа: ровно четыре на экран
    PAD: 4,     // отступ книг от стоек
  };

  function drawLibrary(ctx) {
    const P = Game.palette;
    const r = rng(19230817);

    // Вертикальные стойки шкафов. Без них полки читаются полосатой стеной;
    // со стойками — сразу четыре шкафа, то есть помещение.
    ctx.fillStyle = P.wood2;
    for (let x = 0; x <= W - 2; x += LIB.UNIT) ctx.fillRect(x, HUD_H, 2, H - HUD_H);
    ctx.fillRect(W - 2, HUD_H, 2, H - HUD_H);

    for (let shelfY = HUD_H + LIB.BOOKS; shelfY < H; shelfY += LIB.BAND) {
      const top = Math.max(HUD_H, shelfY - LIB.BOOKS);

      for (let u = 0; u * LIB.UNIT < W; u++) {
        const left = u * LIB.UNIT + LIB.PAD;
        const right = Math.min((u + 1) * LIB.UNIT - LIB.PAD, W - LIB.PAD);

        let x = left;
        while (x < right) {
          const roll = r();

          // Просветы: полка не забита под завязку, кое-где книги вынуты.
          if (roll > 0.86) {
            x += 3 + Math.floor(r() * 4);
            continue;
          }

          // Изредка — стопка лёжа поверх остальных: горизонтальные бруски.
          if (roll > 0.8) {
            const lw = Math.min(7 + Math.floor(r() * 6), right - x);
            const layers = 1 + Math.floor(r() * 2);
            for (let l = 0; l < layers; l++) {
              ctx.fillStyle = l % 2 ? P.bg1 : P.wood2;
              ctx.fillRect(x, shelfY - 3 * (l + 1), lw, 2);
            }
            x += lw + 2;
            continue;
          }

          const w = Math.min(2 + Math.floor(r() * 4), right - x);
          const h = Math.min(10 + Math.floor(r() * (LIB.BOOKS - 10)), shelfY - top);
          // Только два самых тёмных тона, и тёмный преобладает. Светлое
          // дерево (wood0/wood1) отдано желобам: если раскрасить им ещё и
          // книги, желоба перестают читаться силуэтом и поле рябит.
          ctx.fillStyle = roll > 0.45 ? P.bg1 : P.wood2;
          ctx.fillRect(x, shelfY - h, w, h);
          // Тень между корешками: 1 пиксель фона, иначе книги слипаются
          // в сплошную полосу.
          x += w + 1;
        }
      }

      // Сама полка — одна тёмная доска. Светлой кромки нет по той же
      // причине: горизонтальная светлая линия во всю ширину спорит с желобами.
      ctx.fillStyle = P.wood2;
      ctx.fillRect(0, shelfY, W, 2);
    }
  }

  // --- Редакция -----------------------------------------------------------
  // Не комната, а газетная полоса во весь экран: колонки набора, линейки
  // между ними, пара блоков под фотографии. Строки — просто штрихи по
  // пикселю: с трёх шагов это безошибочно читается как текст, а вблизи не
  // спорит с игрой.
  function drawNewsroom(ctx) {
    const P = Game.palette;
    const r = rng(31071925);

    const MARGIN = 8;
    const COLS = 4;
    const GUTTER = 6;
    const colW = Math.floor((W - MARGIN * 2 - GUTTER * (COLS - 1)) / COLS);
    const TOP = HUD_H + 4;

    // Шапка полосы: жирная строка заголовка и линейка под ней.
    ctx.fillStyle = P.wood2;
    ctx.fillRect(MARGIN, TOP, W - MARGIN * 2, 4);
    ctx.fillRect(MARGIN, TOP + 7, W - MARGIN * 2, 1);

    for (let c = 0; c < COLS; c++) {
      const x0 = MARGIN + c * (colW + GUTTER);

      // Линейка между колонками.
      if (c > 0) {
        ctx.fillStyle = P.wood2;
        ctx.fillRect(x0 - Math.floor(GUTTER / 2), TOP + 11, 1, H - TOP - 19);
      }

      let y = TOP + 13;
      while (y < H - 8) {
        // Блок «фотографии» — только рамкой. Заливать его вторым тоном фона
        // нельзя: тем же тоном нарисованы ниши тигра, и залитые блоки
        // читаются как ещё четыре места, куда можно встать.
        if (r() > 0.9 && y < H - 30) {
          const bh = 14 + Math.floor(r() * 12);
          ctx.fillStyle = P.wood2;
          ctx.fillRect(x0, y, colW, 1);
          ctx.fillRect(x0, y + bh - 1, colW, 1);
          ctx.fillRect(x0, y, 1, bh);
          ctx.fillRect(x0 + colW - 1, y, 1, bh);
          y += bh + 4;
          continue;
        }

        // Подзаголовок: строка вдвое жирнее и короче.
        if (r() > 0.88) {
          ctx.fillStyle = P.wood2;
          ctx.fillRect(x0, y, Math.floor(colW * 0.7), 2);
          y += 5;
          continue;
        }

        // Обычная строка набора. Последняя строка абзаца — короткая.
        ctx.fillStyle = P.wood2;
        const len = r() > 0.85 ? Math.floor(colW * (0.3 + r() * 0.4)) : colW;
        ctx.fillRect(x0, y, len, 1);
        y += r() > 0.93 ? 5 : 3; // изредка — отбивка между абзацами
      }
    }
  }

  // --- Лабиринт -----------------------------------------------------------
  // Настоящий лабиринт, а не орнамент: сетка 16×12 клеток по 16 пикселей,
  // проходы прогрызаются обходом в глубину. Стены рисуются тонкими — задник
  // должен читаться как план, а не как кирпичная кладка поверх игры.
  const CELL = 16;
  const COLS_M = W / CELL;  // 16
  const ROWS_M = H / CELL;  // 12

  function buildMaze(r) {
    // Для каждой клетки — какие стены целы: [верх, право, низ, лево].
    const walls = [];
    const seen = [];
    for (let i = 0; i < COLS_M * ROWS_M; i++) {
      walls.push([true, true, true, true]);
      seen.push(false);
    }

    const idx = (cx, cy) => cy * COLS_M + cx;
    const DX = [0, 1, 0, -1];
    const DY = [-1, 0, 1, 0];

    // Обход в глубину на явном стеке: рекурсия на 192 клетки не нужна, а
    // стек заодно даёт длинные коридоры вместо каши коротких тупиков.
    const stack = [[0, 0]];
    seen[0] = true;
    while (stack.length) {
      const top = stack[stack.length - 1];
      const cx = top[0];
      const cy = top[1];

      const options = [];
      for (let d = 0; d < 4; d++) {
        const nx = cx + DX[d];
        const ny = cy + DY[d];
        if (nx < 0 || ny < 0 || nx >= COLS_M || ny >= ROWS_M) continue;
        if (seen[idx(nx, ny)]) continue;
        options.push(d);
      }

      if (!options.length) {
        stack.pop();
        continue;
      }

      const d = options[Math.floor(r() * options.length)];
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      walls[idx(cx, cy)][d] = false;
      walls[idx(nx, ny)][(d + 2) % 4] = false;
      seen[idx(nx, ny)] = true;
      stack.push([nx, ny]);
    }

    return walls;
  }

  function drawMaze(ctx) {
    const P = Game.palette;
    const r = rng(20250821);
    const walls = buildMaze(r);

    // Пол не заливается вовсе. Залитый лабиринт занимает почти весь экран
    // вторым тоном фона — тем же, которым нарисованы ниши тигра, и ниши
    // пропадают начисто. Остаются одни стены: план, а не помещение.
    for (let cy = 0; cy < ROWS_M; cy++) {
      for (let cx = 0; cx < COLS_M; cx++) {
        const cell = walls[cy * COLS_M + cx];
        const x = cx * CELL;
        const y = cy * CELL;

        ctx.fillStyle = P.wood2;
        if (cell[0] && y >= HUD_H) ctx.fillRect(x, y, CELL, 2);   // верх
        if (cell[3] && y >= HUD_H - CELL) {                        // лево
          const top = Math.max(y, HUD_H);
          ctx.fillRect(x, top, 2, y + CELL - top);
        }
        if (cx === COLS_M - 1 && cell[1]) {
          const top = Math.max(y, HUD_H);
          ctx.fillRect(x + CELL - 2, top, 2, y + CELL - top);
        }
        if (cy === ROWS_M - 1 && cell[2]) ctx.fillRect(x, y + CELL - 2, CELL, 2);
      }
    }
  }

  // --- Сборка -------------------------------------------------------------
  const baked = {}; // style → offscreen canvas
  let style = 'library';

  function bake(name) {
    if (baked[name]) return baked[name];

    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const octx = off.getContext('2d');
    octx.imageSmoothingEnabled = false;

    if (name === 'library') drawLibrary(octx);
    else if (name === 'newsroom') drawNewsroom(octx);
    else if (name === 'maze') drawMaze(octx);
    // 'plain' — пустой холст: задника нет, как было раньше.

    baked[name] = off;
    return off;
  }

  function draw(ctx) {
    if (style === 'plain') return;
    ctx.drawImage(bake(style), 0, 0);
  }

  function setStyle(name) {
    if (STYLES.indexOf(name) >= 0) style = name;
  }

  Game.Backdrop = {
    STYLES,
    draw,
    setStyle,
    getStyle: () => style,
  };
})(window.Game);
