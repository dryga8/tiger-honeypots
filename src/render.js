// render.js — отрисовка поля, желобов, горшочков, тигра, HUD.
// Этап 6: везде настоящие спрайты из sprites.js вместо цветных квадратов.
window.Game = window.Game || {};

(function (Game) {
  const LOGICAL_W = 256;
  const LOGICAL_H = 192;
  const CENTER = { x: 128, y: 96 };

  const S = Game.sprites;
  const P = Game.palette;

  // --- Геометрия поля -----------------------------------------------------
  // Раздел 3: позиции шагов заданы массивом координат на желоб, а не формулой.
  // Индекс желоба: 0=верх-лево, 1=низ-лево, 2=верх-право, 3=низ-право.
  // Координаты — центр горшочка (он же центр тайла желоба) на каждом шаге,
  // 0 = дальний угол → 3 = у лап тигра.
  //
  // Шаг по X равен ширине тайла (16), по Y — половине (8): тайлы ложатся
  // встык и ступеньками, образуя сплошной покатый желоб от угла к центру.
  const STEP_POS = [
    // 0: верх-лево
    [{ x: 40, y: 36 }, { x: 56, y: 44 }, { x: 72, y: 52 }, { x: 88, y: 60 }],
    // 1: низ-лево
    [{ x: 40, y: 156 }, { x: 56, y: 148 }, { x: 72, y: 140 }, { x: 88, y: 132 }],
    // 2: верх-право
    [{ x: 216, y: 36 }, { x: 200, y: 44 }, { x: 184, y: 52 }, { x: 168, y: 60 }],
    // 3: низ-право
    [{ x: 216, y: 156 }, { x: 200, y: 148 }, { x: 184, y: 140 }, { x: 168, y: 132 }],
  ];

  // Центр тигра на каждом желобе. Не совпадает с шагом 3: горшочек должен
  // докатиться тигру в лапы, то есть лечь на край его спрайта, а не на грудь.
  const TIGER_POS = [
    { x: 104, y: 68 },  // 0 up-left
    { x: 104, y: 124 }, // 1 down-left
    { x: 152, y: 68 },  // 2 up-right
    { x: 152, y: 124 }, // 3 down-right
  ];

  const TIGER_W = 32;
  const TIGER_H = 40;

  // Ниша под каждым из четырёх мест тигра — второй тон фона (раздел 2).
  // Чуть больше спрайта тигра, чтобы вокруг него оставалась рамка.
  const NICHE_W = 38;
  const NICHE_H = 48;

  // --- Отрисовка спрайтов (раздел 10) -------------------------------------
  // Спрайт — массив строк, символ = индекс палитры, '.' = прозрачность.
  // Каждый спрайт один раз запекается в offscreen-canvas: рисовать по пикселю
  // на каждый кадр незачем, а drawImage целочисленных координат остаётся
  // попиксельно точным.
  const spriteCache = new Map();

  function bake(sprite) {
    const cached = spriteCache.get(sprite);
    if (cached) return cached;

    const h = sprite.length;
    const w = sprite[0].length;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d');
    octx.imageSmoothingEnabled = false;

    const colors = Game.paletteByIndex;
    for (let r = 0; r < h; r++) {
      const row = sprite[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.') continue;
        octx.fillStyle = colors[parseInt(ch, 36)];
        octx.fillRect(c, r, 1, 1);
      }
    }

    spriteCache.set(sprite, off);
    return off;
  }

  function drawSprite(ctx, sprite, x, y) {
    ctx.drawImage(bake(sprite), Math.round(x), Math.round(y));
  }

  function drawSpriteAt(ctx, sprite, cx, cy) {
    const img = bake(sprite);
    ctx.drawImage(img, Math.round(cx - img.width / 2), Math.round(cy - img.height / 2));
  }

  // --- Поле ---------------------------------------------------------------
  // Фон заливается не здесь, а в renderPlaying: поле умеет трястись, и если
  // трясти вместе с фоном, по краям экрана вылезут дыры.
  function drawField(ctx) {
    // Ниши: показывают все четыре места, куда тигр может прыгнуть, — иначе
    // пустые позиции никак не читаются, ведь тигр всегда только один.
    ctx.fillStyle = P.bg1;
    for (const t of TIGER_POS) {
      ctx.fillRect(t.x - NICHE_W / 2, t.y - NICHE_H / 2 + 4, NICHE_W, NICHE_H);
    }

    // Желоба: по тайлу 16×16 на каждый шаг, встык и ступеньками.
    for (let c = 0; c < STEP_POS.length; c++) {
      for (let s = 0; s < STEP_POS[c].length; s++) {
        const pos = STEP_POS[c][s];
        drawSpriteAt(ctx, S.CHUTE_TILE, pos.x, pos.y);
      }
    }

    // Помост под каждым местом — тигру нужна опора под лапами, а пустому
    // месту — отметка пола.
    for (const t of TIGER_POS) {
      const y = t.y + TIGER_H / 2;
      ctx.fillStyle = P.wood1;
      ctx.fillRect(t.x - TIGER_W / 2 - 2, y, TIGER_W + 4, 2);
      ctx.fillStyle = P.wood2;
      ctx.fillRect(t.x - TIGER_W / 2 - 2, y + 2, TIGER_W + 4, 2);
    }
  }

  function drawTiger(ctx) {
    const t = Game.state.tiger;
    if (!t) return;
    const key =
      (t.level === 'up' ? 'up' : 'down') + (t.side === 'left' ? 'Left' : 'Right');
    const pos = TIGER_POS[Game.posToChute(t.side, t.level)];
    drawSpriteAt(ctx, S.TIGER[key], pos.x, pos.y);
  }

  function drawPots(ctx) {
    for (const pot of Game.state.pots) {
      const pos = STEP_POS[pot.chute][pot.step];
      if (!pos) continue;
      drawSpriteAt(ctx, pot.type === 'green' ? S.POT_GREEN : S.POT_RED, pos.x, pos.y);
    }
  }

  // --- Растровый шрифт (раздел 7: без fillText) ---------------------------
  function drawGlyph(ctx, glyph, x, y) {
    for (let r = 0; r < glyph.length; r++) {
      const row = glyph[r];
      for (let c = 0; c < row.length; c++) {
        if (row[c] === '#') ctx.fillRect(x + c, y + r, 1, 1);
      }
    }
  }

  // Масштаб только целочисленный: крупная надпись — тот же шрифт 5×7,
  // растянутый в целое число раз, а не второй шрифт и не растянутый растр.
  function drawGlyphScaled(ctx, glyph, x, y, scale) {
    for (let r = 0; r < glyph.length; r++) {
      const row = glyph[r];
      for (let c = 0; c < row.length; c++) {
        if (row[c] === '#') {
          ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
        }
      }
    }
  }

  function textWidth(text, scale) {
    const s = scale || 1;
    // Последний символ не тянет за собой межбуквенный пробел.
    return text.length * (Game.font.W + 1) * s - s;
  }

  function drawText(ctx, text, x, y, color, scale) {
    const F = Game.font;
    const s = scale || 1;
    ctx.fillStyle = color;
    let cx = x;
    for (const ch of text) {
      if (ch !== ' ') {
        const g = F.glyphs[ch];
        if (g) {
          if (s === 1) drawGlyph(ctx, g, cx, y);
          else drawGlyphScaled(ctx, g, cx, y, s);
        }
      }
      cx += (F.W + 1) * s; // 1 пиксель между символами, тоже масштабируется
    }
  }

  // Текст по центру относительно заданной середины.
  function drawTextMid(ctx, text, midX, y, color, scale) {
    drawText(ctx, text, Math.round(midX - textWidth(text, scale) / 2), y, color, scale);
  }

  // --- HUD (раздел 7) ------------------------------------------------------
  function drawHUD(ctx) {
    const s = Game.state;

    // Слева — счёт с ведущими нулями, ширина фиксирована (не дёргается).
    drawText(ctx, 'SCORE ' + String(s.score).padStart(3, '0'), 4, 3, P.white);

    // Справа — 5 сердец. Полсердца — отдельный спрайт с целым контуром.
    const HW = Game.HEART_W;
    const gap = 1;
    const count = 5;
    const hx = LOGICAL_W - 4 - (count * HW + (count - 1) * gap);
    const hy = 3;
    const fx = s.fx;
    for (let i = 0; i < count; i++) {
      const x = hx + i * (HW + gap);
      // Подсветка пополнившегося сердца (раздел 6): рамка вокруг него, а не
      // перекраска — заливка сердца несёт информацию о жизнях.
      if (fx.heartGlow > 0 && fx.heartIndex === i) {
        ctx.fillStyle = P.white;
        ctx.fillRect(x - 1, hy - 1, HW + 2, Game.HEART_H + 2);
        ctx.fillStyle = P.bg0;
        ctx.fillRect(x, hy, HW, Game.HEART_H);
      }
      const halves = s.lives - i * 2; // сколько полусердец приходится на это сердце
      const spr = halves >= 2 ? S.HEART_FULL : halves === 1 ? S.HEART_HALF : S.HEART_EMPTY;
      drawSprite(ctx, spr, x, hy);
    }

    // Под сердцами — 10 точек стрика, заполняются по одной. На срабатывании
    // все десять коротко вспыхивают белым: счётчик как раз обнулился, и без
    // вспышки это выглядело бы как «прогресс просто пропал».
    const sy = hy + Game.HEART_H + 2;
    const glow = fx.streakGlow > 0;
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = glow ? P.white : (i < s.streak ? P.green : P.wood2);
      ctx.fillRect(hx + i * 5, sy, 3, 3);
    }
  }

  // Тряска (раздел 5): не случайная, а по короткому фиксированному кругу —
  // так рывок читается как удар, а не как дрожь, и выглядит одинаково всегда.
  const SHAKE_PATTERN = [[2, -1], [-2, 1], [1, 2], [-1, -2]];

  function renderPlaying(ctx) {
    const fx = Game.state.fx;
    beginUI();

    // Фон без сдвига. На вспышке он краснеет — этого хватает, чтобы ошибка
    // читалась даже боковым зрением, и не нужна полупрозрачность, которой
    // в палитре всё равно нет.
    ctx.fillStyle = fx.flash > 0 ? P.redDark : P.bg0;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // Задник — сразу поверх заливки и вне тряски: трясётся поле, а не стена
    // за ним. На вспышке задник не рисуется вовсе, и экран честно краснеет
    // целиком — так ошибка заметнее, чем если бы поверх осталась фактура.
    if (fx.flash === 0) Game.Backdrop.draw(ctx);

    const shift = fx.shake > 0
      ? SHAKE_PATTERN[(SHAKE_PATTERN.length - fx.shake) % SHAKE_PATTERN.length]
      : null;

    if (shift) {
      ctx.save();
      ctx.translate(shift[0], shift[1]);
    }
    drawField(ctx);
    drawTiger(ctx); // тигр под горшочками — пойманный горшочек виден «в лапах»
    drawPots(ctx);
    if (shift) ctx.restore();

    if (fx.flash > 0) {
      ctx.fillStyle = P.red;
      ctx.fillRect(0, 0, LOGICAL_W, 2);
      ctx.fillRect(0, LOGICAL_H - 2, LOGICAL_W, 2);
      ctx.fillRect(0, 0, 2, LOGICAL_H);
      ctx.fillRect(LOGICAL_W - 2, 0, 2, LOGICAL_H);
    }

    // HUD не трясём: прыгающий счёт и сердца читать невозможно, а смысл
    // эффекта — в поле, где ошибка и произошла.
    drawHUD(ctx);
    drawSoundButton(ctx);
  }

  // --- Кнопки (разделы 11, 12) ---------------------------------------------
  // Кнопки нарисованы в той же пиксельной стилистике, а не HTML-элементы
  // поверх canvas — иначе интерфейс развалился бы на два визуальных языка.
  // Каждый кадр список кнопок собирается заново, и главный цикл проверяет
  // по нему попадание клика.
  const ui = { buttons: [] };

  function beginUI() {
    ui.buttons.length = 0;
  }

  function addButton(id, x, y, w, h) {
    ui.buttons.push({ id, x, y, w, h });
  }

  // Идём с конца: если кнопки перекроются, срабатывает нарисованная поверх.
  function hitButton(px, py) {
    for (let i = ui.buttons.length - 1; i >= 0; i--) {
      const b = ui.buttons[i];
      if (px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h) return b.id;
    }
    return null;
  }

  function drawButton(ctx, id, label, midX, y, enabled) {
    const padX = 8;
    const w = textWidth(label, 1) + padX * 2;
    const h = 15;
    const x = Math.round(midX - w / 2);

    ctx.fillStyle = P.outline;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);

    // Пока кнопка не принимает ввод, она заметно тусклее — иначе игрок жмёт
    // в пустоту и не понимает, почему ничего не происходит.
    ctx.fillStyle = enabled ? P.wood1 : P.wood2;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = enabled ? P.wood0 : P.wood1;
    ctx.fillRect(x, y, w, 2);

    drawText(ctx, label, x + padX, y + 4, enabled ? P.white : P.wood0);

    addButton(id, x, y, w, h);
  }

  // Кнопка отключения звука (раздел 12). Одна и та же на всех трёх экранах,
  // внизу по центру: и на поле не мешает, и искать её не надо.
  const SOUND_BTN = { x: LOGICAL_W / 2 - 5, y: LOGICAL_H - 14, hit: 13 };

  function drawSoundButton(ctx) {
    const muted = Game.Sound ? Game.Sound.isMuted() : false;
    drawSprite(ctx, muted ? S.SOUND_OFF : S.SOUND_ON, SOUND_BTN.x, SOUND_BTN.y);
    // Область клика чуть больше значка — попасть в 9 пикселей мышью тяжело.
    addButton('sound', SOUND_BTN.x - 2, SOUND_BTN.y - 2, SOUND_BTN.hit, SOUND_BTN.hit);
  }

  // --- Заглушка «СКОРО» ----------------------------------------------------
  // Рейтинга ещё нет (сети и базы нет вовсе), но кнопка уже должна стоять на
  // своём месте — иначе потом придётся перекраивать оба экрана. Нажатие
  // отвечает надписью, а не тишиной. Счётчик — в кадрах, как и эффекты.
  const SOON_FRAMES = 96;
  ui.soon = 0;

  function showSoon() {
    ui.soon = SOON_FRAMES;
  }

  function tickUI() {
    if (ui.soon > 0) ui.soon -= 1;
  }

  // --- Строка из текста и спрайтов вперемешку ------------------------------
  // Нужна там, где иконка стоит внутри фразы, а не отдельной колонкой.
  // Спрайт центрируется по высоте строки текста.
  function drawMixedLine(ctx, parts, midX, y, color) {
    const GAP = 2;
    let w = 0;
    for (let i = 0; i < parts.length; i++) {
      if (i) w += GAP;
      w += parts[i].sprite ? parts[i].sprite[0].length : textWidth(parts[i].text, 1);
    }
    let x = Math.round(midX - w / 2);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (i) x += GAP;
      if (p.sprite) {
        drawSprite(ctx, p.sprite, x, y + Math.round((Game.font.H - p.sprite.length) / 2));
        x += p.sprite[0].length;
      } else {
        drawText(ctx, p.text, x, y, color);
        x += textWidth(p.text, 1);
      }
    }
  }

  // --- Онбординг (раздел 11) ----------------------------------------------
  // Правила выровнены в три колонки: иконка последствия — что случилось —
  // чем это кончилось. Иконка слева показывает именно последствие, а не тип
  // ханипота: пропущенный зелёный — это половинка сердца, пойманный красный —
  // пустое сердце. Все иконки — те же спрайты, что и в игре, отдельных
  // «иллюстраций» для онбординга нет.
  const RULE_ICON_X = 10;
  const RULE_TEXT_X = 32;
  const RULE_EFFECT_RIGHT = 246;
  const RULE_ROW_H = 12;

  const RULES = [
    { icon: 'pot',    text: 'ЗЕЛЁНЫЙ ХАНИПОТ',      effect: '+1 ОЧКО',   good: true },
    { icon: 'half',   text: 'ПРОПУСТИЛ ЗЕЛЁНЫЙ',    effect: '-ПОЛЖИЗНИ', good: false },
    { icon: 'empty',  text: 'ПОЙМАЛ КРАСНЫЙ',       effect: '-1 ЖИЗНЬ',  good: false },
    { icon: 'streak', text: '10 ЗЕЛЁНЫХ ХП ПОДРЯД', effect: '+ПОЛЖИЗНИ', good: true },
  ];

  // Точки стрика — не спрайт, а те же прямоугольники, которыми нарисован
  // индикатор в HUD. Рисуем 4 заполненные: этого хватает, чтобы игрок узнал
  // индикатор, когда увидит его над полем.
  function drawStreakIcon(ctx, x, y, count) {
    ctx.fillStyle = P.green;
    for (let i = 0; i < count; i++) ctx.fillRect(x + i * 4, y, 3, 3);
  }

  function drawRuleIcon(ctx, kind, x, rowY) {
    if (kind === 'pot') drawSprite(ctx, S.POT_GREEN, x, rowY);
    else if (kind === 'half') drawSprite(ctx, S.HEART_HALF, x + 1, rowY + 2);
    else if (kind === 'empty') drawSprite(ctx, S.HEART_EMPTY, x + 1, rowY + 2);
    else if (kind === 'streak') drawStreakIcon(ctx, x, rowY + 5, 4);
  }

  const CONTROLS = [
    [S.ARROW_LEFT, 'ВЛЕВО'],
    [S.ARROW_RIGHT, 'ВПРАВО'],
    [S.ARROW_UP, 'ВВЕРХ'],
    [S.ARROW_DOWN, 'ВНИЗ'],
  ];

  // Строка «ТЫ: ИМЯ   СМЕНИТЬ». Имя показываем, только если игрок уже
  // представился; «СМЕНИТЬ» — кликабельная надпись, а не кнопка: действие
  // редкое, и полноценная кнопка перетягивала бы внимание с «НАЧАТЬ».
  function drawPlayerLine(ctx, midX, y) {
    if (!Game.Profile.hasProfile()) return;
    const me = 'ТЫ: ' + Game.Profile.profile.name;
    const change = 'СМЕНИТЬ';
    const GAP = 8;
    const cw = textWidth(change, 1);
    const w = textWidth(me, 1) + GAP + cw;

    let x = Math.round(midX - w / 2);
    drawText(ctx, me, x, y, P.white);
    x += textWidth(me, 1) + GAP;
    drawText(ctx, change, x, y, P.wood0);
    ctx.fillStyle = P.wood0;
    ctx.fillRect(x, y + 8, cw, 1); // подчёркивание: надпись кликабельная
    addButton('change', x - 3, y - 3, cw + 6, 14);
  }

  // Кнопка рейтинга и ответ «СКОРО» над ней. Одна и та же на онбординге и
  // гейм-овере, в одном и том же месте — чтобы её не искали заново.
  function drawRatingButton(ctx, y) {
    const midX = RULE_EFFECT_RIGHT - (textWidth('РЕЙТИНГ', 1) + 16) / 2;
    if (ui.soon > 0) drawTextMid(ctx, 'СКОРО', midX, y - 10, P.honey);
    drawButton(ctx, 'rating', 'РЕЙТИНГ', midX, y, true);
  }

  function renderOnboarding(ctx) {
    const mid = LOGICAL_W / 2;
    beginUI();

    ctx.fillStyle = P.bg0;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    drawTextMid(ctx, 'ТИГР И ХАНИПОТЫ', mid, 6, P.honey, 2);
    drawPlayerLine(ctx, mid, 25);

    // Единственное место, где игрок видит оба ханипота до начала партии,
    // поэтому иконки стоят прямо рядом со своими словами.
    drawMixedLine(ctx, [
      { text: 'ЛОВИ ЗЕЛЁНЫЕ' },
      { sprite: S.POT_GREEN },
      { text: 'ХАНИПОТЫ, ИЗБЕГАЙ КРАСНЫХ' },
      { sprite: S.POT_RED },
    ], mid, 40, P.white);

    // Подложка под колонкой иконок вторым тоном фона. Контур сердец — почти
    // чёрный, и на bg0 пустое сердце просто не видно; на bg1 читается. Заодно
    // колонка иконок выглядит колонкой, а не четырьмя случайными значками.
    ctx.fillStyle = P.bg1;
    ctx.fillRect(RULE_ICON_X - 3, 52, 20, RULES.length * RULE_ROW_H + 2);

    for (let i = 0; i < RULES.length; i++) {
      const rule = RULES[i];
      const rowY = 54 + i * RULE_ROW_H;
      drawRuleIcon(ctx, rule.icon, RULE_ICON_X, rowY);
      drawText(ctx, rule.text, RULE_TEXT_X, rowY + 2, P.white);
      drawText(ctx, rule.effect,
        RULE_EFFECT_RIGHT - textWidth(rule.effect, 1), rowY + 2,
        rule.good ? P.green : P.honey);
    }

    // Схема управления: четыре стрелки с подписями, в два ряда.
    for (let i = 0; i < CONTROLS.length; i++) {
      const arrow = CONTROLS[i][0];
      const label = CONTROLS[i][1];
      const x = 64 + (i % 2) * 78;
      const y = 106 + Math.floor(i / 2) * 12;
      drawSprite(ctx, arrow, x, y);
      drawText(ctx, label, x + 10, y, P.white);
    }

    drawButton(ctx, 'start', 'НАЧАТЬ', mid, 130, true);
    drawTextMid(ctx, 'ВВОД, ПРОБЕЛ ИЛИ КЛИК', mid, 149, P.wood0);

    drawText(ctx, 'РЕКОРД ' + String(Game.state.best).padStart(3, '0'), 10, 170, P.honey);
    drawRatingButton(ctx, 166);

    drawSoundButton(ctx);
  }

  // --- Экран имени --------------------------------------------------------
  // Показывается один раз: при первом заходе или по «СМЕНИТЬ» на онбординге.
  // Поле ввода нарисовано, а не сделано HTML-инпутом: инпут поверх canvas
  // притащил бы системный шрифт и сломал бы пиксельную стилистику. Внутри —
  // просто строка из profile.js и мигающий курсор.
  const FIELD_H = 13;
  const FIELD_LABEL_X = 74;
  const FIELD_X = 97;
  const FIELD_W_NAME = 84; // 12 символов + место под курсор
  const FIELD_W_PIN = 36;  // 4 цифры + место под курсор
  const FIELD_Y_NAME = 58;
  const FIELD_Y_PIN = 80;

  function drawInputField(ctx, id, x, y, w, text, focused, blink) {
    // Рамка активного поля — медовая: цветом видно, куда пойдёт следующая
    // буква, даже когда курсор в фазе «погас».
    ctx.fillStyle = focused ? P.honey : P.wood1;
    ctx.fillRect(x - 1, y - 1, w + 2, FIELD_H + 2);
    ctx.fillStyle = P.bg1;
    ctx.fillRect(x, y, w, FIELD_H);

    drawText(ctx, text, x + 3, y + 3, P.white);

    if (focused && blink) {
      const tw = text.length ? textWidth(text, 1) + 2 : 0;
      ctx.fillStyle = P.white;
      ctx.fillRect(x + 3 + tw, y + 3, 5, Game.font.H);
    }

    addButton(id, x - 1, y - 1, w + 2, FIELD_H + 2);
  }

  function renderName(ctx, blink) {
    const mid = LOGICAL_W / 2;
    const draft = Game.Profile.draft;
    beginUI();

    ctx.fillStyle = P.bg0;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    drawTextMid(ctx, 'ПРЕДСТАВЬСЯ', mid, 22, P.honey, 2);

    drawText(ctx, 'ИМЯ', FIELD_LABEL_X, FIELD_Y_NAME + 3, P.white);
    drawInputField(ctx, 'field-name', FIELD_X, FIELD_Y_NAME, FIELD_W_NAME,
      draft.name, draft.field === 'name', blink);

    drawText(ctx, 'ПИН', FIELD_LABEL_X, FIELD_Y_PIN + 3, P.white);
    drawInputField(ctx, 'field-pin', FIELD_X, FIELD_Y_PIN, FIELD_W_PIN,
      draft.pin, draft.field === 'pin', blink);

    // Зачем вообще ПИН — без объяснения поле выглядит лишним препятствием.
    drawTextMid(ctx, 'ПИН НУЖЕН, ЧТОБЫ ВЕРНУТЬСЯ ПОД', mid, 106, P.wood0);
    drawTextMid(ctx, 'СВОИМ ИМЕНЕМ С ДРУГОГО КОМПА', mid, 116, P.wood0);

    drawButton(ctx, 'go', 'ВПЕРЁД!', mid, 136, Game.Profile.draftValid());

    drawTextMid(ctx, 'ИМЯ 2-12 СИМВОЛОВ, ПИН - 4 ЦИФРЫ', mid, 156, P.wood0);
    // «ТАБ» кириллицей: латинское TAB в этом шрифте неотличимо от «ТАВ».
    drawTextMid(ctx, 'ТАБ - ДРУГОЕ ПОЛЕ, ВВОД - ГОТОВО', mid, 166, P.wood0);

    drawSoundButton(ctx);
  }

  // --- Гейм-овер (раздел 11) ----------------------------------------------
  function renderGameover(ctx, buttonEnabled) {
    const mid = LOGICAL_W / 2;
    const s = Game.state;
    beginUI();

    ctx.fillStyle = P.bg0;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    drawTextMid(ctx, 'ИГРА ОКОНЧЕНА', mid, 30, P.white, 2);
    drawTextMid(ctx, 'СЧЁТ ' + String(s.score).padStart(3, '0'), mid, 58, P.honey, 2);

    // Рекорд показываем всегда, а подпись о том, что он побит, — отдельной
    // строкой под ним (раздел 11).
    drawTextMid(ctx, 'РЕКОРД ' + String(s.best).padStart(3, '0'), mid, 82, P.wood0);
    if (s.newRecord) {
      drawTextMid(ctx, 'НОВЫЙ РЕКОРД!', mid, 94, P.green);
    }

    // «Сыграть ещё раз» ведёт сразу в игру: экран имени тут не показывается.
    drawButton(ctx, 'start', 'СЫГРАТЬ ЕЩЁ РАЗ', mid, 116, buttonEnabled);
    drawTextMid(ctx, 'ВВОД, ПРОБЕЛ ИЛИ КЛИК', mid, 138, P.wood0);

    drawRatingButton(ctx, 166);

    drawSoundButton(ctx);
  }

  Game.geometry = { CENTER, STEP_POS, TIGER_POS, TIGER_W, TIGER_H };
  Game.ui = ui;
  Game.hitButton = hitButton;
  Game.drawSprite = drawSprite;
  Game.drawSpriteAt = drawSpriteAt;
  Game.drawText = drawText;
  Game.textWidth = textWidth;
  Game.drawTextMid = drawTextMid;
  Game.renderPlaying = renderPlaying;
  Game.renderOnboarding = renderOnboarding;
  Game.renderName = renderName;
  Game.renderGameover = renderGameover;
  Game.showSoon = showSoon;
  Game.tickUI = tickUI;
})(window.Game);
