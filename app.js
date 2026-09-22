const STORAGE_KEY = "vocab-trainer-progress-v1";
const SESSION_KEY = "vocab-trainer-sequential-session-v1";
const AUTOSPEAK_KEY = "vocab-trainer-autospeak-v1";
const REVIEW_INTERVALS = [0, 1, 2, 4, 7, 15];

let allWordsCache = null;
let lastSpokenKey = null;

const state = {
  data: null,
  selectedLessons: new Set(),
  currentMode: "sequential",
  deck: [],
  currentIndex: -1,
  showMeaning: false,
  repeatQueueKeys: new Set(),
  history: [],
  learnedCount: 0,
  sessionTotal: 0,
  currentSource: "normal",
  quizLesson: null,
  wrongOnlySelected: false,
  wrongQuery: "",
  expandedWrongKeys: new Set(),
  wrongReviewLesson: null,
  startFromKey: null,
  studyContext: null,
  autoSpeak: loadAutoSpeak(),
  progress: loadProgress(),
};

const els = {
  lessonCount: document.querySelector("#lessonCount"),
  wordCount: document.querySelector("#wordCount"),
  wrongCount: document.querySelector("#wrongCount"),
  lessonList: document.querySelector("#lessonList"),
  currentScopeTitle: document.querySelector("#currentScopeTitle"),
  scopeHint: document.querySelector("#scopeHint"),
  cardTag: document.querySelector("#cardTag"),
  cardProgress: document.querySelector("#cardProgress"),
  cardWord: document.querySelector("#cardWord"),
  cardPos: document.querySelector("#cardPos"),
  cardMeaning: document.querySelector("#cardMeaning"),
  reviewList: document.querySelector("#reviewList"),
  wrongList: document.querySelector("#wrongList"),
  startRandomBtn: document.querySelector("#startRandomBtn"),
  reviewWrongBtn: document.querySelector("#reviewWrongBtn"),
  practiceWrongBtn: document.querySelector("#practiceWrongBtn"),
  wrongOnlySelectedBtn: document.querySelector("#wrongOnlySelectedBtn"),
  clearWrongBtn: document.querySelector("#clearWrongBtn"),
  wrongSearchInput: document.querySelector("#wrongSearchInput"),
  wrongListCount: document.querySelector("#wrongListCount"),
  prevWordBtn: document.querySelector("#prevWordBtn"),
  nextWordBtn: document.querySelector("#nextWordBtn"),
  shuffleBtn: document.querySelector("#shuffleBtn"),
  clearSessionBtn: document.querySelector("#clearSessionBtn"),
  revealBtn: document.querySelector("#revealBtn"),
  knownBtn: document.querySelector("#knownBtn"),
  unknownBtn: document.querySelector("#unknownBtn"),
  toggleAllLessons: document.querySelector("#toggleAllLessons"),
  resetProgressBtn: document.querySelector("#resetProgressBtn"),
  startDueReviewBtn: document.querySelector("#startDueReviewBtn"),
  speakBtn: document.querySelector("#speakBtn"),
  autoSpeakBtn: document.querySelector("#autoSpeakBtn"),
  modeButtons: [...document.querySelectorAll("[data-mode]")],
  keyboardHint: document.querySelector(".keyboard-hint"),
  flashcard: document.querySelector("#flashcard"),
  menuBtn: document.querySelector("#menuBtn"),
  drawer: document.querySelector("#drawer"),
  drawerBackdrop: document.querySelector("#drawerBackdrop"),
  closeDrawerBtn: document.querySelector("#closeDrawerBtn"),
  navReviewBtn: document.querySelector("#navReviewBtn"),
  navWrongBtn: document.querySelector("#navWrongBtn"),
  navDrawerBtn: document.querySelector("#navDrawerBtn"),
};

init();

function init() {
  state.data = window.VOCAB_DATA;

  if (els.keyboardHint) {
    els.keyboardHint.textContent =
      "逻辑：点击卡片显示/隐藏释义；认识=移出本轮，不认识=放回队尾；错题本里点认识才会移出；上一个=撤销上次选择并重新判断；快捷键：↑/空格/回车 翻卡，← 不认识，→ 认识，P 发音";
  }

  els.cardMeaning.classList.add("hidden");
  els.cardMeaning.textContent = "点击卡片查看中文意思。";

  if (!state.data || !Array.isArray(state.data.lessons)) {
    els.cardWord.textContent = "词库加载失败";
    els.cardMeaning.textContent = "请先生成本地词库数据。";
    return;
  }

  state.data.lessons.forEach((lesson) => state.selectedLessons.add(lesson.lesson));
  migrateWrongBookFlags();
  restoreSavedSessionScopeOnStartup();
  bindEvents();
  syncModeButtons();
  syncAutoSpeakButton();
  buildDeck();
  renderAll();
}

