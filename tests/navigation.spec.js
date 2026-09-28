const { test, expect } = require('@playwright/test');
const lessons = require('../data/lessons.json');
const words = require('../data/lessons/1-words.json');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('главный экран: список уроков с рейтингом', async ({ page }) => {
  await expect(page.locator('.topbar h1')).toHaveText('Suomea');
  await expect(page.locator('#tab-lessons')).toHaveClass(/active/);
  await expect(page.locator('.list-row')).toHaveCount(lessons.length);
  const row = page.locator('#lesson-1');
  await expect(row).toContainText('Урок 1');
  await expect(row).toContainText('Глагол olla');
  await expect(row.locator('.circle')).toHaveText('0.0');
  await expect(row.locator('.circle')).toHaveClass(/orange/);
});

test('экран урока: 1.1 утверждение, 1.2 отрицание (закрыт), слова, описание', async ({ page }) => {
  await page.click('#lesson-1');
  await expect(page.locator('#header-title')).toHaveText('Урок 1');
  await expect(page.locator('.lesson-title')).toHaveText('Глагол olla');
  await expect(page.locator('#open-part-1-1')).toContainText('Урок 1.1');
  await expect(page.locator('#open-part-1-1')).toContainText('Вопрос + утверждение');
  await expect(page.locator('#open-part-1-1 .circle')).toHaveText('0.0');
  await expect(page.locator('#open-part-1-2')).toContainText('Вопрос + отрицание');
  await expect(page.locator('#open-part-1-2')).toHaveClass(/locked/);
  await expect(page.locator('#open-part-1-2')).toContainText('откроется при 4.5 в уроке 1.1');
  await expect(page.locator('#open-words')).toContainText('Учить новые слова');
  await expect(page.locator('#open-words .circle')).toHaveText('0%');
  await expect(page.locator('#open-description')).toContainText('Описание урока');

  await page.locator('#open-part-1-2').click();
  await expect(page.locator('.lesson-title')).toBeVisible(); // закрытый урок не открывается

  await page.click('#back');
  await expect(page.locator('#lesson-1')).toBeVisible();
});

test('описание урока', async ({ page }) => {
  await page.click('#lesson-1');
  await page.click('#open-description');
  await expect(page.locator('#header-title')).toHaveText('Описание урока');
  await expect(page.locator('.description')).toContainText('minä olen');
  await expect(page.locator('.description')).toContainText('eivät');
  await page.click('#back');
  await expect(page.locator('.lesson-title')).toBeVisible();
});

test('вкладка «Словарь» показывает слова урока', async ({ page }) => {
  await page.click('#tab-dictionary');
  await expect(page.locator('#tab-dictionary')).toHaveClass(/active/);
  await expect(page.locator('.wordlist-row')).toHaveCount(words.length);
  await expect(page.locator('.wordlist-row').first()).toContainText(words[0].fi);
  await page.click('#tab-lessons');
  await expect(page.locator('#lesson-1')).toBeVisible();
});

// Сохраняет прогресс подуроков: { '1.1': число голубых клеток, ... }
const setProgress = (page, parts) => page.evaluate(parts => {
  const state = ok => ({
    cells: Array(100).fill('todo').map((_, i) => (i < ok ? 'ok' : 'todo')),
    slots: [], pool: [], cursor: 0, pos: ok, round: 1, correct: ok, wrong: 0, shown45: true, shown50: false,
  });
  const saved = { wordsPct: 5, parts: {} };
  Object.entries(parts).forEach(([id, ok]) => { saved.parts[id] = state(ok); });
  localStorage.setItem('suomea.v2.lesson.1', JSON.stringify(saved));
}, parts);

test('кружки рейтинга: 4.4 оранжевый, 4.5 синий; у урока — среднее по 1.1 и 1.2', async ({ page }) => {
  await setProgress(page, { '1.1': 88 });
  await page.reload();
  await expect(page.locator('#lesson-1 .circle')).toHaveText('2.2');
  await page.click('#lesson-1');
  await expect(page.locator('#open-part-1-1 .circle')).toHaveText('4.4');
  await expect(page.locator('#open-part-1-1 .circle')).toHaveClass(/orange/);
  await expect(page.locator('#open-part-1-2')).toHaveClass(/locked/);

  await setProgress(page, { '1.1': 90, '1.2': 20 });
  await page.reload();
  await expect(page.locator('#lesson-1 .circle')).toHaveText('2.7');
  await page.click('#lesson-1');
  await expect(page.locator('#open-part-1-1 .circle')).toHaveText('4.5');
  await expect(page.locator('#open-part-1-1 .circle')).toHaveClass(/blue/);
  await expect(page.locator('#open-part-1-2 .circle')).toHaveText('1.0');
});

test('следующий урок открывается, когда в 1.1 и 1.2 набрано 4.5', async ({ page }) => {
  // Подставляем второй урок в список
  await page.route('**/data/lessons.json', route => route.fulfill({
    json: lessons.concat({ ...lessons[0], id: 2, title: 'Урок 2', subtitle: 'Проверка',
      parts: [{ id: '2.1', title: 'Тест', set: 'affirmative' }] }),
  }));
  await setProgress(page, { '1.1': 90, '1.2': 89 });
  await page.reload();
  const second = page.locator('#lesson-2');
  await expect(second).toHaveClass(/locked/);
  await expect(second).toContainText('Откроется, когда в «Урок 1» будет 4.5');
  await second.click();
  await expect(page.locator('#lesson-2')).toBeVisible(); // остались на главном экране

  await setProgress(page, { '1.1': 90, '1.2': 90 });
  await page.reload();
  await expect(page.locator('#lesson-2')).not.toHaveClass(/locked/);
  await page.click('#lesson-2');
  await expect(page.locator('#header-title')).toHaveText('Урок 2');
  await expect(page.locator('#open-part-2-1')).toContainText('Урок 2.1');
});
