// Основная часть урока: составление финских предложений по русскому переводу.
// Часть 1 — вопросы и утвердительные ответы, часть 2 — вопросы и отрицательные ответы.

const PAIRS_PER_PART = 10; // сколько пар вопрос/ответ берётся в одну часть урока
const SENTENCE_OPTIONS = 6;
const FI_WORD = /([A-Za-zÅÄÖåäö]+)([^A-Za-zÅÄÖåäö]*)/g;

let sentenceData = null; // { groups, parts } из data/sentences.json
let formGroup = {};      // словоформа в нижнем регистре -> имя группы
let sPart = 0;
let sQueue = [];         // задания: { ru, fi, tokens: [{ w, p }], cell }
let sCells = [];         // клетки прогресса части: 'todo' | 'ok' | 'err'
let sIdx = 0;
let sBuilt = [];         // выбранные пользователем слова
let sOptions = [];       // варианты для следующего слова
let sChecked = false;
let sLastCorrect = false;
let sMistakes = 0;       // ошибки в текущей части
let sLessonCorrect = 0;
let sLessonMistakes = 0;

function setSentenceData(data) {
  sentenceData = data;
  formGroup = {};
  Object.entries(data.groups).forEach(([name, group]) => {
    group.forms.forEach(f => { formGroup[f.toLowerCase()] = name; });
  });
}

