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
  await expect(page.locator('.lesson-title')).toHaveText('Глагол olla: кто это и чьё это');
  await expect(page.locator('#open-part-1-1')).toContainText('Урок 1.1');
  await expect(page.locator('#open-part-1-1')).toContainText('Вопрос + утверждение');
  await expect(page.locator('#open-part-1-1 .circle')).toHaveText('0.0');
  await expect(page.locator('#open-part-1-2')).toContainText('Вопрос + отрицание');
  await expect(page.locator('#open-part-1-2')).toHaveClass(/locked/);
  await expect(page.locator('#open-part-1-2')).toContainText('Откроется при 4.5 в уроке 1.1');
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
  await expect(page.locator('.description')).toContainText('Minä olen');
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
  localStorage.setItem('suomea.v3.lesson.1', JSON.stringify(saved));
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

test('урок 2 открывается, когда в 1.1 и 1.2 набрано 4.5', async ({ page }) => {
  await expect(page.locator('.list-row')).toHaveCount(lessons.length);
  for (const l of lessons.slice(1)) await expect(page.locator(`#lesson-${l.id}`)).toHaveClass(/locked/);

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
  await expect(page.locator('#lesson-3')).toHaveClass(/locked/);
  await page.click('#lesson-2');
  await expect(page.locator('#header-title')).toHaveText('Урок 2');
  await expect(page.locator('.lesson-title')).toHaveText(lessons[1].subtitle);
  await expect(page.locator('#open-part-2-1')).toContainText('Урок 2.1');
  await expect(page.locator('#open-part-2-2')).toHaveClass(/locked/);
});

test('закрытые уроки показывают своё название', async ({ page }) => {
  for (const l of lessons.slice(1)) {
    const row = page.locator(`#lesson-${l.id}`);
    await expect(row).toHaveClass(/locked/);
    await expect(row.locator('.list-title')).toHaveText(l.title);
    await expect(row.locator('.list-sub')).toHaveText(l.subtitle);
  }
  await page.click('#lesson-1');
  await expect(page.locator('#open-part-1-2 .list-sub')).toHaveText('Вопрос + отрицание');
});

test('режим проверки: все уроки и подуроки открыты, настройка сохраняется', async ({ page }) => {
  await page.click('#tab-settings');
  await expect(page.locator('#tab-settings')).toHaveClass(/active/);
  const toggle = page.locator('#test-mode');
  await expect(toggle).not.toBeChecked();
  await page.locator('.setting-row').click();
  await expect(toggle).toBeChecked();
  await expect(page.locator('#test-badge')).toHaveText('Режим проверки');

  await page.reload();
  await expect(page.locator('#test-badge')).toBeVisible();
  for (const l of lessons) await expect(page.locator(`#lesson-${l.id}`)).not.toHaveClass(/locked/);
  await page.click(`#lesson-${lessons.at(-1).id}`);
  for (const p of lessons.at(-1).parts) {
    await expect(page.locator(`#open-part-${p.id.replace('.', '-')}`)).not.toHaveClass(/locked/);
  }
  await page.click(`#open-part-${lessons.at(-1).parts[1].id.replace('.', '-')}`);
  await expect(page.locator('.word-option')).toHaveCount(6);

  // Выключаем — уроки снова закрыты
  await page.click('#back');
  await page.click('#back');
  await page.click('#tab-settings');
  await page.locator('.setting-row').click();
  await expect(page.locator('#test-badge')).toHaveCount(0);
  await page.click('#tab-lessons');
  await expect(page.locator('#lesson-2')).toHaveClass(/locked/);
});

test('режим проверки по ссылке ?test=1', async ({ page }) => {
  await page.goto('/?test=1');
  await expect(page.locator('#test-badge')).toBeVisible();
  await expect(page.locator(`#lesson-${lessons.at(-1).id}`)).not.toHaveClass(/locked/);
});
