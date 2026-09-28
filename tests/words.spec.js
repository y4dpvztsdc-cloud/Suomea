const { test, expect } = require('@playwright/test');
const words = require('../data/lessons/1-words.json');

test('в словаре у каждого слова есть fi, ru и group', () => {
  expect(words.length).toBeGreaterThan(0);
  for (const w of words) {
    expect(typeof w.fi).toBe('string');
    expect(typeof w.ru).toBe('string');
    expect(typeof w.group).toBe('string');
    if ('rate' in w) expect(typeof w.rate).toBe('number');
  }
});

test('финские слова не повторяются', () => {
  const fi = words.map(w => w.fi);
  expect(new Set(fi).size).toBe(fi.length);
});
