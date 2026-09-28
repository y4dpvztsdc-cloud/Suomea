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

test('кружок рейтинга синий от 4.5', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('suomea.lesson.1', JSON.stringify({ history: Array(36).fill(true), correct: 36, wrong: 0, wordsPct: 5 }));
  });
  await page.reload();
  await expect(page.locator('#lesson-1 .circle')).toHaveText('4.5');
  await expect(page.locator('#lesson-1 .circle')).toHaveClass(/blue/);
});
