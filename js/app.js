// Экраны приложения, навигация, данные уроков и сохранение прогресса

// Рейтинг 0–5: каждые 2 верных предложения из последних 100 дают 0.1 звезды,
// поэтому 5.0 — это 100 верных ответов подряд.
const RATING_WINDOW = 100;
const PASS_RATING = 4.5;  // с таким рейтингом открывается следующий урок, кружок синий

let lessons = [];     // список уроков из data/lessons.json
let lesson = null;    // открытый урок
let loadedLessonId = null;
let words = [];       // слова открытого урока
let stats = null;     // сохранённая статистика открытого урока
let currentView = 'home';
let homeTab = 'lessons';

// ---------- прогресс в localStorage ----------

function storageKey(id) {
  return `suomea.lesson.${id}`;
}

function loadStats(id) {
  const empty = { history: [], correct: 0, wrong: 0, wordsPct: 0 };
  try {
    return Object.assign(empty, JSON.parse(localStorage.getItem(storageKey(id))) || {});
  } catch (e) {
    return empty;
  }
}

function saveStats() {
  try {
    localStorage.setItem(storageKey(lesson.id), JSON.stringify(stats));
  } catch (e) {
    // без хранилища прогресс живёт до перезагрузки страницы
  }
}

function rating(s) {
  const ok = s.history.slice(-RATING_WINDOW).filter(Boolean).length;
  return Math.floor(ok / 2) / 10;
}

// Первый урок открыт всегда, следующий — когда в предыдущем набрано 4.5
function isUnlocked(index) {
  return index === 0 || rating(loadStats(lessons[index - 1].id)) >= PASS_RATING;
}

function recordSentence(ok) {
  stats.history.push(ok);
  if (stats.history.length > RATING_WINDOW) stats.history.shift();
  if (ok) stats.correct++;
  else stats.wrong++;
  saveStats();
}

function recordWordsPct(pct) {
  stats.wordsPct = Math.max(stats.wordsPct, pct);
  saveStats();
}

// ---------- общие элементы экрана ----------

function renderTopbar({ title = '', back = null, backLabel = '', right = '', home = false }) {
  const bar = document.getElementById('topbar');
  if (home) {
    bar.className = 'topbar home';
    bar.innerHTML = `
      <h1>Suomea</h1>
      <div class="segmented">
        <button id="tab-lessons" class="${homeTab === 'lessons' ? 'active' : ''}">Уроки</button>
        <button id="tab-dictionary" class="${homeTab === 'dictionary' ? 'active' : ''}">Словарь</button>
      </div>
    `;
    document.getElementById('tab-lessons').addEventListener('click', () => showHome('lessons'));
    document.getElementById('tab-dictionary').addEventListener('click', () => showHome('dictionary'));
    return;
  }
  bar.className = 'topbar';
  bar.innerHTML = `
    <button class="back" id="back" aria-label="Назад">${chevronIcon()}<span>${backLabel}</span></button>
    <h1 id="header-title">${title}</h1>
    <div class="topbar-right">${right}</div>
  `;
  document.getElementById('back').addEventListener('click', back);
}

function renderBottombar(html) {
  const bar = document.getElementById('bottombar');
  bar.innerHTML = html;
  bar.hidden = !html;
}

function ratingCircle(value) {
  const cls = value >= PASS_RATING ? 'blue' : 'orange';
  return `<span class="circle ${cls}">${value.toFixed(1)}</span>`;
}

// ---------- экраны ----------

function showHome(tab = homeTab) {
  currentView = 'home';
  homeTab = tab;
  renderTopbar({ home: true });
  renderBottombar('');
  const body = document.getElementById('app-body');
  if (tab === 'dictionary') {
    body.innerHTML = `<div class="wordlist" id="dictionary">Загрузка…</div>`;
    ensureLesson(lessons[0]).then(() => {
      if (currentView === 'home' && homeTab === 'dictionary') renderDictionary();
    });
    return;
  }
  body.innerHTML = `
    <div class="list">
      ${lessons.map((l, i) => isUnlocked(i) ? `
        <button class="list-row" id="lesson-${l.id}" data-id="${l.id}">
          ${ratingCircle(rating(loadStats(l.id)))}
          <span class="list-text">
            <span class="list-title">${l.title}</span>
            <span class="list-sub">${l.subtitle}</span>
          </span>
        </button>
      ` : `
        <div class="list-row locked" id="lesson-${l.id}">
          <span class="circle grey">${lockIcon()}</span>
          <span class="list-text">
            <span class="list-title">${l.title}</span>
            <span class="list-sub">Откроется, когда в «${lessons[i - 1].title}» будет ${PASS_RATING.toFixed(1)}</span>
          </span>
        </div>
      `).join('')}
    </div>
  `;
  body.querySelectorAll('button.list-row').forEach(row => {
    row.addEventListener('click', () => openLesson(Number(row.dataset.id)));
  });
}

function renderDictionary() {
  document.getElementById('dictionary').innerHTML = words.map(w => `
    <div class="wordlist-row">
      <span class="fi">${w.fi}</span>
      <span class="ru">${w.ru}</span>
    </div>
  `).join('');
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(url + ': HTTP ' + response.status);
  return response.json();
}

async function loadText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(url + ': HTTP ' + response.status);
  return response.text();
}

