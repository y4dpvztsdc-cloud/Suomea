const { test, expect } = require('@playwright/test');
const data = require('../data/lessons/1-sentences.json');

const WORD = /[A-Za-zÅÄÖåäö]+/g;
const index = {};
Object.entries(data.groups).forEach(([name, g]) => g.forms.forEach(f => { index[f.toLowerCase()] = name; }));

test.describe('данные предложений', () => {
  test('две части по 200 пар вопрос/ответ', () => {
    expect(data.parts.map(p => p.id)).toEqual(['affirmative', 'negative']);
    for (const part of data.parts) {
      expect(part.pairs).toHaveLength(200);
      for (const pair of part.pairs) {
        for (const s of [pair.q, pair.a]) {
          expect(s.fi).toMatch(/[.?]$/);
          expect(s.ru.length).toBeGreaterThan(0);
        }
        expect(pair.q.fi).toMatch(/\?$/);
      }
    }
  });

  test('ответы: утвердительные начинаются с Joo или без него, отрицательные — с отрицания', () => {
    for (const pair of data.parts[1].pairs) {
      expect(pair.a.fi).toMatch(/^(En|Et|Ei|Emme|Ette|Eivät),/);
    }
    for (const pair of data.parts[0].pairs) {
      expect(pair.a.fi).not.toMatch(/\b(en|et|ei|emme|ette|eivät)\b/i);
    }
  });

  test('каждое слово предложений есть ровно в одной группе', () => {
    const seen = new Set();
    Object.values(data.groups).forEach(g => g.forms.forEach(f => {
      expect(seen.has(f.toLowerCase())).toBe(false);
      seen.add(f.toLowerCase());
    }));
    for (const part of data.parts) {
      for (const pair of part.pairs) {
        for (const w of (pair.q.fi + ' ' + pair.a.fi).match(WORD)) {
          expect(index[w.toLowerCase()], w).toBeDefined();
        }
      }
    }
  });

  test('в каждой группе хватает слов на 5 неверных вариантов', () => {
    for (const g of Object.values(data.groups)) {
      const size = g.forms.length + (g.pad ? data.groups[g.pad].forms.length : 0);
      expect(size).toBeGreaterThanOrEqual(6);
    }
  });
});