function bindEvents() {
  els.startRandomBtn.addEventListener("click", () => {
    if (state.currentSource === "wrong" || state.currentSource === "due") {
      restoreStudyContext();
    } else {
      state.currentSource = "normal";
      state.wrongReviewLesson = null;
    }
    syncModeButtons();
    buildDeck();
    renderAll();
  });

  els.reviewWrongBtn.addEventListener("click", () => startWrongMode());
  els.practiceWrongBtn.addEventListener("click", () => startWrongMode());
  els.wrongOnlySelectedBtn.addEventListener("click", toggleWrongOnlySelected);
  els.clearWrongBtn.addEventListener("click", clearWrongBook);
  els.wrongSearchInput.addEventListener("input", () => {
    state.wrongQuery = els.wrongSearchInput.value.trim();
    renderWrongList();
  });
  els.wrongList.addEventListener("click", handleWrongListClick);
  els.prevWordBtn.addEventListener("click", goToPreviousWord);
  els.nextWordBtn.addEventListener("click", () => goToCard(state.currentIndex + 1));
  els.shuffleBtn.addEventListener("click", () => {
    buildDeck();
    renderAll();
  });
  els.clearSessionBtn.addEventListener("click", clearCurrentSessionProgress);
  els.revealBtn.addEventListener("click", revealMeaning);
  els.flashcard.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    revealMeaning();
  });
  els.knownBtn.addEventListener("click", () => markAnswer(true));
  els.unknownBtn.addEventListener("click", () => markAnswer(false));
  els.toggleAllLessons.addEventListener("click", toggleAllLessons);
  els.resetProgressBtn.addEventListener("click", resetProgress);
  els.startDueReviewBtn.addEventListener("click", startDueReviewMode);
  els.speakBtn.addEventListener("click", () => speakCurrentWord(true));
  els.autoSpeakBtn.addEventListener("click", toggleAutoSpeak);
  document.addEventListener("keydown", handleKeyboardShortcuts);

  els.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.currentMode = button.dataset.mode;
      syncModeButtons();
      buildDeck();
      renderAll();
    });
  });

  els.menuBtn?.addEventListener("click", openDrawer);
  els.closeDrawerBtn?.addEventListener("click", closeDrawer);
  els.drawerBackdrop?.addEventListener("click", closeDrawer);
  els.navDrawerBtn?.addEventListener("click", openDrawer);
  els.navReviewBtn?.addEventListener("click", () => {
    closeDrawer();
    if (getDueWords().length) {
      startDueReviewMode();
    } else {
      showToast("今天没有到期复习");
    }
  });
  els.navWrongBtn?.addEventListener("click", () => {
    closeDrawer();
    if (getWrongWords({ selectedOnly: false }).length) {
      startWrongMode();
    } else {
      showToast("错题本暂时为空");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
  });
}

function openDrawer() {
  els.drawer?.classList.add("open");
  els.drawer?.setAttribute("aria-hidden", "false");
  if (window.matchMedia("(max-width: 899px)").matches) {
    document.body.style.overflow = "hidden";
  }
}

function closeDrawer() {
  els.drawer?.classList.remove("open");
  els.drawer?.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function showToast(message) {
  let node = document.querySelector("#appToast");
  if (!node) {
    node = document.createElement("div");
    node.id = "appToast";
    node.className = "app-toast";
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => node.classList.remove("show"), 1800);
}

function loadAutoSpeak() {
  return localStorage.getItem(AUTOSPEAK_KEY) === "1";
}

function toggleAutoSpeak() {
  state.autoSpeak = !state.autoSpeak;
  localStorage.setItem(AUTOSPEAK_KEY, state.autoSpeak ? "1" : "0");
  syncAutoSpeakButton();
  if (state.autoSpeak) speakCurrentWord(true);
}

function syncAutoSpeakButton() {
  els.autoSpeakBtn.textContent = state.autoSpeak ? "自动发音：开" : "自动发音：关";
  els.autoSpeakBtn.classList.toggle("active", state.autoSpeak);
}

function speakWord(text) {
  if (!("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

function speakCurrentWord(force = false) {
  const current = state.deck[state.currentIndex];
  if (!current) return;
  const key = getWordKey(current);
  if (!force && key === lastSpokenKey) return;
  lastSpokenKey = key;
  speakWord(current.word);
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function loadSavedSessions() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "{}");
    if (!saved || Array.isArray(saved) || typeof saved !== "object") return {};

    // 兼容旧版单一断点：旧数据里有 currentWordKey，但没有 sessions 包装。
    if (saved.currentWordKey) {
      const key = getSessionKeyFromSaved(saved);
      return key ? { [key]: saved } : {};
    }

    return saved;
  } catch {
    return {};
  }
}

function saveSavedSessions(sessions) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessions));
}

function getSessionKeyFromSaved(saved) {
  if (!saved || !Array.isArray(saved.selectedLessons)) return null;
  if (saved.type === "lesson") return `lesson:${saved.quizLesson}`;
  if (saved.type === "all") return "all";
  return `selection:${saved.selectedLessons.join(",")}`;
}

function getSessionKey(scope = getCurrentSessionScope()) {
  if (!scope) return null;
  if (scope.type === "lesson") return `lesson:${scope.quizLesson}`;
  if (scope.type === "all") return "all";
  return `selection:${scope.selectedLessons.join(",")}`;
}

function loadSavedSession(scope = getCurrentSessionScope()) {
  const key = getSessionKey(scope);
  if (!key) return null;
  return loadSavedSessions()[key] || null;
}

function clearSavedSession(scope = getCurrentSessionScope()) {
  const key = getSessionKey(scope);
  if (!key) return;
  const sessions = loadSavedSessions();
  delete sessions[key];
  saveSavedSessions(sessions);
}

function restoreSavedSessionScopeOnStartup() {
  const sessions = Object.values(loadSavedSessions()).filter(
    (saved) => saved && Array.isArray(saved.selectedLessons) && saved.selectedLessons.length
  );
  if (!sessions.length) return;

  const saved = sessions.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0))[0];
  const validLessons = new Set(state.data.lessons.map((lesson) => lesson.lesson));
  const selectedLessons = saved.selectedLessons.filter((lessonNo) => validLessons.has(lessonNo));
  if (!selectedLessons.length) return;

  state.currentSource = "normal";
  state.currentMode = "sequential";
  state.selectedLessons = new Set(selectedLessons);
  state.quizLesson = saved.type === "lesson" && validLessons.has(saved.quizLesson) ? saved.quizLesson : null;
}