// "Joo, minä olen autossa." -> [{w:'Joo', p:','}, {w:'minä', p:''}, ..., {w:'autossa', p:'.'}]
function tokenize(sentence) {
  return [...sentence.matchAll(FI_WORD)].map(m => ({ w: m[1], p: m[2].trim() }));
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function makeTask(s, cell) {
  return { ru: s.ru, fi: s.fi, tokens: tokenize(s.fi), cell };
}

function buildSentenceQueue(partIndex) {
  const pairs = shuffle(sentenceData.parts[partIndex].pairs).slice(0, PAIRS_PER_PART);
  const tasks = [];
  pairs.forEach(pair => {
    tasks.push(makeTask(pair.q, tasks.length));
    tasks.push(makeTask(pair.a, tasks.length));
  });
  return tasks;
}

// Правильное слово + 5 неверных из той же группы словоформ (при нехватке — из группы pad)
function pickWordOptions(token, position) {
  const need = SENTENCE_OPTIONS - 1;
  const lower = token.w.toLowerCase();
  const group = sentenceData.groups[formGroup[lower]];
  const differs = f => f.toLowerCase() !== lower;

  let distractors = shuffle(group.forms.filter(differs)).slice(0, need);
  if (distractors.length < need && group.pad) {
    const pad = sentenceData.groups[group.pad].forms.filter(f => differs(f) && !distractors.includes(f));
    distractors = distractors.concat(shuffle(pad).slice(0, need - distractors.length));
  }
  if (distractors.length < need) {
    const all = Object.values(sentenceData.groups).flatMap(g => g.forms);
    const rest = all.filter(f => differs(f) && !distractors.includes(f));
    distractors = distractors.concat(shuffle(rest).slice(0, need - distractors.length));
  }
  const show = w => (position === 0 ? capitalize(w) : w);
  return shuffle([token.w, ...distractors].map(show));
}

function currentTask() {
  return sQueue[sIdx];
}

function prepareOptions() {
  const task = currentTask();
  sOptions = sBuilt.length < task.tokens.length
    ? pickWordOptions(task.tokens[sBuilt.length], sBuilt.length)
    : [];
}

function startPart(partIndex) {
  sPart = partIndex;
  sQueue = buildSentenceQueue(partIndex);
  sCells = sQueue.map(() => 'todo');
  sIdx = 0;
  sMistakes = 0;
  resetSentence();
  if (currentView === 'sentences') renderSentences();
}

function startSentences() {
  sLessonCorrect = 0;
  sLessonMistakes = 0;
  startPart(0);
}

function resetSentence() {
  sBuilt = [];
  sChecked = false;
  sLastCorrect = false;
  if (sIdx < sQueue.length) prepareOptions();
}

function sentenceTopbar() {
  renderTopbar({
    back: showLesson,
    backLabel: lesson.title,
    right: `
      <span class="stat" title="Рейтинг">${starIcon()}<b id="stat-rating">${rating(stats).toFixed(1)}</b></span>
      <span class="stat" title="Верно">${checkIcon()}<b id="stat-correct">${stats.correct}</b></span>
      <span class="stat" title="Ошибки">${crossIcon()}<b id="stat-wrong">${stats.wrong}</b></span>
    `,
  });
}

function renderCells() {
  const cells = sCells.map((state, i) => {
    const current = !sChecked && sIdx < sQueue.length && currentTask().cell === i;
    return `<span class="cell ${state}${current ? ' current' : ''}"></span>`;
  }).join('');
  return `<div class="cells" id="cells">${cells}</div>`;
}

function renderSentenceDone() {
  const last = sPart === sentenceData.parts.length - 1;
  const body = document.getElementById('app-body');
  if (!last) {
    const next = sentenceData.parts[sPart + 1];
    body.innerHTML = `
      <div class="done-screen">
        <div class="big">&#9989;</div>
        <h2>Часть ${sPart + 1} пройдена</h2>
        <p>${sentenceData.parts[sPart].title}. Ошибок: ${sMistakes}</p>
        <button class="restart-btn" id="next-part">Часть ${sPart + 2}: ${next.title.toLowerCase()}</button>
      </div>
    `;
    document.getElementById('next-part').addEventListener('click', () => startPart(sPart + 1));
    return;
  }
  const pct = Math.round((sLessonCorrect / (sLessonCorrect + sLessonMistakes)) * 100);
  body.innerHTML = `
    <div class="done-screen">
      <div class="big">&#127942;</div>
      <h2>Урок пройден</h2>
      <p>Точность: ${pct}% (ошибок: ${sLessonMistakes})</p>
      <button class="restart-btn" id="restart-sentences">Повторить предложения</button>
    </div>
  `;
  document.getElementById('restart-sentences').addEventListener('click', startSentences);
}

function renderSentences() {
  sentenceTopbar();
  if (sIdx >= sQueue.length) {
    renderBottombar('');
    renderSentenceDone();
    return;
  }
  renderBottombar(`
    <button class="barbtn" id="oops">${undoIcon()}Ой, ошибся</button>
    <button class="barbtn" id="help">${bookIcon()}Помощь</button>
  `);

  const task = currentTask();
  const complete = sBuilt.length === task.tokens.length;
  const part = sentenceData.parts[sPart];
  const state = sChecked ? (sLastCorrect ? ' correct' : ' wrong') : '';

  const built = sBuilt.map((w, i) => `<span class="chip" data-pos="${i}">${w}${task.tokens[i].p}</span>`).join('');
  const answer = sChecked && !sLastCorrect
    ? `<div class="right-answer">${task.fi}</div>`
    : '';

  let hint = '';
  if (sChecked) hint = 'Нажмите на экран, чтобы продолжить';
  else if (complete) hint = 'Нажмите на экран, чтобы проверить';

  document.getElementById('app-body').innerHTML = `
    <div class="sentence-screen" id="sentence-screen">
      <div class="part-label">Часть ${sPart + 1} из ${sentenceData.parts.length} · ${part.title}</div>
      <div class="sentence-ru">${task.ru}</div>
      <div class="answer-field${state}" id="built">
        <div class="built-words">${built}</div>
        ${answer}
      </div>
      <div class="options six">
        ${sOptions.map(o => `<div class="option word-option">${o}</div>`).join('')}
      </div>
      <div class="tap-hint">${hint}</div>
      ${renderCells()}
    </div>
  `;

  document.querySelectorAll('.word-option').forEach(el => {
    el.addEventListener('click', () => chooseWord(el.textContent));
  });
  if (!sChecked) {
    // Нажатие на выбранное слово убирает его и все слова после него
    document.querySelectorAll('.chip[data-pos]').forEach(el => {
      el.addEventListener('click', () => undoFrom(parseInt(el.dataset.pos, 10)));
    });
  }
  // Проверка и переход дальше — нажатием на пустое место экрана
  document.getElementById('sentence-screen').addEventListener('click', e => {
    if (e.target.closest('.word-option, .chip')) return;
    if (sChecked) nextSentence();
    else if (complete) checkSentence();
  });
  document.getElementById('oops').addEventListener('click', () => {
    if (!sChecked && sBuilt.length) undoFrom(sBuilt.length - 1);
  });
  document.getElementById('help').addEventListener('click', () => showDescription(showSentences));
}

function chooseWord(word) {
  sBuilt.push(word);
  prepareOptions();
  renderSentences();
}

function undoFrom(position) {
  sBuilt = sBuilt.slice(0, position);
  prepareOptions();
  renderSentences();
}

// Проверяется только всё предложение целиком
function checkSentence() {
  const task = currentTask();
  sLastCorrect = task.tokens.every((t, i) => t.w.toLowerCase() === sBuilt[i].toLowerCase());
  sChecked = true;
  recordSentence(sLastCorrect);
  if (sLastCorrect) {
    sLessonCorrect++;
    sCells[task.cell] = 'ok';
  } else {
    sMistakes++;
    sLessonMistakes++;
    sCells[task.cell] = 'err';
    // Неверно составленное предложение вернётся через несколько заданий
    sQueue.splice(Math.min(sIdx + 1 + RETRY_GAP, sQueue.length), 0, task);
  }
  speakFinnish(task.fi);
  renderSentences();
}

function nextSentence() {
  sIdx++;
  resetSentence();
  renderSentences();
}
