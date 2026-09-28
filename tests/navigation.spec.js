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

test('экран урока: продолжить урок, учить новые слова, описание', async ({ page }) => {
  await page.click('#lesson-1');
  await expect(page.locator('#header-title')).toHaveText('Урок 1');
  await expect(page.locator('.lesson-title')).toHaveText('Глагол olla');
  await expect(page.locator('#open-sentences')).toContainText('Начать урок');
  await expect(page.locator('#open-words')).toContainText('Учить новые слова');
  await expect(page.locator('#open-words .circle')).toHaveText('0%');
  await expect(page.locator('#open-description')).toContainText('Описание урока');

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

const setHistory = (page, ok, total = ok) => page.evaluate(([ok, total]) => {
  const history = Array(total - ok).fill(false).concat(Array(ok).fill(true));
  localStorage.setItem('suomea.lesson.1', JSON.stringify({ history, correct: ok, wrong: total - ok, wordsPct: 5 }));
}, [ok, total]);

test('кружок рейтинга: 89 верных из 100 — 4.4 оранжевый, 90 — 4.5 синий', async ({ page }) => {
  await setHistory(page, 89, 100);
  await page.reload();
  await expect(page.locator('#lesson-1 .circle')).toHaveText('4.4');
  await expect(page.locator('#lesson-1 .circle')).toHaveClass(/orange/);

  await setHistory(page, 90, 100);
  await page.reload();
  await expect(page.locator('#lesson-1 .circle')).toHaveText('4.5');
  await expect(page.locator('#lesson-1 .circle')).toHaveClass(/blue/);
});

test('следующий урок открывается при рейтинге 4.5 в предыдущем', async ({ page }) => {
  // Подставляем второй урок в список
  await page.route('**/data/lessons.json', route => route.fulfill({
    json: lessons.concat({ ...lessons[0], id: 2, title: 'Урок 2', subtitle: 'Проверка' }),
  }));
  await setHistory(page, 89, 100);
  await page.reload();
  const second = page.locator('#lesson-2');
  await expect(second).toHaveClass(/locked/);
  await expect(second).toContainText('Откроется, когда в «Урок 1» будет 4.5');
  await second.click();
  await expect(page.locator('#lesson-2')).toBeVisible(); // остались на главном экране

  await setHistory(page, 90, 100);
  await page.reload();
  await expect(page.locator('#lesson-2')).not.toHaveClass(/locked/);
  await expect(page.locator('#lesson-2 .circle')).toHaveText('0.0');
  await page.click('#lesson-2');
  await expect(page.locator('#header-title')).toHaveText('Урок 2');
});
