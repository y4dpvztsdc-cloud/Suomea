(function () {
  "use strict";

  const state = {
    words: [],
    filtered: [],
    index: 0,
  };

  const el = {
    card: document.getElementById("card"),
    word: document.getElementById("word"),
    translation: document.getElementById("translation"),
    example: document.getElementById("example"),
    category: document.getElementById("category"),
    prev: document.getElementById("prev"),
    next: document.getElementById("next"),
    shuffle: document.getElementById("shuffle"),
    progress: document.getElementById("progress"),
  };

  async function loadWords() {
    const response = await fetch("data/words.json");
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }
    return response.json();
  }

  function fillCategories(words) {
    const categories = [...new Set(words.map((w) => w.category))];
    for (const category of categories) {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      el.category.appendChild(option);
    }
  }

  function applyFilter() {
    const value = el.category.value;
    state.filtered =
      value === "all"
        ? state.words.slice()
        : state.words.filter((w) => w.category === value);
    state.index = 0;
    render();
  }

  function render() {
    el.card.classList.remove("flipped");

    if (state.filtered.length === 0) {
      el.word.textContent = "Нет слов";
      el.translation.textContent = "";
      el.example.textContent = "";
      el.progress.textContent = "";
      return;
    }

    const item = state.filtered[state.index];
    el.word.textContent = item.fi;
    el.translation.textContent = item.ru;
    el.example.textContent = item.example || "";
    el.progress.textContent =
      state.index + 1 + " / " + state.filtered.length;
  }

  function step(delta) {
    const total = state.filtered.length;
    if (total === 0) return;
    state.index = (state.index + delta + total) % total;
    render();
  }

  function shuffle() {
    const arr = state.filtered;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    state.index = 0;
    render();
  }

  function flip() {
    if (state.filtered.length > 0) {
      el.card.classList.toggle("flipped");
    }
  }

  function bindEvents() {
    el.card.addEventListener("click", flip);
    el.prev.addEventListener("click", () => step(-1));
    el.next.addEventListener("click", () => step(1));
    el.shuffle.addEventListener("click", shuffle);
    el.category.addEventListener("change", applyFilter);

    document.addEventListener("keydown", (event) => {
      if (event.target === el.category) return;
      if (event.key === "ArrowLeft") step(-1);
      else if (event.key === "ArrowRight") step(1);
      else if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        flip();
      }
    });
  }

  async function init() {
    bindEvents();
    try {
      state.words = await loadWords();
      fillCategories(state.words);
      applyFilter();
    } catch (error) {
      el.word.textContent = "Не удалось загрузить слова";
      el.progress.textContent =
        "Запустите проект через локальный сервер (см. README).";
      console.error(error);
    }
  }

  init();
})();
