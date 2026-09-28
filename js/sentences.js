// Составление финских предложений по русскому переводу (подуроки 1.1, 1.2 …).
//
// Пары вопрос/ответ идут в случайном порядке, но внутри пары всегда сначала «а»
// (вопрос), затем «б» (ответ). После ошибки то же предложение даётся ещё раз,
// всего не больше 3 раз подряд.
//
// Внизу экрана 100 клеток — журнал ответов: каждый ответ (и повтор) занимает
// следующую клетку, верный — голубую, ошибка — красную (метка, когда она была).
// Пройдя 100 клеток, круг начинается заново и перезаписывает клетки по порядку,
// так что красную клетку можно «перекрасить» на следующем круге.
// Рейтинг = 0.1 звезды за каждые 2 голубые клетки, 5.0 — все 100 голубые.

const CELLS = 100;
const MAX_ATTEMPTS = 3; // сколько раз подряд даётся одно предложение после ошибок
const SENTENCE_OPTIONS = 6;
const FI_WORD = /([A-Za-zÅÄÖåäö]+)([^A-Za-zÅÄÖåäö]*)/g;

// Похвала за верно составленное предложение: крупно по-фински, мелко перевод
const PRAISE = [
  { fi: 'Hienoa!', ru: 'Отлично!' },
  { fi: 'Erinomaista!', ru: 'Превосходно!' },
  { fi: 'Loistavaa!', ru: 'Блестяще!' },
  { fi: 'Mahtavaa!', ru: 'Потрясающе!' },
  { fi: 'Upeaa!', ru: 'Великолепно!' },
  { fi: 'Mainiota!', ru: 'Замечательно!' },
  { fi: 'Täydellistä!', ru: 'Идеально!' },
  { fi: 'Hyvin tehty!', ru: 'Хорошая работа!' },
  { fi: 'Juuri niin!', ru: 'Именно так!' },
  { fi: 'Aivan oikein!', ru: 'Совершенно верно!' },
  { fi: 'Olet taitava!', ru: 'Ты молодец!' },
  { fi: 'Kerrassaan hienoa!', ru: 'Просто замечательно!' },
  { fi: 'Jatka samaan malliin!', ru: 'Продолжай в том же духе!' },
  { fi: 'Sinä osaat tämän!', ru: 'У тебя получается!' },
];
const TRY_AGAIN = { fi: 'Yritä uudelleen!', ru: 'Попробуй снова!' };

let sentenceData = null; // { groups, parts } из файла предложений урока
let formGroup = {};      // словоформа в нижнем регистре -> имя группы
let part = null;         // открытый подурок из lessons.json
let ps = null;           // сохранённое состояние подурока (см. newPartState)
let sBuilt = [];         // выбранные пользователем слова
let sOptions = [];       // варианты для следующего слова
let sChecked = false;
let sLastCorrect = false;
let sPraise = null;
let sCongrats = null;    // '4.5' | '5.0' — поздравление после этого ответа
let sCheckedTask = null; // проверенное предложение (пока на экране результат)

function setSentenceData(data) {
  sentenceData = data;
  formGroup = {};
  Object.entries(data.groups).forEach(([name, group]) => {
    group.forms.forEach(f => { formGroup[f.toLowerCase()] = name; });
  });
}

function partPairs(p = part) {
  return sentenceData.parts.find(s => s.id === p.set).pairs;
}

// ---------- состояние подурока ----------

function newPartState() {
  return {
    cells: Array(CELLS).fill('todo'), // 'todo' | 'ok' | 'err'
    pos: 0,          // клетка, которую заполнит следующий ответ
    round: 1,
    pool: [],        // перемешанные номера пар
    cursor: 0,
    pair: null,      // текущая пара
    stage: 0,        // 0 — вопрос («а»), 1 — ответ («б»)
    attempts: 1,     // какая по счёту попытка текущего предложения
    correct: 0,
    wrong: 0,
    shown45: false,  // поздравления показываются один раз
    shown50: false,
  };
}

// Следующая пара в случайном порядке; когда все пройдены — новое перемешивание
function nextPair() {
  if (ps.cursor >= ps.pool.length) {
    ps.pool = shuffle(partPairs().map((_, i) => i));
    ps.cursor = 0;
  }
  return ps.pool[ps.cursor++];
}

