// Озвучка финских слов и предложений: выбор финского голоса (лучше Satu)

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