test.describe('составление предложений', () => {
  const task = page => page.evaluate(() => currentTask());

  // Выбирает на экране слово без учёта регистра
  const pick = (page, word) =>
    page.locator('.word-option').filter({ hasText: new RegExp(`^${word}$`, 'i') }).first().click();

  const pickWrong = (page, word) =>
    page.locator('.word-option').filter({ hasNotText: new RegExp(`^${word}$`, 'i') }).first().click();

  async function build(page, words) {
    for (const w of words) await pick(page, w);
  }

  // «Нажать на пустое поле экрана»
  const tapEmpty = page => page.locator('.tap-hint').click();

  async function solve(page, correct = true) {
    const words = (await task(page)).tokens.map(x => x.w);
    await build(page, words.slice(0, -1));
    if (correct) await pick(page, words.at(-1));
    else await pickWrong(page, words.at(-1));
    await tapEmpty(page);
  }

  // Заполняет клетки: ok верных, затем err ошибок, текущей делает клетку pos
  const setCells = (page, ok, err = 0, pos = ok + err) => page.evaluate(([ok, err, pos]) => {
    ps.cells = Array(100).fill('todo').map((_, i) => (i < ok ? 'ok' : i < ok + err ? 'err' : 'todo'));
    ps.pos = pos;
    resetSentence();
    renderSentences();
  }, [ok, err, pos]);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__spoken = [];
      window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: {
          getVoices: () => [{ name: 'Satu', lang: 'fi-FI', voiceURI: 'Satu' }],
          speak: u => window.__spoken.push(u.text),
          cancel: () => {},
          addEventListener: () => {},
        },
      });
    });
    await page.goto('/');
    await page.click('#lesson-1');
    await page.click('#open-part-1-1');
    await expect(page.locator('.word-option')).toHaveCount(6);
  });

  test('экран: русское предложение, пустое поле ответа, 6 вариантов, 100 клеток', async ({ page }) => {
    const t = await task(page);
    await expect(page.locator('#back')).toContainText('Урок 1.1');
    await expect(page.locator('text=Часть 1 из 2')).toHaveCount(0);
    await expect(page.locator('.sentence-ru')).toHaveText(t.ru);
    await expect(page.locator('.chip')).toHaveCount(0);
    await expect(page.locator('#stat-rating')).toHaveText('0.0');
    await expect(page.locator('#stat-correct')).toHaveText('0');
    await expect(page.locator('#stat-wrong')).toHaveText('0');
    await expect(page.locator('.cell')).toHaveCount(100);
    await expect(page.locator('.cell.current')).toHaveCount(1);
    await expect(page.locator('#oops')).toHaveText('Ой, ошибся');
    await expect(page.locator('#help')).toHaveText('Помощь');
  });

  test('пары в случайном порядке, всегда сначала «а» (вопрос), затем «б» (ответ) той же пары', async ({ page }) => {
    const pairs = data.parts[0].pairs;
    const seen = [];
    for (let i = 0; i < 6; i++) {
      const q = await task(page);
      await solve(page, true);
      await tapEmpty(page);
      const a = await task(page);
      await solve(page, true);
      await tapEmpty(page);
      const pair = pairs.find(p => p.q.fi === q.fi);
      expect(pair).toBeDefined();
      expect(a.fi).toBe(pair.a.fi);
      seen.push(pairs.indexOf(pair));
    }
    expect(new Set(seen).size).toBe(6);
    // Порядок пар — случайный, а не по номерам
    const pool = await page.evaluate(() => ps.pool);
    expect(pool).toHaveLength(200);
    expect(pool).not.toEqual([...pool].sort((x, y) => x - y));
  });

  test('варианты: правильное слово и 5 слов из той же группы', async ({ page }) => {
    const t = await task(page);
    for (let pos = 0; pos < t.tokens.length; pos++) {
      const correct = t.tokens[pos].w;
      const labels = await page.locator('.word-option').allTextContents();
      expect(new Set(labels.map(l => l.toLowerCase())).size).toBe(6);
      expect(labels.map(l => l.toLowerCase())).toContain(correct.toLowerCase());
      const group = data.groups[index[correct.toLowerCase()]];
      const allowed = group.forms.concat(group.pad ? data.groups[group.pad].forms : []).map(f => f.toLowerCase());
      labels.forEach(l => expect(allowed).toContain(l.toLowerCase()));
      if (pos === 0) labels.forEach(l => expect(l[0]).toBe(l[0].toUpperCase()));
      await pick(page, correct);
    }
  });

  test('кнопок «Проверить» и «Далее» нет — проверка и переход нажатием на экран', async ({ page }) => {
    const words = (await task(page)).tokens.map(x => x.w);
    await tapEmpty(page); // пока предложение не собрано, нажатие ничего не делает
    expect(await page.evaluate(() => sChecked)).toBe(false);

    await pickWrong(page, words[0]); // по одному слова не проверяются
    await expect(page.locator('.answer-field')).not.toHaveClass(/wrong/);
    await page.click('#oops');
    await build(page, words);
    await expect(page.locator('.word-option')).toHaveCount(0);
    await expect(page.locator('.tap-hint')).toHaveText('Нажмите на экран, чтобы проверить');
    await expect(page.locator('button', { hasText: /Проверить|Далее/ })).toHaveCount(0);

    await tapEmpty(page);
    expect(await page.evaluate(() => sChecked)).toBe(true);
    await expect(page.locator('.tap-hint')).toHaveText('Нажмите на экран, чтобы продолжить');
    await page.locator('.answer-field').click();
    expect(await page.evaluate(() => [ps.pos, sChecked])).toEqual([1, false]);
  });

  test('верно: голубое поле, финская похвала посередине, перевод внизу, звучит ответ', async ({ page }) => {
    const t = await task(page);
    await solve(page, true);
    await expect(page.locator('.answer-field')).toHaveClass(/correct/);
    await expect(page.locator('.chip.bad')).toHaveCount(0);
    await expect(page.locator('.right-answer')).toHaveCount(0);
    const praise = await page.evaluate(() => sPraise);
    await expect(page.locator('.verdict.praise .verdict-fi')).toHaveText(praise.fi);
    await expect(page.locator('.verdict-ru.praise')).toHaveText(praise.ru);
    // Финская фраза выше перевода, перевод — над клетками
    const fiBox = await page.locator('.verdict-fi').boundingBox();
    const ruBox = await page.locator('.verdict-ru').boundingBox();
    const cellsBox = await page.locator('.cells').boundingBox();
    expect(fiBox.y).toBeLessThan(ruBox.y - 40);
    expect(ruBox.y).toBeLessThan(cellsBox.y);
    expect(await page.evaluate(() => window.__spoken)).toEqual([t.fi]);
    await expect(page.locator('#stat-correct')).toHaveText('1');
    await expect(page.locator('.cell').first()).toHaveClass(/ok/);
  });

  test('похвала разная: не повторяется два раза подряд', async ({ page }) => {
    const seen = [];
    for (let i = 0; i < 6; i++) {
      await solve(page, true);
      seen.push(await page.locator('.verdict-fi').textContent());
      await tapEmpty(page);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
    expect(new Set(seen).size).toBeGreaterThan(2);
  });

  test('неверно: красное поле, неверное слово красное, правильный ответ, «Yritä uudelleen!»', async ({ page }) => {
    const t = await task(page);
    const words = t.tokens.map(x => x.w);
    await pick(page, words[0]);
    await pickWrong(page, words[1]);
    await build(page, words.slice(2));
    await tapEmpty(page);

    await expect(page.locator('.answer-field')).toHaveClass(/wrong/);
    await expect(page.locator('.chip.bad')).toHaveCount(1);
    await expect(page.locator('.chip').nth(1)).toHaveClass(/bad/);
    await expect(page.locator('.right-answer')).toHaveText(t.fi);
    await expect(page.locator('.verdict.try-again .verdict-fi')).toHaveText('Yritä uudelleen!');
    await expect(page.locator('.verdict-ru.try-again')).toHaveText('Попробуй снова!');
    expect(await page.evaluate(() => window.__spoken)).toEqual([t.fi]);
    await expect(page.locator('#stat-wrong')).toHaveText('1');
    await expect(page.locator('.cell').first()).toHaveClass(/err/);
  });

  test('после ошибки то же предложение ещё раз; красная клетка остаётся меткой', async ({ page }) => {
    const t = await task(page);
    await solve(page, false);
    await tapEmpty(page);
    expect((await task(page)).fi).toBe(t.fi);
    await expect(page.locator('.cell').nth(0)).toHaveClass(/err/);
    await expect(page.locator('.cell').nth(1)).toHaveClass(/current/);

    await solve(page, true);
    await expect(page.locator('.cell').nth(0)).toHaveClass(/err/);
    await expect(page.locator('.cell').nth(1)).toHaveClass(/ok/);
    await tapEmpty(page);
    // Дальше — ответ «б» той же пары
    const pair = data.parts[0].pairs.find(p => p.q.fi === t.fi);
    expect((await task(page)).fi).toBe(pair.a.fi);
  });

  test('одно предложение — не больше 3 раз подряд', async ({ page }) => {
    const t = await task(page);
    for (let i = 0; i < 3; i++) {
      expect((await task(page)).fi).toBe(t.fi);
      await solve(page, false);
      await tapEmpty(page);
    }
    expect((await task(page)).fi).not.toBe(t.fi);
    await expect(page.locator('.cell.err')).toHaveCount(3);
  });

  test('после 100 клеток новый круг перезаписывает клетки по порядку', async ({ page }) => {
    await page.evaluate(() => {
      ps.shown45 = true; // поздравление с 4.5 уже было
      ps.cells = Array(100).fill('ok');
      ps.cells[0] = 'err';
      ps.pos = 99;
      resetSentence();
      renderSentences();
    });
    await solve(page, true);
    await tapEmpty(page);
    expect(await page.evaluate(() => [ps.round, ps.pos])).toEqual([2, 0]);
    await expect(page.locator('.cell').first()).toHaveClass(/err/);
    await expect(page.locator('.cell').first()).toHaveClass(/current/);
    await solve(page, true);
    await expect(page.locator('.cell.err')).toHaveCount(0);
    await expect(page.locator('#stat-rating')).toHaveText('5.0');
  });

  test('рейтинг: 0.1 звезды за каждые 2 голубые клетки, 5.0 — все 100', async ({ page }) => {
    await solve(page, true);
    await expect(page.locator('#stat-rating')).toHaveText('0.0');
    await tapEmpty(page);
    await solve(page, true);
    await expect(page.locator('#stat-rating')).toHaveText('0.1');
    await tapEmpty(page);

    await setCells(page, 60, 10);
    await expect(page.locator('#stat-rating')).toHaveText('3.0');
  });

  test('4.5 — поздравление, можно перейти к 1.2 или продолжить', async ({ page }) => {
    await setCells(page, 89);
    await solve(page, true);
    await expect(page.locator('#stat-rating')).toHaveText('4.5');
    await tapEmpty(page);

    await expect(page.locator('#congrats h2')).toHaveText('Поздравляем, вам доступен следующий урок!');
    await expect(page.locator('#congrats')).toContainText('Перейти к следующему или довести этот урок до совершенства?');
    await expect(page.locator('#keep-going')).toHaveText('Продолжить');
    await page.click('#keep-going');
    await expect(page.locator('.sentence-ru')).toBeVisible();
    expect(await page.evaluate(() => ps.pos)).toBe(90);

    // Второй раз поздравление не показывается
    await solve(page, true);
    await tapEmpty(page);
    await expect(page.locator('#congrats')).toHaveCount(0);

    await page.click('#back');
    await expect(page.locator('#open-part-1-2')).not.toHaveClass(/locked/);
    await page.click('#open-part-1-2');
    await expect(page.locator('#back')).toContainText('Урок 1.2');
    const q = await task(page);
    expect(data.parts[1].pairs.some(p => p.q.fi === q.fi)).toBe(true);
  });

  test('кнопка «Перейти к уроку 1.2» открывает отрицание', async ({ page }) => {
    await setCells(page, 89);
    await solve(page, true);
    await tapEmpty(page);
    await page.click('#go-next');
    await expect(page.locator('#back')).toContainText('Урок 1.2');
    await expect(page.locator('#stat-rating')).toHaveText('0.0');
  });

  test('5.0 — «Поздравляем, урок пройден!» и можно продолжить', async ({ page }) => {
    await page.evaluate(() => { ps.shown45 = true; });
    await setCells(page, 99);
    await solve(page, true);
    await expect(page.locator('#stat-rating')).toHaveText('5.0');
    await tapEmpty(page);
    await expect(page.locator('#congrats h2')).toHaveText('Поздравляем, урок пройден!');
    await page.click('#keep-going');
    expect(await page.evaluate(() => [ps.round, ps.pos])).toEqual([2, 0]);
    await expect(page.locator('.sentence-ru')).toBeVisible();
  });

  test('ниже 5.0 поздравления «урок пройден» нет', async ({ page }) => {
    await page.evaluate(() => { ps.shown45 = true; });
    await setCells(page, 97, 1);
    await solve(page, true);
    await expect(page.locator('#stat-rating')).toHaveText('4.9');
    await tapEmpty(page);
    await expect(page.locator('#congrats')).toHaveCount(0);
  });

  test('прогресс сохраняется: клетки, счётчики, рейтинг в списках', async ({ page }) => {
    await solve(page, true);
    await tapEmpty(page);
    await solve(page, true);
    await tapEmpty(page);
    await solve(page, false);
    await page.reload(); // перезагрузка сразу после ошибки
    await expect(page.locator('#lesson-1 .circle')).toHaveText('0.0'); // среднее 1.1 и 1.2
    await page.click('#lesson-1');
    await expect(page.locator('#open-part-1-1 .circle')).toHaveText('0.1');
    await expect(page.locator('#open-part-1-2')).toHaveClass(/locked/);
    await page.click('#open-part-1-1');
    await expect(page.locator('#stat-correct')).toHaveText('2');
    await expect(page.locator('#stat-wrong')).toHaveText('1');
    await expect(page.locator('.cell.ok')).toHaveCount(2);
    await expect(page.locator('.cell.err')).toHaveCount(1);
    expect(await page.evaluate(() => ps.pos)).toBe(3);
    await expect(page.locator('.cell').nth(3)).toHaveClass(/current/);
  });

  test('«Ой, ошибся» убирает последнее слово; нажатие на слово — его и следующие', async ({ page }) => {
    const words = (await task(page)).tokens.map(x => x.w);
    await build(page, words.slice(0, 3));
    await page.click('#oops');
    expect(await page.evaluate(() => sBuilt)).toEqual(words.slice(0, 2));
    await page.locator('.chip[data-pos="0"]').click();
    expect(await page.evaluate(() => sBuilt)).toEqual([]);
  });

  test('«Помощь» открывает описание урока, «назад» возвращает к тому же предложению', async ({ page }) => {
    const t = await task(page);
    await pick(page, t.tokens[0].w);
    await page.click('#help');
    await expect(page.locator('.description h2')).toContainText('olla');
    await page.click('#back');
    await expect(page.locator('.sentence-ru')).toHaveText(t.ru);
    await expect(page.locator('.chip')).toHaveCount(1);
  });
});