function partRating(state) {
  const ok = state.cells.filter(c => c === 'ok').length;
  return Math.floor(ok / 2) / 10;
}

function openPart(p) {
  part = p;
  ps = loadPartState(p.id) || newPartState();
  if (ps.pair === null) ps.pair = nextPair();
  savePartState(p.id, ps);
  resetSentence();
}

// ---------- задание ----------

// "Joo, minä olen autossa." -> [{w:'Joo', p:','}, {w:'minä', p:''}, ..., {w:'autossa', p:'.'}]
function tokenize(sentence) {
  return [...sentence.matchAll(FI_WORD)].map(m => ({ w: m[1], p: m[2].trim() }));
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function currentTask() {
  const pair = partPairs()[ps.pair];
  const s = ps.stage === 0 ? pair.q : pair.a;
  return { ru: s.ru, fi: s.fi, tokens: tokenize(s.fi) };
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

function prepareOptions() {
  const task = currentTask();
  sOptions = sBuilt.length < task.tokens.length
    ? pickWordOptions(task.tokens[sBuilt.length], sBuilt.length)
    : [];
}

function resetSentence() {
  sBuilt = [];
  sChecked = false;
  sLastCorrect = false;
  sCongrats = null;
  prepareOptions();
}

// Случайная похвала, не повторяющая предыдущую
function pickPraise() {
  const choices = PRAISE.filter(p => p !== sPraise);
  return choices[Math.floor(Math.random() * choices.length)];
}

// ---------- экран ----------

function sentenceTopbar() {
  renderTopbar({
    back: showLesson,
    backLabel: `Урок ${part.id}`,
    right: `
      <span class="stat" title="Рейтинг">${starIcon()}<b id="stat-rating">${partRating(ps).toFixed(1)}</b></span>
      <span class="stat" title="Верно">${checkIcon()}<b id="stat-correct">${ps.correct}</b></span>
      <span class="stat" title="Ошибки">${crossIcon()}<b id="stat-wrong">${ps.wrong}</b></span>
    `,
  });
}

function renderCells() {
  const cells = ps.cells.map((state, i) =>
    `<span class="cell ${state}${!sChecked && i === ps.pos ? ' current' : ''}"></span>`
  ).join('');
  return `<div class="cells" id="cells">${cells}</div>`;
}

function renderSentences() {
  sentenceTopbar();
  renderBottombar(`
    <button class="barbtn" id="oops">${undoIcon()}Ой, ошибся</button>
    <button class="barbtn" id="help">${bookIcon()}Помощь</button>
  `);

  const task = sChecked ? sCheckedTask : currentTask();
  const complete = sBuilt.length === task.tokens.length;
  const state = sChecked ? (sLastCorrect ? ' correct' : ' wrong') : '';

  // После неверной проверки ошибочные слова выделяются ярко-красным
  const built = sBuilt.map((w, i) => {
    const bad = sChecked && w.toLowerCase() !== task.tokens[i].w.toLowerCase();
    return `<span class="chip${bad ? ' bad' : ''}" data-pos="${i}">${w}${task.tokens[i].p}</span>`;
  }).join('');

  // После проверки: крупная фраза по-фински посередине белого поля, перевод — внизу
  let answer = '';
  let middle = `
    <div class="options six">
      ${sOptions.map(o => `<div class="option word-option">${o}</div>`).join('')}
    </div>
  `;
  let translation = '';
  if (sChecked) {
    const verdict = sLastCorrect ? sPraise : TRY_AGAIN;
    const cls = sLastCorrect ? 'praise' : 'try-again';
    if (!sLastCorrect) {
      answer = `
        <div class="right-answer" id="right-answer">
          <button class="speaker-btn-inline" id="speak-answer" aria-label="Произнести">${speakerSvg(20)}</button>
          <span>${task.fi}</span>
        </div>
      `;
    }
    middle = `<div class="verdict ${cls}"><div class="verdict-fi">${verdict.fi}</div></div>`;
    translation = `<div class="verdict-ru ${cls}">${verdict.ru}</div>`;
  }

  let hint = '';
  if (sChecked) hint = 'Нажмите на экран, чтобы продолжить';
  else if (complete) hint = 'Нажмите на экран, чтобы проверить';

  document.getElementById('app-body').innerHTML = `
    <div class="sentence-screen" id="sentence-screen">
      <div class="sentence-ru">${task.ru}</div>
      <div class="answer-field${state}" id="built">
        <div class="built-words">${built}</div>
      </div>
      ${answer}
      ${middle}
      ${translation}
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
    if (e.target.closest('.word-option, #speak-answer')) return;
    if (!sChecked && e.target.closest('.chip')) return;
    if (sChecked) nextSentence();
    else if (complete) checkSentence();
  });
  document.getElementById('oops').addEventListener('click', () => {
    if (!sChecked && sBuilt.length) undoFrom(sBuilt.length - 1);
  });
  document.getElementById('help').addEventListener('click', () => showDescription(showSentences));
  const speak = document.getElementById('speak-answer');
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

// Проверяется только всё предложение целиком. Результат сразу записывается в клетку,
// и сразу выбирается следующее предложение — прогресс не теряется при перезагрузке.
function checkSentence() {
  const task = currentTask();
  sLastCorrect = task.tokens.every((t, i) => t.w.toLowerCase() === sBuilt[i].toLowerCase());
  sChecked = true;
  sCheckedTask = task;
  ps.cells[ps.pos] = sLastCorrect ? 'ok' : 'err';
  if (sLastCorrect) {
    ps.correct++;
    sPraise = pickPraise();
  } else {
    ps.wrong++;
  }

  const r = partRating(ps);
  if (r >= 5 && !ps.shown50) {
    sCongrats = '5.0';
    ps.shown50 = true;
    ps.shown45 = true;
  } else if (r >= PASS_RATING && !ps.shown45) {
    sCongrats = '4.5';
    ps.shown45 = true;
  }
  advanceCell();
  advanceTask();
  savePartState(part.id, ps);
  speakFinnish(task.fi);
  renderSentences();
}

// Ответ занимает следующую клетку; после 100-й круг начинается заново
function advanceCell() {
  ps.pos++;
  if (ps.pos >= CELLS) {
    ps.pos = 0;
    ps.round++;
  }
}

// После ошибки — то же предложение (не больше 3 раз подряд), иначе дальше:
// от вопроса к ответу той же пары, от ответа — к новой случайной паре
function advanceTask() {
  if (!sLastCorrect && ps.attempts < MAX_ATTEMPTS) {
    ps.attempts++;
    return;
  }
  ps.attempts = 1;
  if (ps.stage === 0) {
    ps.stage = 1;
  } else {
    ps.stage = 0;
    ps.pair = nextPair();
  }
}

function nextSentence() {
  const congrats = sCongrats;
  resetSentence();
  if (congrats) renderCongrats(congrats);
  else renderSentences();
}

// ---------- поздравления ----------

function renderCongrats(level) {
  const next = nextPartAfter(part);
  renderBottombar('');
  const nextName = next ? `${next.part.id} «${next.part.title}»` : '';
  const body = document.getElementById('app-body');
  if (level === '5.0') {
    body.innerHTML = `
      <div class="done-screen congrats" id="congrats">
        <div class="big">&#127942;</div>
        <h2>Поздравляем, урок пройден!</h2>
        <p>Рейтинг 5.0 — 100 верных ответов подряд.</p>
        <button class="restart-btn" id="keep-going">Продолжить</button>
        ${next ? `<button class="restart-btn secondary" id="go-next">Перейти к уроку ${next.part.id}</button>` : ''}
      </div>
    `;
  } else {
    body.innerHTML = `
      <div class="done-screen congrats" id="congrats">
        <div class="big">&#127881;</div>
        <h2>${next ? 'Поздравляем, вам доступен следующий урок!' : 'Поздравляем, вы набрали 4.5!'}</h2>
        <p>${next
          ? `Урок ${nextName} открыт. Перейти к следующему или довести этот урок до совершенства?`
          : 'Следующий урок скоро появится. Можно довести этот урок до совершенства — 5.0.'}</p>
        ${next ? `<button class="restart-btn" id="go-next">Перейти к уроку ${next.part.id}</button>` : ''}
        <button class="restart-btn ${next ? 'secondary' : ''}" id="keep-going">Продолжить</button>
      </div>
    `;
  }
  document.getElementById('keep-going').addEventListener('click', renderSentences);
  const go = document.getElementById('go-next');
  if (go) go.addEventListener('click', () => openNextPart(next));
}
