const { test, expect } = require('@playwright/test');
const data = require('../data/lessons/0-sentences.json');

const statements = data.parts[0].pairs.map(p => p.q.fi);
const negations = data.parts[1].pairs.map(p => p.q.fi);

test.describe('пре-урок: тренажёр olla', () => {
  const task = page => page.evaluate(() => currentTask());
  const pick = (page, word) =>
    page.locator('.word-option').filter({ hasText: new RegExp(`^${word}$`, 'i') }).first().click();
  const tapEmpty = page => page.locator('.tap-hint').click();

  async function solve(page, correct = true) {
    const words = (await task(page)).tokens.map(x => x.w);
    for (const w of words.slice(0, -1)) await pick(page, w);
    const last = words.at(-1);
    if (correct) await pick(page, last);
    else await page.locator('.word-option').filter({ hasNotText: new RegExp(`^${last}$`, 'i') }).first().click();
    await tapEmpty(page);
  }

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__spoken = [];
      window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
      Object.defineProperty(window, 'speechSynthesis', { configurable: true,
        value: { getVoices: () => [{ name: 'Satu', lang: 'fi-FI', voiceURI: 'Satu' }],
          speak: u => window.__spoken.push(u.text), cancel() {}, addEventListener() {} } });
    });
    await page.goto('/');
    await page.click('#lesson-0');
    await page.click('#open-part-0-1');
    await expect(page.locator('.word-option')).toHaveCount(6);
  });

  test('очередь: все утверждения по 3 раза, затем все отрицания по 3 раза', async ({ page }) => {
    const queue = await page.evaluate(() => ps.queue.map(item => setPairs(item.set)[item.i].q.fi));
    expect(queue).toHaveLength(42);
    const first = queue.slice(0, 21);
    const second = queue.slice(21);
    first.forEach(fi => expect(statements).toContain(fi));
    second.forEach(fi => expect(negations).toContain(fi));
    for (const fi of statements) expect(first.filter(x => x === fi)).toHaveLength(3);
    for (const fi of negations) expect(second.filter(x => x === fi)).toHaveLength(3);
    for (let i = 1; i < queue.length; i++) expect(queue[i]).not.toBe(queue[i - 1]);
    await expect(page.locator('.cell')).toHaveCount(42);
  });

  test('экран: русская подсказка, «Утверждение» в шапке, без звёзд', async ({ page }) => {
    await expect(page.locator('#header-title')).toHaveText('Утверждение');
    await expect(page.locator('#back')).toContainText('Пре-урок');
    await expect(page.locator('#stat-rating')).toHaveCount(0);
    await expect(page.locator('.sentence-ru')).toHaveText(/есть\.$/);
  });

  test('верно — клетка голубая и следующее задание; ошибка — красная и то же ещё раз', async ({ page }) => {
    const t = await task(page);
    await solve(page, false);
    await expect(page.locator('.cell').first()).toHaveClass(/err/);
    expect(await page.evaluate(() => window.__spoken)).toEqual([t.fi]);
    await tapEmpty(page);
    expect((await task(page)).fi).toBe(t.fi);
    await solve(page, true);
    await expect(page.locator('.cell').first()).toHaveClass(/ok/);
    await expect(page.locator('#stat-correct')).toHaveText('1');
    await expect(page.locator('#stat-wrong')).toHaveText('1');
    await tapEmpty(page);
    expect(await page.evaluate(() => ps.pos)).toBe(1);
  });

  test('после утверждений — отрицания, в шапке «Отрицание»', async ({ page }) => {
    await page.evaluate(() => { ps.pos = 21; ps.cells.fill('ok', 0, 21); resetSentence(); renderSentences(); });
    await expect(page.locator('#header-title')).toHaveText('Отрицание');
    const t = await task(page);
    expect(negations).toContain(t.fi);
    await expect(page.locator('.sentence-ru')).toHaveText(/не есть\.$/);
  });

  test('последнее задание — «Пре-урок выполнен!», переход к уроку 1.1, прогресс сохранён', async ({ page }) => {
    await page.evaluate(() => { ps.pos = 41; ps.cells.fill('ok', 0, 41); resetSentence(); renderSentences(); });
    await solve(page, true);
    await tapEmpty(page);
    await expect(page.locator('#congrats h2')).toHaveText('Пре-урок выполнен!');

    await page.reload();
    await expect(page.locator('#lesson-0 .circle')).toHaveText('✓');
    await page.click('#lesson-0');
    await expect(page.locator('#open-part-0-1 .circle')).toHaveText('✓');
    await page.click('#open-part-0-1');
    await expect(page.locator('#congrats h2')).toHaveText('Пре-урок выполнен!');
    await page.click('#go-next');
    await expect(page.locator('#back')).toContainText('Урок 1.1');
  });

  test('«Пройти ещё раз» начинает тренажёр заново', async ({ page }) => {
    await page.evaluate(() => { ps.pos = 41; ps.cells.fill('ok', 0, 41); resetSentence(); renderSentences(); });
    await solve(page, true);
    await tapEmpty(page);
    await page.click('#restart-drill');
    expect(await page.evaluate(() => [ps.pos, ps.done, ps.correct])).toEqual([0, false, 0]);
    await expect(page.locator('.cell.ok')).toHaveCount(0);
  });

  test('процент на кружке пре-урока', async ({ page }) => {
    await solve(page, true);
    await tapEmpty(page);
    await page.click('#back');
    await expect(page.locator('#open-part-0-1 .circle')).toHaveText('2%');
  });
});