function getCurrentSessionScope() {
  if (state.currentSource !== "normal" || state.currentMode !== "sequential") return null;

  const selectedLessons = [...state.selectedLessons].sort((a, b) => a - b);
  if (state.quizLesson !== null) {
    return {
      type: "lesson",
      quizLesson: state.quizLesson,
      selectedLessons: [state.quizLesson],
    };
  }

  if (!selectedLessons.length) return null;
  return {
    type: selectedLessons.length === state.data.lessons.length ? "all" : "selection",
    quizLesson: null,
    selectedLessons,
  };
}

function rememberStudyContext() {
  if (state.currentSource !== "normal") return;
  saveCurrentSession();
  state.studyContext = {
    quizLesson: state.quizLesson,
    selectedLessons: [...state.selectedLessons],
    currentMode: state.currentMode,
  };
}

function restoreStudyContext() {
  const ctx = state.studyContext;
  state.currentSource = "normal";
  state.wrongReviewLesson = null;
  if (!ctx) return;
  state.quizLesson = ctx.quizLesson;
  state.selectedLessons = new Set(ctx.selectedLessons);
  state.currentMode = ctx.currentMode;
}

function saveCurrentSession() {
  if (state.currentSource !== "normal" || state.currentMode !== "sequential") return;

  const scope = getCurrentSessionScope();
  if (!scope) return;

  const key = getSessionKey(scope);
  if (!key) return;

  const current = state.deck[state.currentIndex];
  const safeSessionTotal = state.sessionTotal || state.deck.length;
  const isCompleted = !state.deck.length && safeSessionTotal > 0 && state.learnedCount >= safeSessionTotal;
  if (!current && !isCompleted) return;

  const sessions = loadSavedSessions();

  if (isCompleted) {
    sessions[key] = {
      ...scope,
      currentWordKey: null,
      currentIndex: -1,
      deckQueueKeys: [],
      learnedCount: safeSessionTotal,
      sessionTotal: safeSessionTotal,
      completed: true,
      savedAt: new Date().toISOString(),
    };
    saveSavedSessions(sessions);
    return;
  }

  const deckQueueKeys = state.deck.map(getWordKey);
  const remainingUniqueCount = new Set(deckQueueKeys).size;
  const safeLearnedCount = Math.max(0, safeSessionTotal - remainingUniqueCount);

  sessions[key] = {
    ...scope,
    currentWordKey: getWordKey(current),
    currentIndex: state.currentIndex,
    deckQueueKeys,
    learnedCount: safeLearnedCount,
    sessionTotal: safeSessionTotal,
    completed: false,
    savedAt: new Date().toISOString(),
  };
  saveSavedSessions(sessions);
}

function sameLessonSet(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

function isSavedSessionCompleted(saved) {
  if (!saved) return false;
  if (saved.completed) return true;
  const savedTotal = Number(saved.sessionTotal) || 0;
  return Array.isArray(saved.deckQueueKeys) && saved.deckQueueKeys.length === 0 && savedTotal > 0;
}

function restoreSavedSessionIfPossible() {
  const saved = loadSavedSession();
  if (!saved || state.currentSource !== "normal" || state.currentMode !== "sequential") {
    return false;
  }

  const scope = getCurrentSessionScope();
  if (!scope) return false;
  if (saved.type !== scope.type) return false;
  if ((saved.quizLesson ?? null) !== (scope.quizLesson ?? null)) return false;
  if (!sameLessonSet(saved.selectedLessons || [], scope.selectedLessons || [])) return false;

  if (isSavedSessionCompleted(saved)) {
    const savedTotal = Number(saved.sessionTotal) || Number(saved.learnedCount) || 0;
    state.deck = [];
    state.currentIndex = -1;
    state.showMeaning = false;
    state.repeatQueueKeys = new Set();
    state.history = [];
    state.sessionTotal = savedTotal;
    state.learnedCount = Math.max(savedTotal, Number(saved.learnedCount) || 0);
    return true;
  }

  if (!state.deck.length) return false;

  const restoredIndex = state.deck.findIndex((word) => getWordKey(word) === saved.currentWordKey);
  if (restoredIndex < 0) return false;

  if (Array.isArray(saved.deckQueueKeys) && saved.deckQueueKeys.length) {
    const wordsByKey = new Map(state.deck.map((word) => [getWordKey(word), word]));
    const restoredDeck = saved.deckQueueKeys.map((wordKey) => wordsByKey.get(wordKey)).filter(Boolean);
    if (restoredDeck.length) {
      state.deck = restoredDeck;
      state.currentIndex = Math.max(
        0,
        Math.min(state.deck.findIndex((word) => getWordKey(word) === saved.currentWordKey), state.deck.length - 1)
      );
      state.learnedCount = Math.max(0, (Number(saved.sessionTotal) || state.deck.length) - new Set(saved.deckQueueKeys).size);
      state.sessionTotal = Number(saved.sessionTotal) || state.deck.length;
      return true;
    }
  }

  state.currentIndex = restoredIndex;
  state.sessionTotal = Number(saved.sessionTotal) || state.deck.length;
  state.learnedCount = Math.max(0, state.sessionTotal - state.deck.length);
  return true;
}

function handleKeyboardShortcuts(event) {
  const tagName = document.activeElement?.tagName || "";
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || event.repeat) {
    return;
  }

  switch (event.key) {
    case "ArrowUp":
      event.preventDefault();
      revealMeaning();
      break;
    case "ArrowLeft":
      event.preventDefault();
      if (!state.showMeaning) {
        revealMeaning();
      } else {
        markAnswer(false);
      }
      break;
    case "ArrowRight":
      event.preventDefault();
      if (!state.showMeaning) {
        revealMeaning();
      } else {
        markAnswer(true);
      }
      break;
    case "ArrowDown":
    case " ":
    case "Enter":
      event.preventDefault();
      if (!state.showMeaning) {
        revealMeaning();
      } else {
        goToCard(state.currentIndex + 1);
      }
      break;
    case "p":
    case "P":
      event.preventDefault();
      speakCurrentWord(true);
      break;
    default:
      break;
  }
}

