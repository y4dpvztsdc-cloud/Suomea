const { test, expect } = require('@playwright/test');

// Подменяем speechSynthesis: голоса задаются тестом, произнесённое записывается в __spoken
function fakeSpeech(page, initialVoices) {
  return page.addInitScript(voices => {
    const listeners = [];
    let current = voices;
    window.__spoken = [];
    window.__setVoices = list => {
      current = list;
      listeners.forEach(fn => fn());
    };
    window.SpeechSynthesisUtterance = class {
      constructor(text) { this.text = text; }
    };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => current,
        speak: u => window.__spoken.push({ text: u.text, lang: u.lang, voice: u.voice && u.voice.name }),
        cancel: () => {},
        addEventListener: (type, fn) => { if (type === 'voiceschanged') listeners.push(fn); },
      },
    });
  }, initialVoices);
}

const v = (name, lang, voiceURI = name) => ({ name, lang, voiceURI });

const chosenVoice = page => page.evaluate(() => finnishVoice && finnishVoice.name);

test('выбирается улучшенная Satu, а не обычная или другой язык', async ({ page }) => {
  await fakeSpeech(page, [
    v('Samantha', 'en-US'),
    v('Satu', 'fi-FI'),
    v('Satu (Enhanced)', 'fi-FI'),
    v('Google suomi', 'fi-FI'),
  ]);
  await page.goto('/');
  expect(await chosenVoice(page)).toBe('Satu (Enhanced)');
});

test('премиум-версия Satu по voiceURI (iOS) приоритетнее улучшенной', async ({ page }) => {
  await fakeSpeech(page, [
    v('Satu', 'fi-FI', 'com.apple.voice.compact.fi-FI.Satu'),
    v('Satu', 'fi-FI', 'com.apple.voice.enhanced.fi-FI.Satu'),
    v('Satu', 'fi-FI', 'com.apple.voice.premium.fi-FI.Satu'),
  ]);
  await page.goto('/');
  expect(await page.evaluate(() => finnishVoice.voiceURI)).toBe('com.apple.voice.premium.fi-FI.Satu');
});

test('без Satu берётся любой финский голос (в т.ч. fi_FI на Android)', async ({ page }) => {
  await fakeSpeech(page, [v('Milena', 'ru-RU'), v('Finnish', 'fi_FI')]);
  await page.goto('/');
  expect(await chosenVoice(page)).toBe('Finnish');
});

test('голоса, пришедшие позже через voiceschanged, подхватываются', async ({ page }) => {
  await fakeSpeech(page, []);
  await page.goto('/');
  expect(await chosenVoice(page)).toBeNull();
  await expect(page.locator('#voice-warning')).toBeHidden();

  await page.evaluate(() => window.__setVoices([{ name: 'Satu', lang: 'fi-FI', voiceURI: 'Satu' }]));
  expect(await chosenVoice(page)).toBe('Satu');
  await page.waitForTimeout(3500);
  await expect(page.locator('#voice-warning')).toBeHidden();
});

test('озвучка идёт выбранным финским голосом', async ({ page }) => {
  await fakeSpeech(page, [v('Samantha', 'en-US'), v('Satu', 'fi-FI')]);
  await page.goto('/');
  await page.locator('.option').first().click();
  const spoken = await page.evaluate(() => window.__spoken);
  expect(spoken).toHaveLength(1);
  expect(spoken[0]).toMatchObject({ voice: 'Satu', lang: 'fi-FI' });
});

test('нет финского голоса — предупреждение, его можно закрыть', async ({ page }) => {
  await fakeSpeech(page, [v('Samantha', 'en-US')]);
  await page.goto('/');
  const warning = page.locator('#voice-warning');
  await expect(warning).toBeVisible({ timeout: 5000 });
  await expect(warning).toContainText('Финский голос не найден');

  await page.click('#voice-warning-close');
  await expect(warning).toBeHidden();
});

test('предупреждение исчезает, если финский голос появился позже', async ({ page }) => {
  await fakeSpeech(page, []);
  await page.goto('/');
  await expect(page.locator('#voice-warning')).toBeVisible({ timeout: 5000 });
  await page.evaluate(() => window.__setVoices([{ name: 'Satu', lang: 'fi-FI', voiceURI: 'Satu' }]));
  await expect(page.locator('#voice-warning')).toBeHidden();
});

test('браузер без синтеза речи — сразу предупреждение', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
  });
  await page.goto('/');
  await expect(page.locator('#voice-warning')).toBeVisible();
  await expect(page.locator('.option')).toHaveCount(4);
});
