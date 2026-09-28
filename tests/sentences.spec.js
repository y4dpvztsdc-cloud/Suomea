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
    await page.click('#open-sentences');
    await expect(page.locator('.word-option')).toHaveCount(6);
  });

  test('экран: русское предложение, пустое поле ответа, 6 вариантов, счётчики', async ({ page }) => {
    const t = await task(page);
    await expect(page.locator('.part-label')).toContainText('Часть 1 из 2');
    await expect(page.locator('.sentence-ru')).toHaveText(t.ru);
    await expect(page.locator('.chip')).toHaveCount(0);
    await expect(page.locator('#stat-rating')).toHaveText('0.0');
    await expect(page.locator('#stat-correct')).toHaveText('0');
    await expect(page.locator('#stat-wrong')).toHaveText('0');
    await expect(page.locator('.cell')).toHaveCount(20);
    await expect(page.locator('.cell.current')).toHaveCount(1);
    await expect(page.locator('#oops')).toHaveText('Ой, ошибся');
    await expect(page.locator('#help')).toHaveText('Помощь');
  });

  test('урок начинается с вопроса, за ним идёт ответ', async ({ page }) => {
    const queue = await page.evaluate(() => sQueue);
    expect(queue).toHaveLength(20);
    queue.forEach((t, i) => expect(t.fi.endsWith('?')).toBe(i % 2 === 0));
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
    const t = await task(page);
    const words = t.tokens.map(x => x.w);
    await tapEmpty(page); // пока предложение не собрано, нажатие ничего не делает
    expect(await page.evaluate(() => sChecked)).toBe(false);

    await pickWrong(page, words[0]); // по одному слова не проверяются
    await expect(page.locator('.answer-field')).not.toHaveClass(/wrong/);
    await build(page, words.slice(1));
    await expect(page.locator('.word-option')).toHaveCount(0);
    await expect(page.locator('.tap-hint')).toHaveText('Нажмите на экран, чтобы проверить');
    await expect(page.locator('button', { hasText: /Проверить|Далее/ })).toHaveCount(0);

    await tapEmpty(page);
    expect(await page.evaluate(() => sChecked)).toBe(true);
    await expect(page.locator('.tap-hint')).toHaveText('Нажмите на экран, чтобы продолжить');
    await page.locator('.answer-field').click();
    expect(await page.evaluate(() => [sIdx, sChecked])).toEqual([1, false]);
  });

  test('верное предложение: зелёное, звучит финский вариант, ✓ и рейтинг растут', async ({ page }) => {
    const t = await task(page);
    await solve(page, true);
    await expect(page.locator('.answer-field')).toHaveClass(/correct/);
    await expect(page.locator('.right-answer')).toHaveCount(0);
    expect(await page.evaluate(() => window.__spoken)).toEqual([t.fi]);
    await expect(page.locator('#stat-correct')).toHaveText('1');
    await expect(page.locator('#stat-wrong')).toHaveText('0');
    await expect(page.locator('#stat-rating')).toHaveText('0.1');
    await expect(page.locator('.cell.ok')).toHaveCount(1);
  });

  test('неверное: показан и звучит правильный вариант, ✗ растёт, клетка оранжевая', async ({ page }) => {
    const t = await task(page);
    const length = await page.evaluate(() => sQueue.length);
    await solve(page, false);

    await expect(page.locator('.answer-field')).toHaveClass(/wrong/);
    await expect(page.locator('.right-answer')).toHaveText(t.fi);
    expect(await page.evaluate(() => window.__spoken)).toEqual([t.fi]);
    await expect(page.locator('#stat-correct')).toHaveText('0');
    await expect(page.locator('#stat-wrong')).toHaveText('1');
    await expect(page.locator('#stat-rating')).toHaveText('0.0');
    await expect(page.locator('.cell.err')).toHaveCount(1);
    // Предложение вернётся позже, и после верного ответа клетка станет синей
    expect(await page.evaluate(() => sQueue.length)).toBe(length + 1);
    expect(await page.evaluate(() => sQueue.lastIndexOf(currentTask()))).toBe(4);

    await tapEmpty(page);
    await page.evaluate(() => { sIdx = 4; resetSentence(); renderSentences(); });
    expect((await task(page)).fi).toBe(t.fi);
    await solve(page, true);
    await expect(page.locator('.cell.err')).toHaveCount(0);
    await expect(page.locator('.cell.ok')).toHaveCount(1);
  });

  test('рейтинг — доля верных среди последних 40 предложений, по шкале 0–5', async ({ page }) => {
    await page.evaluate(() => {
      stats.history = Array(36).fill(true).concat(Array(4).fill(false));
      renderSentences();
    });
    await expect(page.locator('#stat-rating')).toHaveText('4.5');
    await solve(page, true); // самый старый ответ вытесняется
    await expect(page.locator('#stat-rating')).toHaveText('4.5');
    expect(await page.evaluate(() => stats.history.length)).toBe(40);
  });

  test('счётчики и рейтинг сохраняются и видны в списке уроков', async ({ page }) => {
    await solve(page, true);
    await tapEmpty(page);
    await solve(page, false);
    await page.reload();
    await expect(page.locator('#lesson-1 .circle')).toHaveText('0.1');
    await expect(page.locator('#lesson-1 .circle')).toHaveClass(/orange/);
    await page.click('#lesson-1');
    await expect(page.locator('#open-sentences')).toContainText('Продолжить урок');
    await page.click('#open-sentences');
    await expect(page.locator('#stat-correct')).toHaveText('1');
    await expect(page.locator('#stat-wrong')).toHaveText('1');
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

  test('после части 1 — часть 2 с отрицательными ответами, затем итог урока', async ({ page }) => {
    async function finishPart() {
      while (await page.locator('.word-option').count()) {
        await solve(page, true);
        await tapEmpty(page);
      }
    }
    await finishPart();
    await expect(page.locator('.done-screen h2')).toHaveText('Часть 1 пройдена');
    await page.click('#next-part');
    await expect(page.locator('.part-label')).toContainText('Часть 2 из 2');
    const answers = await page.evaluate(() => sQueue.filter((_, i) => i % 2 === 1).map(t => t.fi));
    answers.forEach(a => expect(a).toMatch(/^(En|Et|Ei|Emme|Ette|Eivät),/));

    await finishPart();
    await expect(page.locator('.done-screen h2')).toHaveText('Урок пройден');
    await expect(page.locator('.done-screen p')).toContainText('ошибок: 0');
    await expect(page.locator('#stat-correct')).toHaveText('40');
    await expect(page.locator('#stat-rating')).toHaveText('5.0');
    await page.click('#restart-sentences');
    await expect(page.locator('.part-label')).toContainText('Часть 1 из 2');
  });
});