function getAllWords() {
  if (!allWordsCache) {
    allWordsCache = state.data.lessons.flatMap((lesson) =>
      lesson.words.map((word) => ({ ...word, lessonTitle: lesson.title }))
    );
  }
  return allWordsCache;
}

function getSelectedWords() {
  return getAllWords().filter((word) => state.selectedLessons.has(word.lesson));
}

function getLessonWords(lessonNo) {
  return getAllWords().filter((word) => word.lesson === lessonNo);
}

function getWordKey(word) {
  return `${word.lesson}-${word.index}-${word.word}`;
}

function ensureWordState(word) {
  const key = getWordKey(word);
  if (!state.progress[key]) {
    state.progress[key] = {
      knownCount: 0,
      wrongCount: 0,
      reviewStage: 0,
      lastSeenAt: null,
      lastWrongAt: null,
      nextReviewAt: null,
      inWrongBook: false,
      lesson: word.lesson,
      word: word.word,
      meaning: word.meaning,
      partOfSpeech: word.part_of_speech,
    };
  }
  return state.progress[key];
}

function migrateWrongBookFlags() {
  let changed = false;
  Object.values(state.progress).forEach((item) => {
    if (!item || typeof item !== "object") return;
    if (typeof item.inWrongBook !== "boolean") {
      item.inWrongBook = Number(item.wrongCount || 0) > Number(item.knownCount || 0);
      changed = true;
    }
    if (item.inWrongBook && !item.lastWrongAt) {
      item.lastWrongAt = item.lastSeenAt || null;
      changed = true;
    }
  });
  if (changed) saveProgress();
}

function isInWrongBook(itemState) {
  if (!itemState) return false;
  if (typeof itemState.inWrongBook === "boolean") return itemState.inWrongBook;
  return Number(itemState.wrongCount || 0) > Number(itemState.knownCount || 0);
}

function buildDeck() {
  const sourceWords =
    state.currentSource === "wrong"
      ? getWrongWords({ lesson: state.wrongReviewLesson })
      : state.currentSource === "due"
        ? getDueWords().map((item) => item.word)
        : state.quizLesson !== null
          ? getLessonWords(state.quizLesson)
          : getSelectedWords();

  state.deck = [...sourceWords];

  if (state.currentMode === "random") {
    shuffle(state.deck);
  } else if (state.currentSource === "wrong") {
    state.deck.sort(compareWrongWords);
  } else {
    state.deck.sort((a, b) => a.lesson - b.lesson || a.index - b.index);
  }

  if (state.startFromKey) {
    const startIndex = state.deck.findIndex((word) => getWordKey(word) === state.startFromKey);
    if (startIndex > 0) {
      const [startWord] = state.deck.splice(startIndex, 1);
      state.deck.unshift(startWord);
    }
    state.startFromKey = null;
  }

  state.currentIndex = state.deck.length ? 0 : -1;
  state.showMeaning = false;
  state.repeatQueueKeys = new Set();
  state.history = [];
  state.learnedCount = 0;
  state.sessionTotal = state.deck.length;
  restoreSavedSessionIfPossible();
  saveCurrentSession();
}

function revealMeaning() {
  if (state.currentIndex < 0) return;
  state.showMeaning = !state.showMeaning;
  renderCard();
}

function goToCard(index) {
  if (!state.deck.length) {
    state.currentIndex = -1;
    state.showMeaning = false;
    renderCard();
    return;
  }

  if (index < 0) index = 0;
  if (index >= state.deck.length) index = state.deck.length - 1;
  state.currentIndex = index;
  state.showMeaning = false;
  saveCurrentSession();
  renderCard();
}

function goToPreviousWord() {
  const last = state.history.pop();
  if (!last) {
    goToCard(state.currentIndex - 1);
    return;
  }

  const previousKey = getWordKey(last.word);
  state.deck = state.deck.filter((word) => getWordKey(word) !== previousKey);

  const insertIndex = Math.max(0, Math.min(last.index, state.deck.length));
  state.deck.splice(insertIndex, 0, last.word);
  state.currentIndex = insertIndex;
  state.showMeaning = true;
  state.learnedCount = last.learnedCount;

  if (last.previousWordState) {
    state.progress[previousKey] = { ...last.previousWordState };
  }

  if (last.repeatQueueHadKey) {
    state.repeatQueueKeys.add(previousKey);
  } else {
    state.repeatQueueKeys.delete(previousKey);
  }

  saveProgress();
  saveCurrentSession();
  refreshDashboard();
  renderCard();
}

