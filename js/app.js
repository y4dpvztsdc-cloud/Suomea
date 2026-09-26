let words = [];
let queue = [];
let idx = 0;
let answered = false;
let correctTotal = 0; // выполненные задания: засчитываются только верные ответы
let mistakes = 0;
// wordProgress[i] = true/false по каждому заданию слова в порядке появления (максимум 3).
// false (красный крестик) меняется на true (синяя галочка), когда задание пройдено при повторе.
let wordProgress = [];
let currentView = 'train'; // 'train' | 'sentences' | 'list'

const REPS_PER_WORD = 3;
const RETRY_GAP = 3; // через сколько заданий вернётся задание после ошибки

function totalReps() {
  return words.length * REPS_PER_WORD;
}

function progressPct() {
  return Math.round((correctTotal / totalReps()) * 100);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQueue() {
  let reps = [];
  words.forEach((w, i) => {
    reps.push({ word: i, dir: 'ru-fi' });
    reps.push({ word: i, dir: 'ru-fi' });
    reps.push({ word: i, dir: 'fi-ru' });
  });
  reps = shuffle(reps);
  // avoid the same word appearing twice in a row
  for (let i = 1; i < reps.length; i++) {
    if (reps[i].word === reps[i - 1].word) {
      for (let j = i + 1; j < reps.length; j++) {
        if (reps[j].word !== reps[i - 1].word && reps[j].word !== reps[i].word) {
          [reps[i], reps[j]] = [reps[j], reps[i]];
          break;
        }
      }
    }
  }
  return reps;
}

function pickOptionPool(direction, correctIndex) {
  const correctGroup = words[correctIndex].group;
  const sameGroup = words
    .map((_, i) => i)
    .filter(i => i !== correctIndex && words[i].group === correctGroup);
  let distractors = shuffle(sameGroup).slice(0, 3);
  if (distractors.length < 3) {
    const rest = words
      .map((_, i) => i)
      .filter(i => i !== correctIndex && !distractors.includes(i));
    const filler = shuffle(rest).slice(0, 3 - distractors.length);
    distractors = distractors.concat(filler);
  }
  const all = shuffle([correctIndex, ...distractors]);
  return all.map(i => ({
    index: i,
    label: direction === 'ru-fi' ? words[i].fi : words[i].ru
  }));
}

// Выбранный финский голос; null — пока не найден
let finnishVoice = null;
const VOICE_WAIT_MS = 3000;

function isFinnish(voice) {
  return /^fi([-_]|$)/i.test(voice.lang);
}

// Satu (улучшенный/премиум) > Satu > любой финский голос
function voiceScore(voice) {
  const id = `${voice.name} ${voice.voiceURI}`;
  let score = 0;
  if (/satu/i.test(id)) score += 10;
  if (/premium/i.test(id)) score += 3;
  else if (/enhanced|улучш|расшир/i.test(id)) score += 2;
  if (/compact/i.test(id)) score -= 1;
  return score;
}

function pickFinnishVoice(voices) {
  const finnish = voices.filter(isFinnish);
  if (finnish.length === 0) return null;
  return finnish.reduce((best, v) => (voiceScore(v) > voiceScore(best) ? v : best));
}

function setVoiceWarning(visible) {
  document.getElementById('voice-warning').hidden = !visible;
}

// Список голосов в браузере приходит с задержкой, поэтому ждём voiceschanged.
// Если за VOICE_WAIT_MS финский голос так и не появился — показываем предупреждение.
function initVoice() {
  if (!window.speechSynthesis) {
    setVoiceWarning(true);
    return;
  }
  const update = () => {
    finnishVoice = pickFinnishVoice(window.speechSynthesis.getVoices());
    if (finnishVoice) setVoiceWarning(false);
    return finnishVoice;
  };
  window.speechSynthesis.addEventListener('voiceschanged', update);
  if (!update()) {
    setTimeout(() => { if (!update()) setVoiceWarning(true); }, VOICE_WAIT_MS);
  }
}

function speakFinnish(text, rate) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = finnishVoice ? finnishVoice.lang : 'fi-FI';
  if (finnishVoice) u.voice = finnishVoice;
  u.rate = rate || 0.9;
  window.speechSynthesis.speak(u);
}

function renderSlots(wordIndex) {
  const progress = wordProgress[wordIndex];
  let slots = '';
  for (let i = 0; i < REPS_PER_WORD; i++) {
    if (i < progress.length) {
      slots += `<div class="slot ${progress[i] ? 'correct' : 'wrong'}">${progress[i] ? '&#10003;' : '&#10005;'}</div>`;
    } else {
      slots += `<div class="slot"></div>`;
    }
  }
  return slots;
}

function renderTracker(wordIndex) {
  return `
    <div class="word-tracker">
      <div class="tracker-slots">${renderSlots(wordIndex)}</div>
    </div>
  `;
}

// Возвращает задание в очередь через несколько шагов, не ставя его рядом с тем же словом
function requeue(rep) {
  for (let p = Math.min(idx + RETRY_GAP, queue.length); p <= queue.length; p++) {
    const before = queue[p - 1];
    const after = queue[p];
    if ((!before || before.word !== rep.word) && (!after || after.word !== rep.word)) {
      queue.splice(p, 0, rep);
      return;
    }
  }
  queue.push(rep);
}

