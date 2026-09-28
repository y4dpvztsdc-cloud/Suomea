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
    await expect(page.locator('text=Часть 1 из 2')).toHaveCount(0);
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
    expect(await page.evaluate(() => [sIdx, sChecked])).toEqual([1, false]);
  });

  test('верное предложение: голубое поле, похвала на финском с переводом, звучит ответ', async ({ page }) => {
    const t = await task(page);
    await solve(page, true);
    await expect(page.locator('.answer-field')).toHaveClass(/correct/);
    await expect(page.locator('.chip.bad')).toHaveCount(0);
    await expect(page.locator('.right-answer')).toHaveCount(0);
    const praise = await page.evaluate(() => sPraise);
    await expect(page.locator('.praise .verdict-fi')).toHaveText(praise.fi);
    await expect(page.locator('.praise .verdict-ru')).toHaveText(praise.ru);
    await expect(page.locator('.try-again')).toHaveCount(0);
    expect(await page.evaluate(() => PRAISE.map(p => p.fi))).toContain(praise.fi);
    expect(await page.evaluate(() => window.__spoken)).toEqual([t.fi]);
    await expect(page.locator('#stat-correct')).toHaveText('1');
    await expect(page.locator('#stat-wrong')).toHaveText('0');
    await expect(page.locator('.cell.ok')).toHaveCount(1);
  });

  test('похвала разная: не повторяется два раза подряд', async ({ page }) => {
    const seen = [];
    for (let i = 0; i < 6; i++) {
      await solve(page, true);
      seen.push(await page.locator('.praise .verdict-fi').textContent());
      await tapEmpty(page);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
    expect(new Set(seen).size).toBeGreaterThan(2);
  });

  test('неверное: красное поле, неверное слово красное, ниже правильный ответ и «Yritä uudelleen!»', async ({ page }) => {
    const t = await task(page);
    const words = t.tokens.map(x => x.w);
    await pick(page, words[0]);
    await pickWrong(page, words[1]);
    await build(page, words.slice(2));
    await tapEmpty(page);

    await expect(page.locator('.answer-field')).toHaveClass(/wrong/);
    await expect(page.locator('.chip.bad')).toHaveCount(1);
    await expect(page.locator('.chip').nth(1)).toHaveClass(/bad/);
    await expect(page.locator('.chip').first()).not.toHaveClass(/bad/);
    await expect(page.locator('.right-answer')).toHaveText(t.fi);
    await expect(page.locator('.try-again .verdict-fi')).toHaveText('Yritä uudelleen!');
    await expect(page.locator('.try-again .verdict-ru')).toHaveText('Попробуй снова!');
    await expect(page.locator('.praise')).toHaveCount(0);
    expect(await page.evaluate(() => window.__spoken)).toEqual([t.fi]);
    await expect(page.locator('#stat-correct')).toHaveText('0');
    await expect(page.locator('#stat-wrong')).toHaveText('1');
    await expect(page.locator('.cell.err')).toHaveCount(1);

    // Нажатие на экран — то же предложение заново
    await tapEmpty(page);
    expect(await page.evaluate(() => [sIdx, sChecked, sBuilt.length])).toEqual([0, false, 0]);
    await expect(page.locator('.sentence-ru')).toHaveText(t.ru);
    await solve(page, true);
    await expect(page.locator('.cell.err')).toHaveCount(0);
    await expect(page.locator('.cell.ok')).toHaveCount(1);
    await expect(page.locator('#stat-correct')).toHaveText('1');
  });

  test('рейтинг: 0.1 звезды за каждые 2 верных ответа из последних 100', async ({ page }) => {
    await solve(page, true);
    await expect(page.locator('#stat-rating')).toHaveText('0.0');
    await tapEmpty(page);
    await solve(page, true);
    await expect(page.locator('#stat-rating')).toHaveText('0.1');

    // 99 верных подряд + ещё один = 100 подряд → 5.0
    await tapEmpty(page);
    await page.evaluate(() => { stats.history = Array(99).fill(true); renderSentences(); });
    await expect(page.locator('#stat-rating')).toHaveText('4.9');
    await solve(page, true);
    await expect(page.locator('#stat-rating')).toHaveText('5.0');
    expect(await page.evaluate(() => stats.history.length)).toBe(100);

    // Ошибка вытесняет самый старый верный ответ и снижает рейтинг
    await tapEmpty(page);
    await solve(page, false);
    await expect(page.locator('#stat-rating')).toHaveText('4.9');
  });

  test('счётчики и рейтинг сохраняются и видны в списке уроков', async ({ page }) => {
    await solve(page, true);
    await tapEmpty(page);
    await solve(page, true);
    await tapEmpty(page);
    await solve(page, false);
    await page.reload();
    await expect(page.locator('#lesson-1 .circle')).toHaveText('0.1');
    await expect(page.locator('#lesson-1 .circle')).toHaveClass(/orange/);
    await page.click('#lesson-1');
    await expect(page.locator('#open-sentences')).toContainText('Продолжить урок');
    await page.click('#open-sentences');
    await expect(page.locator('#stat-correct')).toHaveText('2');
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
    expect(await page.evaluate(() => sPart)).toBe(1);
    await expect(page.locator('.sentence-ru')).toBeVisible();
    const answers = await page.evaluate(() => sQueue.filter((_, i) => i % 2 === 1).map(t => t.fi));
    answers.forEach(a => expect(a).toMatch(/^(En|Et|Ei|Emme|Ette|Eivät),/));

    await finishPart();
    await expect(page.locator('.done-screen h2')).toHaveText('Урок пройден');
    await expect(page.locator('.done-screen p')).toContainText('ошибок: 0');
    await expect(page.locator('#stat-correct')).toHaveText('40');
    await expect(page.locator('#stat-rating')).toHaveText('2.0');
    await page.click('#restart-sentences');
    expect(await page.evaluate(() => [sPart, sIdx])).toEqual([0, 0]);
    await expect(page.locator('.sentence-ru')).toBeVisible();
  });
});