function markAnswer(isKnown) {
  const current = state.deck[state.currentIndex];
  if (!current) return;
  if (!state.showMeaning) {
    revealMeaning();
    return;
  }

  const currentKey = getWordKey(current);
  const itemState = ensureWordState(current);
  const now = new Date();
  itemState.lastSeenAt = now.toISOString();
  state.history.push({
    word: current,
    isKnown,
    index: state.currentIndex,
    source: state.currentSource,
    repeatQueueHadKey: state.repeatQueueKeys.has(currentKey),
    previousWordState: { ...itemState },
    learnedCount: state.learnedCount,
  });

  state.deck.splice(state.currentIndex, 1);

  if (isKnown) {
    state.repeatQueueKeys.delete(currentKey);
    itemState.knownCount += 1;
    state.learnedCount += 1;
    itemState.reviewStage = Math.min(itemState.reviewStage + 1, REVIEW_INTERVALS.length - 1);
    if (state.currentSource === "wrong") {
      itemState.inWrongBook = false;
    }
  } else {
    state.repeatQueueKeys.add(currentKey);
    state.deck.push(current);
    itemState.inWrongBook = true;
    itemState.lastWrongAt = now.toISOString();
    if (state.currentSource !== "wrong") {
      itemState.wrongCount += 1;
    }
    itemState.reviewStage = 0;
  }

  const intervalDays = REVIEW_INTERVALS[itemState.reviewStage];
  const next = new Date(now);
  next.setDate(next.getDate() + intervalDays);
  itemState.nextReviewAt = next.toISOString();

  saveProgress();
  refreshDashboard();

  if (!state.deck.length) {
    state.currentIndex = -1;
  } else if (!isKnown && state.currentIndex >= state.deck.length - 1) {
    state.currentIndex = 0;
  } else if (state.currentIndex >= state.deck.length) {
    state.currentIndex = state.deck.length - 1;
  }
  state.showMeaning = false;
  saveCurrentSession();
  if (!state.deck.length && state.currentSource === "normal") {
    renderSidebar();
  }
  renderCard();
}

