const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const lessons = require('../data/lessons.json');

const WORD = /[A-Za-zÅÄÖåäö]+/g;
const read = p => JSON.parse(fs.readFileSync(path.join(__dirname, '..', p), 'utf8'));

const regular = lessons.filter(l => !l.pre);

for (const lesson of regular) {
  test.describe(`${lesson.title}: данные`, () => {
    const words = read(lesson.words);
    const data = read(lesson.sentences);

    test('файлы урока на месте, подуроки ссылаются на наборы предложений', () => {
      expect(fs.existsSync(path.join(__dirname, '..', lesson.description))).toBe(true);
      expect(lesson.parts.map(p => p.id)).toEqual([`${lesson.id}.1`, `${lesson.id}.2`]);
      lesson.parts.forEach(p => expect(data.parts.map(s => s.id)).toContain(p.set));
    });

    test('словарь: у каждого слова fi, ru, group, слова не повторяются', () => {
      expect(words.length).toBeGreaterThan(0);
      words.forEach(w => {
        expect(typeof w.fi).toBe('string');
        expect(typeof w.ru).toBe('string');
        expect(typeof w.group).toBe('string');
      });
      expect(new Set(words.map(w => w.fi)).size).toBe(words.length);
    });

    test('по 100 пар; вопрос с «?», отрицательные ответы начинаются с «нет»', () => {
      const [aff, neg] = data.parts;
      expect(aff.pairs).toHaveLength(100);
      expect(neg.pairs).toHaveLength(100);
      for (const part of data.parts) {
        for (const pair of part.pairs) {
          expect(pair.q.fi).toMatch(/\?$/);
          expect(pair.a.fi).toMatch(/[.?]$/);
          expect(pair.a.ru).not.toMatch(/^(Нет|Да), (Он|Она|Они)\b/);
        }
      }
      neg.pairs.forEach(p => expect(p.a.fi).toMatch(/^(En|Et|Ei|Emme|Ette|Eivät),/));
    });

    test('каждое слово предложений ровно в одной группе, в группах хватает вариантов', () => {
      const index = {};
      Object.entries(data.groups).forEach(([name, g]) => g.forms.forEach(f => {
        expect(index[f.toLowerCase()], f).toBeUndefined();
        index[f.toLowerCase()] = name;
      }));
      for (const part of data.parts) {
        for (const pair of part.pairs) {
          for (const w of (pair.q.fi + ' ' + pair.a.fi).match(WORD)) {
            expect(index[w.toLowerCase()], w).toBeDefined();
          }
        }
      }
      for (const g of Object.values(data.groups)) {
        const size = g.forms.length + (g.pad ? data.groups[g.pad].forms.length : 0);
        expect(size).toBeGreaterThanOrEqual(6);
      }
    });
  });
}

test.describe('Пре-урок: данные', () => {
  const pre = lessons[0];
  const data = read(pre.sentences);

  test('стоит первым, необязательный, один подурок-тренажёр без слов', () => {
    expect(pre.pre).toBe(true);
    expect(pre.words).toBeUndefined();
    expect(pre.parts).toHaveLength(1);
    expect(pre.parts[0]).toMatchObject({ id: '0.1', mode: 'drill', sets: ['statement', 'negation'], repeat: 3 });
    expect(fs.existsSync(path.join(__dirname, '..', pre.description))).toBe(true);
  });

  test('7 утверждений и 7 отрицаний с olla, без вопросов и ответов', () => {
    const [st, ng] = data.parts;
    expect(st.pairs.map(p => p.q.fi)).toEqual([
      'Minä olen.', 'Sinä olet.', 'Hän on.', 'Me olemme.', 'Te olette.', 'He ovat.', 'Tämä on.',
    ]);
    expect(ng.pairs.map(p => p.q.fi)).toEqual([
      'Minä en ole.', 'Sinä et ole.', 'Hän ei ole.', 'Me emme ole.', 'Te ette ole.', 'He eivät ole.', 'Tämä ei ole.',
    ]);
    for (const p of [...st.pairs, ...ng.pairs]) {
      expect(p.a).toBeUndefined();
      expect(p.q.fi).not.toMatch(/\?/);
    }
  });

  test('слова в группах, хватает 5 неверных вариантов', () => {
    const index = {};
    Object.values(data.groups).forEach(g => g.forms.forEach(f => { index[f.toLowerCase()] = true; }));
    for (const part of data.parts) {
      for (const p of part.pairs) for (const w of p.q.fi.match(WORD)) expect(index[w.toLowerCase()], w).toBe(true);
    }
    Object.values(data.groups).forEach(g => expect(g.forms.length).toBeGreaterThanOrEqual(6));
  });
});

test('все уроки открываются и показывают свои подуроки', async ({ page }) => {
  // Открываем все уроки: в каждом подуроке 4.5
  await page.addInitScript(lessons => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const state = { cells: Array(100).fill('ok').map((c, i) => (i < 90 ? 'ok' : 'todo')), pos: 90, round: 1,
      pool: [], cursor: 0, pair: null, stage: 0, attempts: 1, correct: 90, wrong: 0, shown45: true, shown50: false };
    lessons.forEach(l => {
      const parts = {};
      l.parts.forEach(p => { parts[p.id] = state; });
      localStorage.setItem(`suomea.v3.lesson.${l.id}`, JSON.stringify({ wordsPct: 0, parts }));
    });
  }, lessons);
  await page.addInitScript(() => {
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true,
      value: { getVoices: () => [{ name: 'Satu', lang: 'fi-FI', voiceURI: 'Satu' }], speak() {}, cancel() {}, addEventListener() {} } });
  });
  await page.goto('/');
  for (const l of lessons) {
    await page.click(`#lesson-${l.id}`);
    await expect(page.locator('.lesson-title')).toHaveText(l.subtitle);
    for (const p of l.parts) {
      await page.click(`#open-part-${p.id.replace('.', '-')}`);
      await expect(page.locator('#back')).toContainText(p.mode === 'drill' ? l.title : `Урок ${p.id}`);
      await expect(page.locator('.word-option')).toHaveCount(6);
      const q = await page.evaluate(() => currentTask().fi);
      const sets = p.sets || [p.set];
      expect(read(l.sentences).parts.filter(s => sets.includes(s.id)).some(s => s.pairs.some(x => x.q.fi === q))).toBe(true);
      await page.click('#back');
    }
    if (!l.words) {
      await expect(page.locator('#open-words')).toHaveCount(0);
      await page.click('#back');
      continue;
    }
    await page.click('#open-words');
    await expect(page.locator('.option')).toHaveCount(6);
    const wordIndex = await page.evaluate(() => queue[idx].word);
    expect(await page.evaluate(i => words[i].fi, wordIndex)).toBe(read(l.words)[wordIndex].fi);
    await page.click('#back');
    await page.click('#back');
  }
});
