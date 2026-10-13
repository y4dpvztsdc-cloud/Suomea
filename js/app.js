// Экраны приложения, навигация, данные уроков и сохранение прогресса

const PASS_RATING = 4.5;  // с таким рейтингом открывается следующий урок, кружок синий

let lessons = [];     // список уроков из data/lessons.json
let lesson = null;    // открытый урок
let loadedLessonId = null;
let words = [];       // слова открытого урока
let stats = null;     // сохранённый прогресс открытого урока: { wordsPct, parts: { '1.1': … } }
let currentView = 'home';
let testMode = loadTestMode(); // режим проверки: все уроки и подуроки открыты
let homeTab = 'lessons';

// ---------- прогресс в localStorage ----------

function storageKey(id) {
  return `suomea.v3.lesson.${id}`;
}

function loadStats(id) {
  const empty = { wordsPct: 0, parts: {} };
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

// Режим проверки включается в «Настройках» или ссылкой с ?test=1
function loadTestMode() {
  if (new URLSearchParams(location.search).get('test') === '1') return true;
  try {
    return localStorage.getItem('suomea.testMode') === '1';
  } catch (e) {
    return false;
  }
}

function setTestMode(on) {
  testMode = on;
  try {
    localStorage.setItem('suomea.testMode', on ? '1' : '0');
  } catch (e) {
    // без хранилища режим действует до перезагрузки страницы
  }
}

function loadPartState(partId) {
  return stats.parts[partId] || null;
}

function savePartState(partId, state) {
  stats.parts[partId] = state;
  saveStats();
}

// Рейтинг подурока по сохранённому прогрессу (0.0, если его ещё не начинали)
function storedPartRating(lessonStats, partId) {
  const state = lessonStats.parts[partId];
  return state ? partRating(state) : 0;
}

// Рейтинг урока в списке — среднее по подурокам
// Подуроки со звёздами (пре-урок-тренажёр не входит в рейтинг и ничего не закрывает)
function ratedParts(l) {
  return l.parts.filter(p => p.mode !== 'drill');
}

function lessonRating(l) {
  const s = loadStats(l.id);
  const parts = ratedParts(l);
  const sum = parts.reduce((acc, p) => acc + storedPartRating(s, p.id), 0);
  return Math.floor((sum / parts.length) * 10 + 1e-9) / 10;
}

// Урок открыт, если в предыдущем уроке все подуроки набрали 4.5
// Предыдущий обязательный урок (пре-урок с "pre": true не закрывает следующие)
function prevRequiredLesson(index) {
  for (let i = index - 1; i >= 0; i--) {
    if (!lessons[i].pre) return lessons[i];
  }
  return null;
}

function isUnlocked(index) {
  const prev = prevRequiredLesson(index);
  if (!prev || testMode) return true;
  const s = loadStats(prev.id);
  return ratedParts(prev).every(p => storedPartRating(s, p.id) >= PASS_RATING);
}

// Подурок открыт, если в предыдущем подуроке набрано 4.5
// Предыдущий подурок со звёздами — тот, что открывает этот
function prevRatedPart(index) {
  for (let j = index - 1; j >= 0; j--) {
    if (lesson.parts[j].mode !== 'drill') return lesson.parts[j];
  }
  return null;
}

function isPartUnlocked(index) {
  const prev = prevRatedPart(index);
  return !prev || testMode || storedPartRating(stats, prev.id) >= PASS_RATING;
}

// Следующий подурок: в этом уроке или первый подурок следующего урока
function nextPartAfter(p) {
  const j = lesson.parts.indexOf(p);
  if (j + 1 < lesson.parts.length) return { lesson, part: lesson.parts[j + 1] };
  const i = lessons.indexOf(lesson);
  if (i + 1 < lessons.length) return { lesson: lessons[i + 1], part: lessons[i + 1].parts[0] };
  return null;
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
      ${testMode ? '<div class="test-badge" id="test-badge">Режим проверки</div>' : ''}
      <div class="segmented">
        <button id="tab-lessons" class="${homeTab === 'lessons' ? 'active' : ''}">Уроки</button>
        <button id="tab-dictionary" class="${homeTab === 'dictionary' ? 'active' : ''}">Словарь</button>
        <button id="tab-settings" class="${homeTab === 'settings' ? 'active' : ''}">Настройки</button>
      </div>
    `;
    document.getElementById('tab-lessons').addEventListener('click', () => showHome('lessons'));
    document.getElementById('tab-dictionary').addEventListener('click', () => showHome('dictionary'));
    document.getElementById('tab-settings').addEventListener('click', () => showHome('settings'));
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

// Кружок тренажёра: процент выполненных заданий или галочка, когда всё сделано
function drillCircle(state) {
  if (state && state.done) return '<span class="circle blue">&#10003;</span>';
  const pct = state && state.total ? drillPct(state) : 0;
  return `<span class="circle orange small">${pct}%</span>`;
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
  if (tab === 'settings') {
    renderSettings();
    return;
  }
  if (tab === 'dictionary') {
    body.innerHTML = `<div class="wordlist" id="dictionary">Загрузка…</div>`;
    const withWords = lessons.filter(l => l.words);
    Promise.all(withWords.map(l => loadJson(l.words))).then(lists => {
      if (currentView === 'home' && homeTab === 'dictionary') renderDictionary(withWords, lists);
    }).catch(showError);
    return;
  }
  body.innerHTML = `
    <div class="list">
      ${lessons.map((l, i) => isUnlocked(i) ? `
        <button class="list-row" id="lesson-${l.id}" data-id="${l.id}">
          ${l.pre ? drillCircle(loadStats(l.id).parts[l.parts[0].id]) : ratingCircle(lessonRating(l))}
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
            <span class="list-sub">${l.subtitle}</span>
            <span class="list-hint">Откроется, когда в «${prevRequiredLesson(i).title}» будет ${PASS_RATING.toFixed(1)}</span>
          </span>
        </div>
      `).join('')}
    </div>
  `;
  body.querySelectorAll('button.list-row').forEach(row => {
    row.addEventListener('click', () => openLesson(Number(row.dataset.id)));
  });
}

function renderSettings() {
  const body = document.getElementById('app-body');
  body.innerHTML = `
    <div class="list settings">
      <label class="list-row setting-row" for="test-mode">
        <span class="list-text">
          <span class="list-title">Режим проверки</span>
          <span class="list-sub">Все уроки и подуроки открыты сразу, без набора ${PASS_RATING.toFixed(1)}. Прогресс сохраняется как обычно.</span>
        </span>
        <input type="checkbox" class="switch" id="test-mode" ${testMode ? 'checked' : ''}>
      </label>
    </div>
  `;
  document.getElementById('test-mode').addEventListener('change', e => {
    setTestMode(e.target.checked);
    renderTopbar({ home: true });
  });
}

// Словарь — слова всех уроков, по разделам
function renderDictionary(withWords, lists) {
  document.getElementById('dictionary').innerHTML = withWords.map((l, i) => `
    <div class="wordlist-section" id="dict-${l.id}">
      <div class="wordlist-title">${l.title} · ${l.subtitle}</div>
      ${lists[i].map(w => `
        <div class="wordlist-row">
          <span class="fi">${w.fi}</span>
          <span class="ru">${w.ru}</span>
        </div>
      `).join('')}
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
  // У подурока может быть свой файл предложений ("source"), например у пре-урока
  const sources = [...new Set(l.parts.map(p => p.source).filter(Boolean))];
  const [wordData, sentences, description, ...extra] = await Promise.all([
    l.words ? loadJson(l.words) : [],
    loadJson(l.sentences),
    loadText(l.description),
    ...sources.map(loadJson),
  ]);
  words = wordData;
  l.descriptionHtml = description;
  l.sentenceData = sentences;
  l.sourceData = {};
  sources.forEach((src, i) => { l.sourceData[src] = extra[i]; });
  setSentenceData(sentences);
  loadedLessonId = l.id;
  restart();
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

// Название подурока на экране: «Урок 1+», «Урок 1−», «Тренажёр глагола olla»
function partName(p) {
  return p.name || `Урок ${p.id}`;
}

function showLesson() {
  currentView = 'lesson';
  stats = loadStats(lesson.id);
  renderTopbar({ title: lesson.title, back: () => showHome('lessons') });
  renderBottombar('');
  const partRows = lesson.parts.map((p, j) => isPartUnlocked(j) ? `
      <button class="list-row part-row" id="open-part-${p.id.replace('.', '-')}" data-part="${j}">
        ${p.mode === 'drill' ? drillCircle(stats.parts[p.id]) : ratingCircle(storedPartRating(stats, p.id))}
        <span class="list-text">
          <span class="list-title">${partName(p)}</span>
          <span class="list-sub">${p.title}</span>
        </span>
        ${chevronRight()}
      </button>
    ` : `
      <div class="list-row locked" id="open-part-${p.id.replace('.', '-')}">
        <span class="circle grey">${lockIcon()}</span>
        <span class="list-text">
          <span class="list-title">${partName(p)}</span>
          <span class="list-sub">${p.title}</span>
          <span class="list-hint">Откроется при ${PASS_RATING.toFixed(1)} в «${partName(prevRatedPart(j))}»</span>
        </span>
      </div>
    `).join('');
  document.getElementById('app-body').innerHTML = `
    <div class="lesson-title">${lesson.subtitle}</div>
    <div class="list">
      ${lesson.words ? `
      <button class="list-row" id="open-words">
        <span class="circle orange small">${stats.wordsPct}%</span>
        <span class="list-text"><span class="list-title">Слова урока</span></span>
        ${chevronRight()}
      </button>` : ''}
      ${partRows}
      <button class="list-row" id="open-description">
        <span class="circle icon">${readerIcon()}</span>
        <span class="list-text"><span class="list-title">Описание урока</span></span>
        ${chevronRight()}
      </button>
    </div>
  `;
  document.querySelectorAll('.part-row').forEach(row => {
    row.addEventListener('click', () => openPartScreen(lesson.parts[Number(row.dataset.part)]));
  });
  const openWords = document.getElementById('open-words');
  if (openWords) openWords.addEventListener('click', showWords);
  document.getElementById('open-description').addEventListener('click', () => showDescription(showLesson));
}

// Из «Слов урока» — в первый открытый подурок со звёздами, где ещё нет 4.5
function continueSentences() {
  stats = loadStats(lesson.id);
  const open = lesson.parts.filter((p, j) => p.mode !== 'drill' && isPartUnlocked(j));
  const target = open.find(p => storedPartRating(stats, p.id) < PASS_RATING) || open[open.length - 1];
  openPartScreen(target);
}

function openPartScreen(p) {
  setSentenceData(p.source ? lesson.sourceData[p.source] : lesson.sentenceData);
  openPart(p);
  showSentences();
}

// Переход из поздравления к следующему подуроку (возможно, в другом уроке)
async function openNextPart(next) {
  if (next.lesson !== lesson) {
    try {
      await ensureLesson(next.lesson);
    } catch (error) {
      showError(error);
      return;
    }
  }
  openPartScreen(next.part);
}

function showWords() {
  currentView = 'words';
  renderTopbar({ back: showLesson, backLabel: lesson.title, right: '<span class="topbar-caption">Слова урока</span>' });
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