// Загружает слова, предложения и описание урока (один раз) и готовит упражнения
async function ensureLesson(l) {
  lesson = l;
  stats = loadStats(l.id);
  if (loadedLessonId === l.id) return;
  const [wordData, sentences, description] = await Promise.all([
    loadJson(l.words),
    loadJson(l.sentences),
    loadText(l.description),
  ]);
  words = wordData;
  l.descriptionHtml = description;
  setSentenceData(sentences);
  loadedLessonId = l.id;
  restart();
  startSentences();
}

async function openLesson(id) {
  try {
    await ensureLesson(lessons.find(l => l.id === id));
  } catch (error) {
    showError(error);
    return;
  }
  showLesson();
}

function showLesson() {
  currentView = 'lesson';
  stats = loadStats(lesson.id);
  const r = rating(stats);
  const started = stats.correct + stats.wrong > 0;
  renderTopbar({ title: lesson.title, back: () => showHome('lessons') });
  renderBottombar('');
  document.getElementById('app-body').innerHTML = `
    <div class="lesson-title">${lesson.subtitle}</div>
    <div class="list">
      <button class="list-row" id="open-sentences">
        ${ratingCircle(r)}
        <span class="list-text"><span class="list-title">${started ? 'Продолжить урок' : 'Начать урок'}</span></span>
        ${chevronRight()}
      </button>
      <button class="list-row" id="open-words">
        <span class="circle orange small">${stats.wordsPct}%</span>
        <span class="list-text"><span class="list-title">Учить новые слова</span></span>
        ${chevronRight()}
      </button>
      <button class="list-row" id="open-description">
        <span class="circle icon">${readerIcon()}</span>
        <span class="list-text"><span class="list-title">Описание урока</span></span>
        ${chevronRight()}
      </button>
    </div>
  `;
  document.getElementById('open-sentences').addEventListener('click', showSentences);
  document.getElementById('open-words').addEventListener('click', showWords);
  document.getElementById('open-description').addEventListener('click', () => showDescription(showLesson));
}

function showWords() {
  currentView = 'words';
  renderTopbar({ back: showLesson, backLabel: lesson.title, right: '<span class="topbar-caption">Новые слова</span>' });
  renderBottombar('');
  renderTrain();
}

function showSentences() {
  currentView = 'sentences';
  renderSentences();
}

function showDescription(back) {
  currentView = 'description';
  renderTopbar({ title: 'Описание урока', back });
  renderBottombar('');
  document.getElementById('app-body').innerHTML = `<div class="description">${lesson.descriptionHtml}</div>`;
}

function showError(error) {
  console.error(error);
  document.getElementById('app-body').innerHTML = `
    <div class="done-screen">
      <h2>Не удалось загрузить слова</h2>
      <p>Запустите проект через локальный сервер (см. README).</p>
    </div>
  `;
}

// ---------- иконки ----------

function chevronIcon() {
  return `<svg width="14" height="22" viewBox="0 0 14 22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2 3 11l8 9"/></svg>`;
}

function chevronRight() {
  return `<svg class="chevron" width="9" height="15" viewBox="0 0 9 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m1.5 1.5 6 6-6 6"/></svg>`;
}

function starIcon() {
  return `<svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(255,255,255,.35)"/><path d="m12 5.5 1.9 4 4.3.5-3.2 3 .9 4.3L12 15.2l-3.9 2.1.9-4.3-3.2-3 4.3-.5z" fill="#fff"/></svg>`;
}

function checkIcon() {
  return `<svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(255,255,255,.35)"/><path d="m7 12.5 3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function crossIcon() {
  return `<svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(255,255,255,.35)"/><path d="m8 8 8 8M16 8l-8 8" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`;
}

function undoIcon() {
  return `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10.5"/><path d="M10 8 6.5 11.5 10 15"/><path d="M6.5 11.5H14a3.5 3.5 0 0 1 0 7h-1"/></svg>`;
}

function bookIcon() {
  return `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><circle cx="12" cy="12" r="10.5"/><path d="M6.5 8.5c2-.8 4-.6 5.5.6v8c-1.5-1.2-3.5-1.4-5.5-.6zM17.5 8.5c-2-.8-4-.6-5.5.6v8c1.5-1.2 3.5-1.4 5.5-.6z"/></svg>`;
}

function lockIcon() {
  return `<svg width="20" height="22" viewBox="0 0 20 22" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="9" width="16" height="12" rx="2.5" fill="currentColor"/><path d="M5.5 9V6.5a4.5 4.5 0 0 1 9 0V9"/></svg>`;
}

function readerIcon() {
  return `<svg width="46" height="46" viewBox="0 0 48 48"><circle cx="24" cy="11" r="5" fill="currentColor"/><path d="M5 19c7-1 13 1 19 5 6-4 12-6 19-5v17c-7-1-13 1-19 6-6-5-12-7-19-6z" fill="currentColor"/></svg>`;
}

// ---------- запуск ----------

async function init() {
  initVoice();
  document.getElementById('voice-warning-close').addEventListener('click', () => setVoiceWarning(false));
  try {
    lessons = await loadJson('data/lessons.json');
  } catch (error) {
    showError(error);
    return;
  }
  showHome('lessons');
}

init();
