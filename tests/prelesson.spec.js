const { test, expect } = require('@playwright/test');
const lessons = require('../data/lessons.json');
const data = require('../data/lessons/1-pre.json');

const [statements, negations, questions] = data.parts.map(p => p.pairs.map(x => x.q.fi));
const lesson1 = lessons.find(l => l.id === 1);

test.describe('пре-урок: данные', () => {
  test('первый пункт урока 1, тренажёр: утверждения, отрицания, вопросы по 3 раза', () => {
    expect(lessons.some(l => l.id === 0)).toBe(false);
    expect(lesson1.parts[0]).toMatchObject({
      id: '1.0', mode: 'drill', source: 'data/lessons/1-pre.json',
      sets: ['statement', 'negation', 'question'], repeat: 3,
    });
  });

  test('7 утверждений, 7 отрицаний, 7 вопросов', () => {
    expect(statements).toEqual(['Minä olen.', 'Sinä olet.', 'Hän on.', 'Me olemme.', 'Te olette.', 'He ovat.', 'Tämä on.']);
    expect(negations).toEqual(['Minä en ole.', 'Sinä et ole.', 'Hän ei ole.', 'Me emme ole.', 'Te ette ole.', 'He eivät ole.', 'Tämä ei ole.']);
    expect(questions).toEqual(['Olenko minä?', 'Oletko sinä?', 'Onko hän?', 'Olemmeko me?', 'Oletteko te?', 'Ovatko he?', 'Onko tämä?']);
    data.parts.forEach(p => p.pairs.forEach(x => expect(x.a).toBeUndefined()));
  });
});

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

  // Делает все задания, кроме последнего, выполненными
  const almostDone = page => page.evaluate(() => {
    ps.pos = ps.queue.length - 1;
    ps.correct = ps.total - 1;
    resetSentence();
    renderSentences();
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__spoken = [];
      window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
      Object.defineProperty(window, 'speechSynthesis', { configurable: true,
        value: { getVoices: () => [{ name: 'Satu', lang: 'fi-FI', voiceURI: 'Satu' }],
          speak: u => window.__spoken.push(u.text), cancel() {}, addEventListener() {} } });
    });
    await page.goto('/');
    await page.click('#lesson-1');
    await page.click('#open-part-1-0');
    await expect(page.locator('.word-option')).toHaveCount(6);
  });

  test('очередь: утверждения ×3, затем отрицания ×3, затем вопросы ×3', async ({ page }) => {
    const queue = await page.evaluate(() => ps.queue.map(item => setPairs(item.set)[item.i].q.fi));
    expect(queue).toHaveLength(63);
    const blocks = [queue.slice(0, 21), queue.slice(21, 42), queue.slice(42)];
    [statements, negations, questions].forEach((set, b) => {
      blocks[b].forEach(fi => expect(set).toContain(fi));
      for (const fi of set) expect(blocks[b].filter(x => x === fi)).toHaveLength(3);
    });
    for (let i = 1; i < queue.length; i++) expect(queue[i]).not.toBe(queue[i - 1]);
  });

  test('экран: 3 кружка над фразой, процент внизу, без клеток и звёзд', async ({ page }) => {
    await expect(page.locator('#header-title')).toHaveText('Утверждение');
    await expect(page.locator('#back')).toContainText('Урок 1');
    await expect(page.locator('.drill-tracker .slot')).toHaveCount(3);
    await expect(page.locator('.drill-progress .progress-pct')).toHaveText('0%');
    await expect(page.locator('.cell')).toHaveCount(0);
    await expect(page.locator('#stat-rating')).toHaveCount(0);
  });

  test('верно — синяя галочка и процент растёт', async ({ page }) => {
    const t = await task(page);
    await solve(page, true);
    await expect(page.locator('.drill-tracker .slot').first()).toHaveClass(/correct/);
    await expect(page.locator('.progress-pct')).toHaveText('2%');
    expect(await page.evaluate(() => window.__spoken)).toEqual([t.fi]);
    await tapEmpty(page);
    expect(await page.evaluate(() => ps.pos)).toBe(1);
  });

  test('ошибка — красный крестик, процент стоит, фраза вернётся позже и крестик станет галочкой', async ({ page }) => {
    const t = await task(page);
    const length = await page.evaluate(() => ps.queue.length);
    await solve(page, false);
    await expect(page.locator('.drill-tracker .slot').first()).toHaveClass(/wrong/);
    await expect(page.locator('.progress-pct')).toHaveText('0%');
    await expect(page.locator('#stat-wrong')).toHaveText('1');
    expect(await page.evaluate(() => ps.queue.length)).toBe(length + 1);

    await tapEmpty(page);
    expect((await task(page)).fi).not.toBe(t.fi); // сразу не повторяется
    const back = await page.evaluate(() => ps.queue.findIndex((it, k) => k >= ps.pos && it.slot !== undefined));
    expect(back).toBe(4);
    await page.evaluate(j => { ps.pos = j; resetSentence(); renderSentences(); }, back);
    expect((await task(page)).fi).toBe(t.fi);
    await expect(page.locator('.drill-tracker .slot').first()).toHaveClass(/wrong/);
    await solve(page, true);
    await expect(page.locator('.drill-tracker .slot').first()).toHaveClass(/correct/);
    await expect(page.locator('.drill-tracker .slot.wrong')).toHaveCount(0);
  });

  test('ошибка в конце набора возвращается в своём наборе', async ({ page }) => {
    await page.evaluate(() => { ps.pos = 19; resetSentence(); renderSentences(); });
    await solve(page, false);
    const sets = await page.evaluate(() => ps.queue.slice(0, 22).map(it => it.set));
    expect(sets.every(s => s === 'statement')).toBe(true);
    expect(await page.evaluate(() => ps.queue[22].set)).toBe('negation');
  });

  test('шапка: «Отрицание», затем «Вопрос»', async ({ page }) => {
    await page.evaluate(() => { ps.pos = 21; resetSentence(); renderSentences(); });
    await expect(page.locator('#header-title')).toHaveText('Отрицание');
    expect(negations).toContain((await task(page)).fi);
    await page.evaluate(() => { ps.pos = 42; resetSentence(); renderSentences(); });
    await expect(page.locator('#header-title')).toHaveText('Вопрос');
    expect(questions).toContain((await task(page)).fi);
    await expect(page.locator('.sentence-ru')).toHaveText(/есть\?$/);
    const first = await page.locator('.word-option').allTextContents();
    first.forEach(w => expect(data.groups.olla_q.forms).toContain(w.toLowerCase()));
  });

  test('100% — «Пре-урок выполнен!», переход к 1.1, галочка на кружке', async ({ page }) => {
    await almostDone(page);
    await solve(page, true);
    await expect(page.locator('.progress-pct')).toHaveText('100%');
    await tapEmpty(page);
    await expect(page.locator('#congrats h2')).toHaveText('Пре-урок выполнен!');
    await expect(page.locator('#congrats')).toContainText('утверждения, отрицания и вопросы');

    await page.reload();
    await page.click('#lesson-1');
    await expect(page.locator('#open-part-1-0 .circle')).toHaveText('✓');
    await page.click('#open-part-1-0');
    await page.click('#go-next');
    await expect(page.locator('#back')).toContainText('Урок 1.1');
  });

  test('«Пройти ещё раз» начинает заново', async ({ page }) => {
    await almostDone(page);
    await solve(page, true);
    await tapEmpty(page);
    await page.click('#restart-drill');
    expect(await page.evaluate(() => [ps.pos, ps.done, ps.correct])).toEqual([0, false, 0]);
    await expect(page.locator('.progress-pct')).toHaveText('0%');
  });

  test('на экране урока: «Пре-урок» первым, процент; 1.1 открыт и без него', async ({ page }) => {
    await solve(page, true);
    await tapEmpty(page);
    await page.click('#back');
    const first = page.locator('.list-row').first();
    await expect(first).toHaveAttribute('id', 'open-part-1-0');
    await expect(first.locator('.list-title')).toHaveText('Пре-урок');
    await expect(first.locator('.circle')).toHaveText('2%');
    await expect(page.locator('#open-part-1-1')).not.toHaveClass(/locked/);
    await expect(page.locator('#open-part-1-2')).toContainText('Откроется при 4.5 в уроке 1.1');
  });

  test('«Помощь» — описание для начинающих с шагом про вопрос', async ({ page }) => {
    await page.click('#help');
    await expect(page.locator('.description')).toContainText('Пре-урок: почувствовать глагол olla');
    await expect(page.locator('.description')).toContainText('Шаг 3. Вопрос');
    await expect(page.locator('.description')).toContainText('Minä en olen');
  });
});
