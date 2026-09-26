const { test, expect } = require('@playwright/test');
const data = require('../data/sentences.json');

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

  test('в каждой группе хватает слов на 3 неверных варианта', () => {
    for (const g of Object.values(data.groups)) {
      const size = g.forms.length + (g.pad ? data.groups[g.pad].forms.length : 0);
      expect(size).toBeGreaterThanOrEqual(4);
    }
  });
});

test.describe('составление предложений', () => {
  const task = page => page.evaluate(() => currentTask());

  // Выбирает на экране слово без учёта регистра
  const pick = (page, word) =>
    page.locator('.word-option').filter({ hasText: new RegExp(`^${word}$`, 'i') }).first().click();

  async function build(page, words) {
    for (const w of words) await pick(page, w);
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
    await expect(page.locator('.option')).toHaveCount(4);
    await page.click('#nav-sentences');
    await expect(page.locator('.word-option')).toHaveCount(4);
  });

  test('экран: русское предложение, пустые места под слова, 4 варианта', async ({ page }) => {
    const t = await task(page);
    await expect(page.locator('#header-title')).toHaveText('Предложения');
    await expect(page.locator('.direction-label')).toContainText('Часть 1 из 2');
    await expect(page.locator('.sentence-ru')).toHaveText(t.ru);
    await expect(page.locator('.chip.placeholder')).toHaveCount(t.tokens.length);
    await expect(page.locator('.progress-pct')).toHaveText('0%');
  });

  test('урок начинается с вопроса, за ним идёт ответ', async ({ page }) => {
    const queue = await page.evaluate(() => sQueue);
    expect(queue).toHaveLength(20);
    queue.forEach((t, i) => expect(t.fi.endsWith('?')).toBe(i % 2 === 0));
  });

  test('варианты: правильное слово и 3 слова из той же группы', async ({ page }) => {
    const t = await task(page);
    for (let pos = 0; pos < t.tokens.length; pos++) {
      const correct = t.tokens[pos].w;
      const labels = await page.locator('.word-option').allTextContents();
      expect(new Set(labels.map(l => l.toLowerCase())).size).toBe(4);
      expect(labels.map(l => l.toLowerCase())).toContain(correct.toLowerCase());
      const group = data.groups[index[correct.toLowerCase()]];
      const allowed = group.forms.concat(group.pad ? data.groups[group.pad].forms : []).map(f => f.toLowerCase());
      labels.forEach(l => expect(allowed).toContain(l.toLowerCase()));
      if (pos === 0) labels.forEach(l => expect(l[0]).toBe(l[0].toUpperCase()));
      await pick(page, correct);
    }
  });

  test('слова не проверяются по одному — «Проверить» появляется в конце', async ({ page }) => {
    const t = await task(page);
    const words = t.tokens.map(x => x.w);
    // Первое слово неверное — реакции нет, можно продолжать
    const wrong = page.locator('.word-option').filter({ hasNotText: new RegExp(`^${words[0]}$`, 'i') }).first();
    await wrong.click();
    await expect(page.locator('.built')).not.toHaveClass(/wrong/);
    await expect(page.locator('#check-sentence')).toHaveCount(t.tokens.length === 1 ? 1 : 0);
    await build(page, words.slice(1));
    await expect(page.locator('#check-sentence')).toBeVisible();
    await expect(page.locator('.word-option')).toHaveCount(0);
  });

  test('верное предложение: «Верно!», финский вариант звучит, прогресс растёт', async ({ page }) => {
    const t = await task(page);
    await build(page, t.tokens.map(x => x.w));
    await page.click('#check-sentence');
    await expect(page.locator('.sentence-result')).toHaveText('Верно!');
    await expect(page.locator('.built')).toHaveClass(/correct/);
    await expect(page.locator('.sentence-answer')).toContainText(t.fi);
    expect(await page.evaluate(() => window.__spoken)).toEqual([t.fi]);
    await expect(page.locator('.progress-pct')).toHaveText('5%');

    await page.click('#next-sentence');
    expect(await page.evaluate(() => sIdx)).toBe(1);
    await expect(page.locator('.chip.placeholder').first()).toBeVisible();
  });

  test('неверное предложение: показан правильный вариант и звучит он, прогресс стоит', async ({ page }) => {
    const t = await task(page);
    const words = t.tokens.map(x => x.w);
    await build(page, words.slice(0, -1));
    await page.locator('.word-option').filter({ hasNotText: new RegExp(`^${words.at(-1)}$`, 'i') }).first().click();
    const length = await page.evaluate(() => sQueue.length);
    await page.click('#check-sentence');

    await expect(page.locator('.sentence-result')).toContainText('Неверно');
    await expect(page.locator('.built')).toHaveClass(/wrong/);
    await expect(page.locator('.sentence-answer')).toContainText(t.fi);
    expect(await page.evaluate(() => window.__spoken)).toEqual([t.fi]);
    await expect(page.locator('.progress-pct')).toHaveText('0%');
    // Предложение вернётся позже
    expect(await page.evaluate(() => sQueue.length)).toBe(length + 1);
    expect(await page.evaluate(() => sQueue.lastIndexOf(currentTask()))).toBe(4);
  });

  test('нажатие на выбранное слово убирает его и слова после него', async ({ page }) => {
    const t = await task(page);
    const words = t.tokens.map(x => x.w);
    await build(page, words.slice(0, 3));
    await page.locator('.chip[data-pos="1"]').click();
    expect(await page.evaluate(() => sBuilt)).toEqual([words[0]]);
    await expect(page.locator('.chip.placeholder')).toHaveCount(words.length - 1);
  });

  test('после части 1 — часть 2 с отрицательными ответами, затем итог урока', async ({ page }) => {
    // Проходим все предложения части правильно
    async function finishPart() {
      while (await page.locator('#check-sentence, .word-option').count()) {
        const t = await task(page);
        await build(page, t.tokens.map(x => x.w));
        await page.click('#check-sentence');
        await page.click('#next-sentence');
      }
    }
    await finishPart();
    await expect(page.locator('.done-screen h2')).toHaveText('Часть 1 пройдена');
    await page.click('#next-part');
    await expect(page.locator('.direction-label')).toContainText('Часть 2 из 2');
    const answers = await page.evaluate(() => sQueue.filter((_, i) => i % 2 === 1).map(t => t.fi));
    answers.forEach(a => expect(a).toMatch(/^(En|Et|Ei|Emme|Ette|Eivät),/));

    await finishPart();
    await expect(page.locator('.done-screen h2')).toHaveText('Урок пройден');
    await expect(page.locator('.done-screen p')).toContainText('ошибок: 0');
    await page.click('#restart-sentences');
    await expect(page.locator('.direction-label')).toContainText('Часть 1 из 2');
  });

  test('после слов можно сразу перейти к предложениям', async ({ page }) => {
    await page.click('#nav-train');
    await page.evaluate(() => { idx = queue.length; renderTrain(); });
    await page.click('#to-sentences');
    await expect(page.locator('#nav-sentences')).toHaveClass(/active/);
    await expect(page.locator('.sentence-ru')).toBeVisible();
  });
});