function renderProgress() {
  const pct = progressPct();
  document.querySelector('.progress-pct').textContent = `${pct}%`;
  document.querySelector('.progress-fill').style.width = `${pct}%`;
}

function renderTrain() {
  if (idx >= queue.length) {
    document.getElementById('header-title').textContent = 'Новые слова';
    const pct = Math.round((correctTotal / (correctTotal + mistakes)) * 100);
    document.getElementById('app-body').innerHTML = `
      <div class="done-screen">
        <div class="big">&#127942;</div>
        <h2>Урок пройден</h2>
        <p>Точность: ${pct}% (ошибок: ${mistakes})</p>
        <button class="restart-btn" id="to-sentences">Дальше: предложения</button>
        <button class="restart-btn secondary" onclick="restart()">Повторить слова</button>
      </div>
    `;
    document.getElementById('to-sentences').addEventListener('click', () => showView('sentences'));
    return;
  }

  const rep = queue[idx];
  const word = words[rep.word];
  answered = false;

  const promptText = rep.dir === 'ru-fi' ? word.ru : word.fi;
  const options = pickOptionPool(rep.dir, rep.word);
  const overallPct = progressPct();

  document.getElementById('header-title').textContent = 'Новые слова';
  document.getElementById('app-body').innerHTML = `
    <div class="content">
      ${renderTracker(rep.word)}
      <div class="word-stage">
        <div class="word-fi">${promptText}</div>
      </div>
      <div class="options" id="options-grid">
        ${options.map(o => `<div class="option" data-i="${o.index}">${o.label}</div>`).join('')}
      </div>
      <div class="feedback" id="feedback"></div>
    </div>
    <div class="progress-row">
      <div class="progress-pct">${overallPct}%</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${overallPct}%"></div></div>
    </div>
  `;

  document.querySelectorAll('.option').forEach(el => {
    el.addEventListener('click', () => handleAnswer(el, rep));
  });
}

function handleAnswer(el, rep) {
  if (answered) return;
  answered = true;
  const chosen = parseInt(el.dataset.i, 10);
  const isCorrect = chosen === rep.word;
  const feedback = document.getElementById('feedback');
  document.querySelectorAll('.option').forEach(o => o.classList.add('disabled'));

  const progress = wordProgress[rep.word];
  if (rep.slot === undefined) {
    rep.slot = progress.length;
    progress.push(isCorrect);
  } else if (isCorrect) {
    progress[rep.slot] = true;
  }
  if (isCorrect) {
    correctTotal++;
  } else {
    mistakes++;
    requeue(rep);
  }
  document.querySelector('.tracker-slots').innerHTML = renderSlots(rep.word);
  renderProgress();

  const fiWord = words[rep.word].fi;

  if (isCorrect) {
    el.classList.add('correct');
    feedback.className = 'feedback correct-text';
    feedback.innerHTML = `Верно! <span class="fi-echo">${speakerIcon()} ${fiWord}</span>`;
  } else {
    el.classList.add('wrong');
    document.querySelector(`.option[data-i="${rep.word}"]`).classList.add('correct');
    feedback.className = 'feedback wrong-text';
    feedback.innerHTML = `Правильный вариант выделен зелёным <span class="fi-echo">${speakerIcon()} ${fiWord}</span>`;
  }

  speakFinnish(fiWord, words[rep.word].rate);

  const btn = feedback.querySelector('.speaker-btn-inline');
  if (btn) btn.addEventListener('click', () => speakFinnish(fiWord, words[rep.word].rate));

  setTimeout(() => {
    idx++;
    if (currentView === 'train') renderTrain();
  }, 1400);
}

function speakerIcon() {
  return `<button class="speaker-btn-inline"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg></button>`;
}

function restart() {
  queue = buildQueue();
  idx = 0;
  correctTotal = 0;
  mistakes = 0;
  wordProgress = words.map(() => []);
  renderTrain();
}

function renderList() {
  document.getElementById('header-title').textContent = 'Список слов';
  document.getElementById('app-body').innerHTML = `
    <div class="wordlist">
      ${words.map(w => `
        <div class="wordlist-row">
          <span class="fi">${w.fi}</span>
          <span class="ru">${w.ru}</span>
        </div>
      `).join('')}
    </div>
  `;
}

document.getElementById('voice-warning-close').addEventListener('click', () => setVoiceWarning(false));

const views = {
  train: () => renderTrain(),
  sentences: () => renderSentences(),
  list: () => renderList(),
};

function showView(name) {
  currentView = name;
  Object.keys(views).forEach(v => {
    document.getElementById(`nav-${v}`).classList.toggle('active', v === name);
  });
  views[name]();
}

Object.keys(views).forEach(v => {
  document.getElementById(`nav-${v}`).addEventListener('click', () => showView(v));
});

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(url + ': HTTP ' + response.status);
  return response.json();
}

async function init() {
  initVoice();
  try {
    const [wordData, sentences] = await Promise.all([
      loadJson('data/words.json'),
      loadJson('data/sentences.json'),
    ]);
    words = wordData;
    setSentenceData(sentences);
  } catch (error) {
    console.error(error);
    document.getElementById('app-body').innerHTML = `
      <div class="done-screen">
        <h2>Не удалось загрузить слова</h2>
        <p>Запустите проект через локальный сервер (см. README).</p>
      </div>
    `;
    return;
  }
  restart();
  startSentences();
  showView('train');
}

init();
