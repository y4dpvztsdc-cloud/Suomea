const { test, expect } = require('@playwright/test');
const words = require('../data/lessons/1-words.json');

// Текущее задание из глобального состояния words.js
const currentRep = page => page.evaluate(() => queue[idx]);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.click('#lesson-1');
  await page.click('#open-words');
  await expect(page.locator('.option')).toHaveCount(6);
});

test('стартовый экран: слово, 6 вариантов, прогресс 0%', async ({ page }) => {
  await expect(page.locator('.topbar-caption')).toHaveText('Новые слова');
  await expect(page.locator('.word-fi')).not.toBeEmpty();
  await expect(page.locator('.slot')).toHaveCount(3);
  await expect(page.locator('.progress-pct')).toHaveText('0%');
});

test('варианты разные и среди них есть правильный', async ({ page }) => {
  const rep = await currentRep(page);
  const word = words[rep.word];
  const labels = await page.locator('.option').allTextContents();
  expect(new Set(labels).size).toBe(6);
  expect(labels).toContain(rep.dir === 'ru-fi' ? word.fi : word.ru);
  await expect(page.locator('.word-fi')).toHaveText(rep.dir === 'ru-fi' ? word.ru : word.fi);
});

test('верный ответ подсвечивается зелёным и засчитывается', async ({ page }) => {
  const rep = await currentRep(page);
  const option = page.locator(`.option[data-i="${rep.word}"]`);
  await option.click();
  await expect(option).toHaveClass(/correct/);
  await expect(page.locator('#feedback')).toContainText('Верно!');
  await expect(page.locator('#feedback')).toContainText(words[rep.word].fi);
  expect(await page.evaluate(w => wordProgress[w], rep.word)).toEqual([true]);
  expect(await page.evaluate(() => correctTotal)).toBe(1);
  await expect(page.locator('.slot').first()).toHaveClass(/correct/);
  await expect(page.locator('.progress-pct')).not.toHaveText('0%');
});

test('неверный ответ красный, правильный показан зелёным', async ({ page }) => {
  const rep = await currentRep(page);
  const wrong = page.locator(`.option:not([data-i="${rep.word}"])`).first();
  await wrong.click();
  await expect(wrong).toHaveClass(/wrong/);
  await expect(page.locator(`.option[data-i="${rep.word}"]`)).toHaveClass(/correct/);
  await expect(page.locator('#feedback')).toContainText('Правильный вариант выделен зелёным');
  expect(await page.evaluate(w => wordProgress[w], rep.word)).toEqual([false]);
  expect(await page.evaluate(() => correctTotal)).toBe(0);
  await expect(page.locator('.slot').first()).toHaveClass(/wrong/);
});

test('неверный ответ не двигает прогресс, задание возвращается позже', async ({ page }) => {
  const rep = await currentRep(page);
  const lengthBefore = await page.evaluate(() => queue.length);
  await page.locator(`.option:not([data-i="${rep.word}"])`).first().click();
  await expect(page.locator('.progress-pct')).toHaveText('0%');

  const retryAt = await page.evaluate(() => queue.findIndex((r, k) => k > idx && r.slot !== undefined));
  expect(await page.evaluate(() => queue.length)).toBe(lengthBefore + 1);
  expect(retryAt).toBeGreaterThanOrEqual(3);
  const neighbours = await page.evaluate(j => [queue[j - 1].word, queue[j + 1] && queue[j + 1].word], retryAt);
  expect(neighbours).not.toContain(rep.word);

  await page.waitForFunction(() => idx === 1);
  await expect(page.locator('.progress-pct')).toHaveText('0%');
});