function startWrongMode(options = {}) {
  const { lesson = null, startFromKey = null } = options;
  rememberStudyContext();
  state.currentSource = "wrong";
  state.wrongReviewLesson = lesson;
  state.startFromKey = startFromKey;
  state.currentMode = "sequential";
  syncModeButtons();
  buildDeck();
  renderAll();
  els.flashcard?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function toggleWrongOnlySelected() {
  state.wrongOnlySelected = !state.wrongOnlySelected;
  if (state.currentSource === "wrong") {
    buildDeck();
    renderAll();
    return;
  }
  refreshDashboard();
}

function handleWrongListClick(event) {
  const actionEl = event.target.closest("[data-wrong-action]");
  if (!actionEl) return;

  const action = actionEl.dataset.wrongAction;
  const wordKey = actionEl.dataset.wordKey || "";
  const lessonNo = Number(actionEl.dataset.lesson);

  if (action === "toggle") {
    if (state.expandedWrongKeys.has(wordKey)) {
      state.expandedWrongKeys.delete(wordKey);
    } else {
      state.expandedWrongKeys.add(wordKey);
    }
    renderWrongList();
    return;
  }

  if (action === "review") {
    startWrongMode({ startFromKey: wordKey });
    return;
  }

  if (action === "review-lesson") {
    startWrongMode({ lesson: lessonNo });
    return;
  }

  if (action === "remove") {
    removeFromWrongBook(wordKey);
  }
}

function removeFromWrongBook(wordKey) {
  const itemState = state.progress[wordKey];
  if (itemState) {
    itemState.inWrongBook = false;
    saveProgress();
  }

  if (state.currentSource === "wrong") {
    const removedIndex = state.deck.findIndex((word) => getWordKey(word) === wordKey);
    if (removedIndex >= 0) {
      state.deck.splice(removedIndex, 1);
      if (!state.deck.length) {
        state.currentIndex = -1;
      } else if (removedIndex < state.currentIndex) {
        state.currentIndex -= 1;
      } else if (removedIndex === state.currentIndex) {
        if (state.currentIndex >= state.deck.length) state.currentIndex = 0;
        state.showMeaning = false;
      }
      saveCurrentSession();
    }
  }

  refreshDashboard();
  renderCard();
}

function clearWrongBook() {
  const words = getWrongWords();
  if (!words.length) return;
  const scopeText = state.wrongOnlySelected ? "当前筛选中的 " : "";
  if (!window.confirm(`把${scopeText}${words.length} 个单词移出错题本？学习进度会保留，只是不再出现在错题复习里。`)) {
    return;
  }

  words.forEach((word) => {
    const itemState = state.progress[getWordKey(word)];
    if (itemState) itemState.inWrongBook = false;
  });
  saveProgress();

  if (state.currentSource === "wrong") {
    buildDeck();
    renderAll();
    return;
  }

  refreshDashboard();
}

function startDueReviewMode() {
  if (!getDueWords().length) return;
  rememberStudyContext();
  state.currentSource = "due";
  state.wrongReviewLesson = null;
  state.currentMode = "sequential";
  syncModeButtons();
  buildDeck();
  renderAll();
}

function startLessonQuiz(lessonNo) {
  state.selectedLessons.clear();
  state.selectedLessons.add(lessonNo);
  state.currentSource = "normal";
  state.currentMode = "sequential";
  state.quizLesson = lessonNo;
  state.wrongReviewLesson = null;
  syncModeButtons();
  buildDeck();
  renderAll();
}

function toggleAllLessons() {
  if (state.selectedLessons.size === state.data.lessons.length) {
    state.selectedLessons.clear();
  } else {
    state.data.lessons.forEach((lesson) => state.selectedLessons.add(lesson.lesson));
  }

  state.currentSource = "normal";
  state.quizLesson = null;
  state.wrongReviewLesson = null;
  buildDeck();
  renderAll();
}

function compareWrongWords(a, b) {
  const aState = state.progress[getWordKey(a)] || {};
  const bState = state.progress[getWordKey(b)] || {};
  const wrongDiff = Number(bState.wrongCount || 0) - Number(aState.wrongCount || 0);
  if (wrongDiff) return wrongDiff;
  const aTime = new Date(aState.lastWrongAt || aState.lastSeenAt || 0).getTime();
  const bTime = new Date(bState.lastWrongAt || bState.lastSeenAt || 0).getTime();
  if (bTime !== aTime) return bTime - aTime;
  return a.lesson - b.lesson || a.index - b.index;
}

function getWrongWords({ lesson = null, selectedOnly = state.wrongOnlySelected } = {}) {
  return getAllWords().filter((word) => {
    const itemState = state.progress[getWordKey(word)];
    if (!isInWrongBook(itemState)) return false;
    if (lesson != null && word.lesson !== lesson) return false;
    if (selectedOnly && !state.selectedLessons.has(word.lesson)) return false;
    return true;
  });
}

function getDueWords() {
  const now = Date.now();
  return getAllWords()
    .map((word) => ({ word, progress: state.progress[getWordKey(word)] }))
    .filter(({ progress }) => progress && progress.nextReviewAt && new Date(progress.nextReviewAt).getTime() <= now);
}

function renderAll() {
  renderSidebar();
  refreshDashboard();
  renderCard();
}

function getLessonProgressMap() {
  const map = new Map();
  state.data.lessons.forEach((lesson) => {
    map.set(lesson.lesson, { learned: 0, total: lesson.count, completed: false });
  });

  const sessions = Object.values(loadSavedSessions()).filter((saved) => saved && typeof saved === "object");
  const multiSessions = sessions
    .filter((saved) => saved.type === "all" || saved.type === "selection")
    .sort((a, b) => new Date(a.savedAt || 0) - new Date(b.savedAt || 0));
  const lessonSessions = sessions.filter((saved) => saved.type === "lesson" && saved.quizLesson != null);

  for (const saved of multiSessions) {
    if (!Array.isArray(saved.deckQueueKeys) && !saved.completed) continue;
    const remainingKeys = new Set(saved.deckQueueKeys || []);
    const selected = Array.isArray(saved.selectedLessons) ? saved.selectedLessons : [];
    for (const lessonNo of selected) {
      const current = map.get(lessonNo);
      if (!current?.total) continue;
      const remaining = getLessonWords(lessonNo).filter((word) => remainingKeys.has(getWordKey(word))).length;
      const learned = Math.max(0, current.total - remaining);
      map.set(lessonNo, {
        learned,
        total: current.total,
        completed: remaining === 0 && (saved.completed || learned >= current.total),
      });
    }
  }

  for (const saved of lessonSessions) {
    const current = map.get(saved.quizLesson);
    if (!current?.total) continue;
    if (isSavedSessionCompleted(saved)) {
      map.set(saved.quizLesson, { learned: current.total, total: current.total, completed: true });
      continue;
    }
    if (!Array.isArray(saved.deckQueueKeys)) continue;
    const remaining = new Set(saved.deckQueueKeys).size;
    const sessionTotal = Number(saved.sessionTotal) || current.total;
    const learned = Math.max(0, Math.min(current.total, sessionTotal - remaining));
    map.set(saved.quizLesson, {
      learned,
      total: current.total,
      completed: learned >= current.total,
    });
  }

  return map;
}

function renderSidebar() {
  els.lessonList.innerHTML = "";
  const progressMap = getLessonProgressMap();

  state.data.lessons.forEach((lesson) => {
    const active = state.selectedLessons.has(lesson.lesson);
    const progress = progressMap.get(lesson.lesson) || { learned: 0, total: lesson.count, completed: false };
    const item = document.createElement("div");
    item.className = `lesson-item${active ? " active" : ""}${progress.completed ? " is-complete" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = active;
    checkbox.tabIndex = -1;

    let statusText = `${lesson.count} 个单词`;
    if (progress.completed) {
      statusText = `已完成 · ${progress.total} 个单词`;
    } else if (progress.learned > 0) {
      statusText = `进度 ${progress.learned} / ${progress.total}`;
    }

    const info = document.createElement("div");
    info.innerHTML = `<strong>${escapeHtml(lesson.title)}</strong><div class="muted">${escapeHtml(statusText)}</div>`;

    const actions = document.createElement("div");
    actions.className = "lesson-item-actions";

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = `第 ${lesson.lesson} 单元`;

    const quizButton = document.createElement("button");
    quizButton.className = "mini-button";
    quizButton.textContent = progress.completed ? "已完成" : progress.learned > 0 ? "继续背词" : "开始背词";
    quizButton.addEventListener("click", (event) => {
      event.stopPropagation();
      startLessonQuiz(lesson.lesson);
    });

    item.appendChild(checkbox);
    item.appendChild(info);
    actions.appendChild(tag);
    actions.appendChild(quizButton);
    item.appendChild(actions);

    item.addEventListener("click", () => {
      if (state.selectedLessons.has(lesson.lesson)) {
        state.selectedLessons.delete(lesson.lesson);
      } else {
        state.selectedLessons.add(lesson.lesson);
      }

      state.currentSource = "normal";
      state.quizLesson = null;
      state.wrongReviewLesson = null;
      buildDeck();
      renderAll();
    });

    els.lessonList.appendChild(item);
  });
}

function refreshDashboard() {
  const selected = [...state.selectedLessons].sort((a, b) => a - b);
  const hasSelection = selected.length > 0;
  const currentLessonTitle =
    state.data.lessons.find((lesson) => lesson.lesson === state.quizLesson)?.title ||
    `Lesson ${state.quizLesson}`;

  const allWrongWords = getWrongWords({ selectedOnly: false });
  const wrongWords = getWrongWords();
  const dueWords = getDueWords();

  els.lessonCount.textContent = String(state.data.lessonCount);
  els.wordCount.textContent = String(state.data.wordCount);
  els.wrongCount.textContent = String(allWrongWords.length);

  if (state.currentSource === "wrong") {
    if (state.wrongReviewLesson != null) {
      const wrongLessonTitle =
        state.data.lessons.find((lesson) => lesson.lesson === state.wrongReviewLesson)?.title ||
        `Lesson ${state.wrongReviewLesson}`;
      els.currentScopeTitle.textContent = `${wrongLessonTitle} 错题复习`;
    } else if (state.wrongOnlySelected) {
      els.currentScopeTitle.textContent = "错题本复习（已选单元）";
    } else {
      els.currentScopeTitle.textContent = "错题本复习";
    }
    els.scopeHint.textContent = "不认识会放回队尾继续循环；点「认识」才移出错题本。列表里默认不显示释义，避免先剧透。";
  } else if (state.currentSource === "due") {
    els.currentScopeTitle.textContent = "到期复习";
    els.scopeHint.textContent = "正在复习今天到期的单词，答对会自动推迟下一次复习时间。";
  } else if (state.quizLesson !== null) {
    els.currentScopeTitle.textContent = `${currentLessonTitle} 背词中`;
    els.scopeHint.textContent = "先看英文，显示释义后再判断是否认识。";
  } else if (selected.length === state.data.lessons.length) {
    els.currentScopeTitle.textContent = "全部单元";
    els.scopeHint.textContent = "当前包含全部单元，推荐按顺序背；想打乱顺序时再切到随机模式。";
  } else if (hasSelection) {
    els.currentScopeTitle.textContent = `已选单元：${selected.join("、")}`;
    els.scopeHint.textContent = `当前已选择 ${selected.length} 个单元，推荐按顺序背；想打乱顺序时再切到随机模式。`;
  } else {
    els.currentScopeTitle.textContent = "未选择单元";
    els.scopeHint.textContent = "请先在左侧选择至少一个单元，再开始背词。";
  }

  els.toggleAllLessons.textContent =
    state.selectedLessons.size === state.data.lessons.length ? "清空选择" : "全选单元";
  els.startRandomBtn.disabled = state.currentSource === "normal" && state.quizLesson === null && !hasSelection;
  if (state.currentSource === "wrong") {
    els.startRandomBtn.textContent = "退出错题本";
  } else if (state.currentSource === "due") {
    els.startRandomBtn.textContent = "退出复习";
  } else {
    els.startRandomBtn.textContent = "开始背词";
  }

  els.startDueReviewBtn.disabled = !dueWords.length;
  els.startDueReviewBtn.textContent = dueWords.length ? `开始复习 (${dueWords.length})` : "开始复习";
  els.practiceWrongBtn.disabled = !wrongWords.length;
  els.reviewWrongBtn.disabled = !wrongWords.length;
  els.clearWrongBtn.disabled = !wrongWords.length;
  els.wrongOnlySelectedBtn.classList.toggle("active", state.wrongOnlySelected);
  els.wrongOnlySelectedBtn.textContent = state.wrongOnlySelected ? "仅已选单元：开" : "仅已选单元";

  renderReviewList(dueWords);
  renderWrongList();
}

function renderCard() {
  const current = state.deck[state.currentIndex];

  if (!current) {
    els.cardTag.textContent =
      state.currentSource === "wrong" ? "错题模式" : state.currentSource === "due" ? "复习模式" : "准备开始";
    const finishedGroup = state.sessionTotal && state.learnedCount >= state.sessionTotal;
    els.cardProgress.textContent = finishedGroup ? `${state.learnedCount} / ${state.sessionTotal}` : "0 / 0";

    if (finishedGroup) {
      els.cardWord.textContent = "本组已完成！";
    } else if (state.currentSource === "wrong") {
      els.cardWord.textContent = state.wrongOnlySelected ? "当前单元没有错词" : "错题本暂时为空";
    } else if (state.currentSource === "due") {
      els.cardWord.textContent = "今天没有到期复习";
    } else if (state.selectedLessons.size) {
      els.cardWord.textContent = "当前没有可背单词";
    } else {
      els.cardWord.textContent = "请先选择单元";
    }

    els.cardPos.textContent = "";
    els.cardMeaning.textContent = "点击卡片查看中文意思。";
    els.cardMeaning.classList.add("hidden");
    els.knownBtn.disabled = true;
    els.unknownBtn.disabled = true;
    els.revealBtn.disabled = true;
    els.speakBtn.disabled = true;
    els.knownBtn.style.opacity = "0.55";
    els.unknownBtn.style.opacity = "0.55";
    els.revealBtn.style.opacity = "0.55";
    els.revealBtn.textContent = "显示释义";
    return;
  }

  const modeText =
    state.currentSource === "wrong"
      ? "错题复习"
      : state.currentSource === "due"
        ? "到期复习"
        : state.quizLesson !== null
          ? "单元背词"
          : state.currentMode === "sequential"
            ? "顺序学习"
            : "随机学习";

  els.cardTag.textContent = `${current.lessonTitle} · ${modeText}`;
  els.cardProgress.textContent = `${state.learnedCount} / ${state.sessionTotal || state.deck.length}`;
  els.cardWord.textContent = current.word;
  els.cardPos.textContent = current.part_of_speech || "未标注词性";
  els.cardMeaning.textContent = current.meaning || "未提取到释义";
  els.cardMeaning.classList.toggle("hidden", !state.showMeaning);
  els.knownBtn.disabled = !state.showMeaning;
  els.unknownBtn.disabled = !state.showMeaning;
  els.revealBtn.disabled = false;
  els.speakBtn.disabled = false;
  els.knownBtn.style.opacity = state.showMeaning ? "1" : "0.55";
  els.unknownBtn.style.opacity = state.showMeaning ? "1" : "0.55";
  els.revealBtn.style.opacity = "1";
  els.revealBtn.textContent = state.showMeaning ? "隐藏释义" : "显示释义";

  if (state.autoSpeak) speakCurrentWord();
}

function renderReviewList(allDueWords = getDueWords()) {
  const dueWords = allDueWords.slice(0, 20);
  if (!dueWords.length) {
    els.reviewList.innerHTML = `
      <div class="review-card">
        <strong>今天没有到期复习</strong>
        <div class="review-meta">继续背新词，或者回到错题本巩固。</div>
      </div>
    `;
    return;
  }

  els.reviewList.innerHTML = dueWords
    .map(
      ({ word, progress }) => `
        <div class="review-card">
          <strong>${escapeHtml(word.word)}</strong>
          <div class="review-meta">${escapeHtml(word.lessonTitle)} · 复习阶段 ${progress.reviewStage + 1}</div>
          <div class="review-meta">${escapeHtml(word.meaning)}</div>
        </div>
      `
    )
    .join("");
}

function renderWrongList() {
  const allCount = getWrongWords({ selectedOnly: false }).length;
  const scopedWords = getWrongWords();
  const query = state.wrongQuery.toLowerCase();
  const words = scopedWords
    .filter((word) => {
      if (!query) return true;
      return [word.word, word.meaning, word.lessonTitle, `lesson ${word.lesson}`]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort(compareWrongWords);

  if (els.wrongListCount) {
    els.wrongListCount.textContent = scopedWords.length ? `(${scopedWords.length})` : "";
  }

  if (!allCount) {
    els.wrongList.innerHTML = `
      <div class="wrong-card">
        <strong>错题本暂时为空</strong>
        <div class="wrong-meta">背词时点「不认识」，单词会进入这里。复习时不认识继续循环，点「认识」才移出。</div>
      </div>
    `;
    return;
  }

  if (!scopedWords.length) {
    els.wrongList.innerHTML = `
      <div class="wrong-card">
        <strong>当前单元没有错词</strong>
        <div class="wrong-meta">关掉「仅已选单元」，或换几个左侧单元后再看。</div>
      </div>
    `;
    return;
  }

  if (!words.length) {
    els.wrongList.innerHTML = `
      <div class="wrong-card">
        <strong>没有匹配的错词</strong>
        <div class="wrong-meta">试试别的单词、释义或单元名。</div>
      </div>
    `;
    return;
  }

  const groups = new Map();
  words.forEach((word) => {
    if (!groups.has(word.lesson)) groups.set(word.lesson, []);
    groups.get(word.lesson).push(word);
  });

  els.wrongList.innerHTML = [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lessonNo, lessonWords]) => {
      const title = lessonWords[0]?.lessonTitle || `Lesson ${lessonNo}`;
      const cards = lessonWords
        .map((word) => {
          const key = getWordKey(word);
          const itemState = state.progress[key] || {};
          const expanded = state.expandedWrongKeys.has(key);
          const lastWrong = formatRelativeTime(itemState.lastWrongAt || itemState.lastSeenAt);
          return `
            <div class="wrong-card">
              <div class="wrong-card-head">
                <strong>${escapeHtml(word.word)}</strong>
                <div class="wrong-card-actions">
                  <button type="button" class="mini-button" data-wrong-action="toggle" data-word-key="${escapeHtml(key)}">${expanded ? "收起" : "释义"}</button>
                  <button type="button" class="mini-button" data-wrong-action="review" data-word-key="${escapeHtml(key)}">复习</button>
                  <button type="button" class="mini-button danger-mini" data-wrong-action="remove" data-word-key="${escapeHtml(key)}">移出</button>
                </div>
              </div>
              <div class="wrong-meta">${escapeHtml(word.part_of_speech || "未标注词性")} · 答错 ${itemState.wrongCount || 0} 次 · ${escapeHtml(lastWrong)}</div>
              <div class="wrong-meta wrong-meaning${expanded ? "" : " is-collapsed"}">${escapeHtml(word.meaning)}</div>
            </div>
          `;
        })
        .join("");

      return `
        <div class="wrong-group">
          <div class="wrong-group-title">
            <span>${escapeHtml(title)} · ${lessonWords.length} 个</span>
            <button type="button" class="mini-button" data-wrong-action="review-lesson" data-lesson="${lessonNo}">复习本单元</button>
          </div>
          ${cards}
        </div>
      `;
    })
    .join("");
}

function clearCurrentSessionProgress() {
  clearSavedSession();
  buildDeck();
  renderAll();
}

function resetProgress() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SESSION_KEY);
  state.progress = {};
  buildDeck();
  renderAll();
}

function syncModeButtons() {
  els.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.currentMode);
  });
}

function formatRelativeTime(iso) {
  if (!iso) return "尚未记录时间";
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return "尚未记录时间";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
  );
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}
