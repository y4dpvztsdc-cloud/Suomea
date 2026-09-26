// Основная часть урока: составление финских предложений по русскому переводу.
// Часть 1 — вопросы и утвердительные ответы, часть 2 — вопросы и отрицательные ответы.

const PAIRS_PER_PART = 10; // сколько пар вопрос/ответ берётся в одну часть урока
const FI_WORD = /([A-Za-zÅÄÖåäö]+)([^A-Za-zÅÄÖåäö]*)/g;

let sentenceData = null; // { groups, parts } из data/sentences.json
let formGroup = {};      // словоформа в нижнем регистре -> имя группы
let sPart = 0;
let sQueue = [];         // задания: { ru, fi, tokens: [{ w, p }] }
let sIdx = 0;
let sBuilt = [];         // выбранные пользователем слова
let sOptions = [];       // варианты для следующего слова
let sChecked = false;
let sLastCorrect = false;
let sCorrect = 0;        // верно составленные предложения в текущей части
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

function makeTask(s) {
  return { ru: s.ru, fi: s.fi, tokens: tokenize(s.fi) };
}

function buildSentenceQueue(partIndex) {
  const pairs = shuffle(sentenceData.parts[partIndex].pairs).slice(0, PAIRS_PER_PART);
  const tasks = [];
  pairs.forEach(pair => {
    tasks.push(makeTask(pair.q));
    tasks.push(makeTask(pair.a));
  });
  return tasks;
}

function partTotal() {
  return Math.min(PAIRS_PER_PART, sentenceData.parts[sPart].pairs.length) * 2;
}

// Правильное слово + 3 неверных из той же группы словоформ
function pickWordOptions(token, position) {
  const lower = token.w.toLowerCase();
  const group = sentenceData.groups[formGroup[lower]];
  const differs = f => f.toLowerCase() !== lower;

  let distractors = shuffle(group.forms.filter(differs)).slice(0, 3);
  if (distractors.length < 3 && group.pad) {
    const pad = sentenceData.groups[group.pad].forms.filter(f => differs(f) && !distractors.includes(f));
    distractors = distractors.concat(shuffle(pad).slice(0, 3 - distractors.length));
  }
  if (distractors.length < 3) {
    const all = Object.values(sentenceData.groups).flatMap(g => g.forms);
    const rest = all.filter(f => differs(f) && !distractors.includes(f));
    distractors = distractors.concat(shuffle(rest).slice(0, 3 - distractors.length));
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
  sIdx = 0;
  sCorrect = 0;
  sMistakes = 0;
  resetSentence();
  renderSentences();
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

function renderBuilt(task) {
  const state = sChecked ? (sLastCorrect ? ' correct' : ' wrong') : '';
  const chips = task.tokens.map((t, i) => {
    if (i < sBuilt.length) {
      return `<span class="chip" data-pos="${i}">${sBuilt[i]}${t.p}</span>`;
    }
    return `<span class="chip placeholder"></span>`;
  }).join('');
  return `<div class="built${state}" id="built">${chips}</div>`;
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
  document.getElementById('header-title').textContent = 'Предложения';
  if (sIdx >= sQueue.length) {
    renderSentenceDone();
    return;
  }

  const task = currentTask();
  const complete = sBuilt.length === task.tokens.length;
  const pct = Math.round((sCorrect / partTotal()) * 100);
  const part = sentenceData.parts[sPart];

  let bottom;
  if (sChecked) {
    bottom = `
      <div class="sentence-result ${sLastCorrect ? 'correct-text' : 'wrong-text'}">
        ${sLastCorrect ? 'Верно!' : 'Неверно. Правильный вариант:'}
      </div>
      <div class="sentence-answer">
        <button class="speaker-btn-inline" id="speak-sentence" aria-label="Произнести">${speakerSvg()}</button>
        <span>${task.fi}</span>
      </div>
      <button class="check-btn" id="next-sentence">Далее</button>
    `;
  } else if (complete) {
    bottom = `<button class="check-btn" id="check-sentence">Проверить</button>`;
  } else {
    bottom = `
      <div class="options">
        ${sOptions.map(o => `<div class="option word-option">${o}</div>`).join('')}
      </div>
    `;
  }

  document.getElementById('app-body').innerHTML = `
    <div class="content">
      <div class="direction-label">Часть ${sPart + 1} из ${sentenceData.parts.length} · ${part.title}</div>
      <div class="sentence-ru">${task.ru}</div>
      ${renderBuilt(task)}
      <div class="sentence-bottom">${bottom}</div>
    </div>
    <div class="progress-row">
      <div class="progress-pct">${pct}%</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
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
  const check = document.getElementById('check-sentence');
  if (check) check.addEventListener('click', checkSentence);
  const next = document.getElementById('next-sentence');
  if (next) next.addEventListener('click', nextSentence);
  const speak = document.getElementById('speak-sentence');
  if (speak) speak.addEventListener('click', () => speakFinnish(task.fi));
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
  if (sLastCorrect) {
    sCorrect++;
    sLessonCorrect++;
  } else {
    sMistakes++;
    sLessonMistakes++;
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

function speakerSvg() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>`;
}