test('при повторе верный ответ меняет крестик на галочку и идёт в прогресс', async ({ page }) => {
  const rep = await currentRep(page);
  await page.locator(`.option:not([data-i="${rep.word}"])`).first().click();
  await expect(page.locator('.slot').first()).toHaveClass(/wrong/);

  // Переходим сразу к возвращённому заданию
  await page.waitForFunction(() => idx === 1);
  await page.evaluate(() => {
    idx = queue.findIndex((r, k) => k > idx && r.slot !== undefined);
    renderTrain();
  });
  expect((await currentRep(page)).word).toBe(rep.word);
  await expect(page.locator('.slot').first()).toHaveClass(/wrong/);

  await page.locator(`.option[data-i="${rep.word}"]`).click();
  await expect(page.locator('.slot').first()).toHaveClass(/correct/);
  await expect(page.locator('.slot.wrong')).toHaveCount(0);
  expect(await page.evaluate(w => wordProgress[w], rep.word)).toEqual([true]);
  expect(await page.evaluate(() => [correctTotal, mistakes])).toEqual([1, 1]);
  await expect(page.locator('.progress-pct')).not.toHaveText('0%');
});

test('после ответа варианты блокируются, затем следующее задание', async ({ page }) => {
  await page.locator('.option').first().click();
  await page.locator('.option').nth(1).click({ force: true });
  expect(await page.evaluate(() => wordProgress.flat().length)).toBe(1);
  await page.waitForFunction(() => idx === 1);
  await expect(page.locator('.option.disabled')).toHaveCount(0);
});

test('кружки над словом показывают прошлые ответы по нему', async ({ page }) => {
  await page.evaluate(() => {
    wordProgress[queue[idx].word] = [true, false];
    renderTrain();
  });
  await expect(page.locator('.slot').nth(0)).toHaveClass(/correct/);
  await expect(page.locator('.slot').nth(1)).toHaveClass(/wrong/);
  await expect(page.locator('.slot').nth(2)).toHaveClass('slot');
});

test('каждое слово встречается 3 раза: 2× ru→fi и 1× fi→ru', async ({ page }) => {
  const queue = await page.evaluate(() => queue);
  expect(queue.length).toBe(words.length * 3);
  words.forEach((_, i) => {
    const reps = queue.filter(r => r.word === i);
    expect(reps.filter(r => r.dir === 'ru-fi')).toHaveLength(2);
    expect(reps.filter(r => r.dir === 'fi-ru')).toHaveLength(1);
  });
});

test('прогресс слов сохраняется и виден в кружке урока', async ({ page }) => {
  const rep = await currentRep(page);
  await page.locator(`.option[data-i="${rep.word}"]`).click();
  const pct = await page.evaluate(() => progressPct());
  await page.click('#back');
  await expect(page.locator('#open-words .circle')).toHaveText(`${pct}%`);

  await page.reload();
  await page.click('#lesson-1');
  await expect(page.locator('#open-words .circle')).toHaveText(`${pct}%`);
});

test('экран окончания урока и повтор', async ({ page }) => {
  await page.evaluate(() => { idx = queue.length - 1; renderTrain(); });
  const rep = await currentRep(page);
  await page.locator(`.option[data-i="${rep.word}"]`).click();

  await expect(page.locator('.done-screen h2')).toHaveText('Слова выучены');
  await expect(page.locator('.done-screen p')).toContainText('ошибок: 0');

  await page.click('#restart-words');
  await expect(page.locator('.option')).toHaveCount(6);
  await expect(page.locator('.progress-pct')).toHaveText('0%');
});

test('после слов можно сразу перейти к предложениям', async ({ page }) => {
  await page.evaluate(() => { idx = queue.length; renderTrain(); });
  await page.click('#to-sentences');
  await expect(page.locator('.sentence-ru')).toBeVisible();
});

test('сообщение об ошибке, если словарь не загрузился', async ({ page }) => {
  await page.route('**/data/lessons/1-words.json', route => route.abort());
  await page.goto('/');
  await page.click('#lesson-1');
  await expect(page.locator('.done-screen h2')).toHaveText('Не удалось загрузить слова');
});
