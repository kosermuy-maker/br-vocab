const STORAGE_KEY = "vocab-trainer-progress-v1";
// v2：按「单元组合」整组存队列（换个勾选组合进度就“消失”），只读用于迁移
const LEGACY_SESSION_KEY = "vocab-trainer-session-v2";
// v3：「已背」按单元按单词存，任何组合/模式共享；队列只记录顺序和当前位置
const LEARNED_KEY = "vocab-trainer-learned-v3";
const QUEUE_KEY = "vocab-trainer-queue-v3";
const LAST_SCOPE_KEY = "vocab-trainer-last-scope-v3";
const MAX_SAVED_QUEUES = 12;
const LIBRARY_KEY = "vocab-trainer-library-v1";
// 考研词汇模块的选择偏好（当前书 + 核心词勾选的 Unit），与巴朗/作文完全独立
const KAOYAN_PREFS_KEY = "vocab-trainer-kaoyan-prefs-v1";
const LIBRARIES = ["barron", "essay", "kaoyan"];
const AUTOSPEAK_KEY = "vocab-trainer-autospeak-v1";
const REVIEW_INTERVALS = [0, 1, 2, 4, 7, 15];

let allWordsCache = null;
let lessonIndexCache = null; // lesson -> words[]，由 getLessonWords 惰性构建
let lastSpokenKey = null;

const state = {
  data: null,
  selectedLessons: new Set(),
  currentMode: "sequential",
  libraryMode: "barron",
  essaySubMode: "spell",
  kaoyanBook: "core", // core = 核心词 Unit 1–15；freq = 真题高频200词
  selectedKaoyanUnits: new Set(), // 核心词勾选的 lesson id（"core-1"…）
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
  learned: new Map(), // lesson(string) -> Set<wordKey>
  spellFeedback: "",
  spellRevealedAnswer: false,
  spellShowAnswer: false,
  spellPendingAdvance: null, // { isKnown: boolean } 提交后等用户点「下一个」
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
  tapHint: document.querySelector("#tapHint"),
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
  libraryButtons: [...document.querySelectorAll("[data-library]")],
  essaySubModeRow: document.querySelector("#essaySubModeRow"),
  essaySubButtons: [...document.querySelectorAll("[data-essay-sub]")],
  kaoyanBookRow: document.querySelector("#kaoyanBookRow"),
  kaoyanBookButtons: [...document.querySelectorAll("[data-kaoyan-book]")],
  spellPanel: document.querySelector("#spellPanel"),
  spellInput: document.querySelector("#spellInput"),
  spellCheckBtn: document.querySelector("#spellCheckBtn"),
  spellHintBtn: document.querySelector("#spellHintBtn"),
  spellFeedback: document.querySelector("#spellFeedback"),
  spellHint: document.querySelector("#spellHint"),
  wordZoneLabel: document.querySelector("#wordZoneLabel"),
  meaningZoneLabel: document.querySelector("#meaningZoneLabel"),
  lessonPanelTitle: document.querySelector("#lessonPanelTitle"),
};

init();

function init() {
  state.data = window.VOCAB_DATA;
  state.libraryMode = loadLibraryMode();
  state.essaySubMode = "spell";

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
  setupKaoyanData();
  migrateWrongBookFlags();
  state.learned = loadLearned() ?? migrateLegacySessions();
  restoreSavedSessionScopeOnStartup();
  // 请求持久化存储，降低 iOS/Safari 长期不用时清掉 localStorage 的概率
  navigator.storage?.persist?.().catch(() => {});
  bindEvents();
  syncLibraryButtons();
  syncEssaySubButtons();
  syncKaoyanBookButtons();
  syncModeButtons();
  syncAutoSpeakButton();
  syncLibraryUi();
  buildDeck();
  renderAll();
}

// ---------- 考研词汇模块（核心词 Unit 1–15 + 真题高频200词） ----------

function setupKaoyanData() {
  const kaoyan = window.KAOYAN_DATA;
  state.data.kaoyan = kaoyan && Array.isArray(kaoyan.lessons) ? kaoyan : null;
  if (!state.data.kaoyan) {
    // 数据文件没加载到（旧缓存/离线），隐藏入口，其余词库照常可用
    els.libraryButtons.find((button) => button.dataset.library === "kaoyan")?.classList.add("hidden-panel");
    if (state.libraryMode === "kaoyan") state.libraryMode = "barron";
    return;
  }
  const prefs = readJson(KAOYAN_PREFS_KEY, {});
  state.kaoyanBook = prefs?.book === "freq" ? "freq" : "core";
  const validUnits = new Set(getKaoyanCoreLessons().map((lesson) => lesson.id));
  const units = Array.isArray(prefs?.units) ? prefs.units.filter((id) => validUnits.has(id)) : [];
  state.selectedKaoyanUnits = new Set(units.length ? units : [...validUnits]);
}

function saveKaoyanPrefs() {
  safeSetItem(
    KAOYAN_PREFS_KEY,
    JSON.stringify({ book: state.kaoyanBook, units: sortKaoyanUnits([...state.selectedKaoyanUnits]) })
  );
}

function isKaoyanMode() {
  return state.libraryMode === "kaoyan";
}

function getKaoyanLessons() {
  return state.data.kaoyan?.lessons || [];
}

function getKaoyanCoreLessons() {
  return getKaoyanLessons().filter((lesson) => lesson.book === "core");
}

function getKaoyanLesson(id) {
  return getKaoyanLessons().find((lesson) => lesson.id === id) || null;
}

function sortKaoyanUnits(ids) {
  const order = new Map(getKaoyanLessons().map((lesson, i) => [lesson.id, i]));
  return ids.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
}

function syncKaoyanBookButtons() {
  els.kaoyanBookButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.kaoyanBook === state.kaoyanBook);
  });
}

function switchKaoyanBook(next) {
  if (next === state.kaoyanBook) return;
  state.kaoyanBook = next;
  state.currentSource = "normal";
  state.quizLesson = null;
  state.wrongReviewLesson = null;
  saveKaoyanPrefs();
  syncKaoyanBookButtons();
  buildDeck();
  renderAll();
}

// 单词属于哪个词库：巴朗 lesson 是数字，作文是 "essay-*"，考研是 "core-N" / "freq"
function wordLibrary(word) {
  if (typeof word.lesson === "number") return "barron";
  return String(word.lesson).startsWith("essay-") ? "essay" : "kaoyan";
}

// 当前「已选范围」：巴朗=勾选的 Lesson；作文=当前子模式；考研=勾选的 Unit 或高频词
function isWordInSelection(word) {
  if (isEssayMode()) return word.lesson === essayLessonId();
  if (isKaoyanMode()) {
    return state.kaoyanBook === "freq" ? word.lesson === "freq" : state.selectedKaoyanUnits.has(word.lesson);
  }
  return state.selectedLessons.has(word.lesson);
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
  els.prevWordBtn.addEventListener("click", () => {
    if (state.spellPendingAdvance) {
      // 已提交待确认时，「上一个」不跳过判分，先提醒用「下一个」
      state.spellFeedback = state.spellFeedback || "请先点「下一个」继续";
      renderCard();
      return;
    }
    goToPreviousWord();
  });
  els.nextWordBtn.addEventListener("click", () => {
    if (flushSpellPending()) return;
    goToCard(state.currentIndex + 1);
  });
  els.shuffleBtn.addEventListener("click", reshuffleDeck);
  els.clearSessionBtn.addEventListener("click", clearCurrentSessionProgress);
  els.flashcard.addEventListener("click", (event) => {
    if (event.target.closest("#speakBtn")) return;
    if (event.target.closest("#spellPanel")) return;
    if (isSpellPractice()) return;
    revealMeaning();
  });
  els.knownBtn.addEventListener("click", () => markAnswer(true));
  els.unknownBtn.addEventListener("click", () => markAnswer(false));
  els.toggleAllLessons.addEventListener("click", toggleAllLessons);
  els.resetProgressBtn.addEventListener("click", resetProgress);
  els.startDueReviewBtn.addEventListener("click", startDueReviewMode);
  els.speakBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    speakCurrentWord(true);
  });
  els.autoSpeakBtn.addEventListener("click", toggleAutoSpeak);
  document.addEventListener("keydown", handleKeyboardShortcuts);

  els.libraryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const next = LIBRARIES.includes(button.dataset.library) ? button.dataset.library : "barron";
      if (next === state.libraryMode) return;
      switchLibrary(next);
    });
  });

  els.kaoyanBookButtons.forEach((button) => {
    button.addEventListener("click", () => switchKaoyanBook(button.dataset.kaoyanBook === "freq" ? "freq" : "core"));
  });

  els.essaySubButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const raw = button.dataset.essaySub;
      const next = raw === "recognize" ? "recognize" : raw === "misspell" ? "misspell" : "spell";
      if (next === state.essaySubMode) return;
      state.essaySubMode = next;
      state.currentSource = "normal";
      state.quizLesson = null;
      state.wrongReviewLesson = null;
      syncEssaySubButtons();
      syncLibraryUi();
      buildDeck();
      renderAll();
      closeDrawer();
    });
  });

  els.spellCheckBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    checkSpelling();
  });
  els.spellHintBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    revealSpellAnswer();
  });
  els.spellInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (state.spellPendingAdvance) {
        flushSpellPending();
        return;
      }
      checkSpelling();
    }
  });
  els.spellInput?.addEventListener("click", (event) => event.stopPropagation());

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
  // 拼写已判分但还没点「下一个」就切走/关闭页面时，把结果记下来，避免这一题白做
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSpellPending();
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

function loadLibraryMode() {
  const saved = localStorage.getItem(LIBRARY_KEY);
  return LIBRARIES.includes(saved) ? saved : "barron";
}

function saveLibraryMode() {
  localStorage.setItem(LIBRARY_KEY, state.libraryMode);
}

function isEssayMode() {
  return state.libraryMode === "essay";
}

function isSpellPractice() {
  // 会拼写 + 作文错词：都必须打字拼写
  return (
    isEssayMode() &&
    (state.essaySubMode === "spell" || state.essaySubMode === "misspell") &&
    state.currentSource === "normal"
  );
}

function essayLessonId(sub = state.essaySubMode) {
  if (sub === "recognize") return "essay-recognize";
  if (sub === "misspell") return "essay-misspell";
  return "essay-spell";
}

function essaySubLabel(sub = state.essaySubMode) {
  if (sub === "recognize") return "要认识";
  if (sub === "misspell") return "作文错词";
  return "会拼写";
}

function normalizeAnswer(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ");
}

function answersMatch(input, expected) {
  const a = normalizeAnswer(input);
  const b = normalizeAnswer(expected);
  if (!a || !b) return false;
  if (a === b) return true;
  return b.split(/\s*\/\s*/).map((x) => normalizeAnswer(x)).filter(Boolean).includes(a);
}

function switchLibrary(next) {
  state.libraryMode = next;
  saveLibraryMode();
  state.currentSource = "normal";
  state.quizLesson = null;
  state.wrongReviewLesson = null;
  state.spellFeedback = "";
  state.spellRevealedAnswer = false;
  state.spellShowAnswer = false;
  if (next === "essay") {
    state.essaySubMode = state.essaySubMode || "spell";
  } else if (next === "kaoyan") {
    if (!state.selectedKaoyanUnits.size) {
      getKaoyanCoreLessons().forEach((lesson) => state.selectedKaoyanUnits.add(lesson.id));
    }
  } else {
    if (!state.selectedLessons.size) {
      state.data.lessons.forEach((lesson) => state.selectedLessons.add(lesson.lesson));
    }
  }
  syncLibraryButtons();
  syncEssaySubButtons();
  syncLibraryUi();
  buildDeck();
  renderAll();
}

function syncLibraryButtons() {
  els.libraryButtons.forEach((button) => {
    const active = button.dataset.library === state.libraryMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function syncEssaySubButtons() {
  els.essaySubButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.essaySub === state.essaySubMode);
  });
}

function syncLibraryUi() {
  const essay = isEssayMode();
  const kaoyan = isKaoyanMode();
  const kaoyanFreq = kaoyan && state.kaoyanBook === "freq";
  els.essaySubModeRow?.classList.toggle("hidden-panel", !essay);
  els.kaoyanBookRow?.classList.toggle("hidden-panel", !kaoyan);
  document.body.classList.toggle("library-essay", essay);
  document.body.classList.toggle("library-kaoyan", kaoyan);
  document.body.classList.toggle("practice-spell", isSpellPractice());
  if (els.lessonPanelTitle) {
    els.lessonPanelTitle.textContent = essay ? "作文词表" : kaoyanFreq ? "真题高频200词" : kaoyan ? "核心词单元" : "单元列表";
  }
  if (els.toggleAllLessons) {
    els.toggleAllLessons.style.display = essay || kaoyanFreq ? "none" : "";
  }
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
  safeSetItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    // 空间满时先丢掉可再生的队列顺序再重试一次（旧版会话可能是迁移的唯一来源，不删）
    try {
      if (key !== QUEUE_KEY) localStorage.removeItem(QUEUE_KEY);
      localStorage.setItem(key, value);
      return true;
    } catch {
      showToast("进度保存失败：浏览器存储空间不足或被禁用");
      console.error("localStorage write failed", key, error);
      return false;
    }
  }
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

// ---------- 已背（per word，跨组合/模式共享） ----------

function loadLearned() {
  if (localStorage.getItem(LEARNED_KEY) === null) return null;
  const raw = readJson(LEARNED_KEY, {});
  const map = new Map();
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    Object.entries(raw).forEach(([lesson, keys]) => {
      if (Array.isArray(keys)) map.set(lesson, new Set(keys));
    });
  }
  return map;
}

function saveLearned() {
  const raw = {};
  state.learned.forEach((keys, lesson) => {
    if (keys.size) raw[lesson] = [...keys];
  });
  safeSetItem(LEARNED_KEY, JSON.stringify(raw));
}

function isLearned(word) {
  return state.learned.get(String(word.lesson))?.has(getWordKey(word)) || false;
}

function setLearned(word, learned) {
  const lesson = String(word.lesson);
  let keys = state.learned.get(lesson);
  if (learned) {
    if (!keys) state.learned.set(lesson, (keys = new Set()));
    keys.add(getWordKey(word));
  } else {
    keys?.delete(getWordKey(word));
  }
}

// 旧版 v2：每个组合存剩余队列。不在队列里的词 = 已背。取并集，任何一个会话背过都算背过。
function migrateLegacySessions() {
  const learned = new Map();
  const sessions = readJson(LEGACY_SESSION_KEY, {});
  const list =
    sessions && typeof sessions === "object" && !Array.isArray(sessions)
      ? sessions.currentWordKey
        ? [sessions]
        : Object.values(sessions)
      : [];

  const lessonIds = new Set([
    ...state.data.lessons.map((lesson) => lesson.lesson),
    "essay-spell",
    "essay-recognize",
    "essay-misspell",
  ]);
  const queues = {};

  list.forEach((saved) => {
    if (!saved || !Array.isArray(saved.selectedLessons)) return;
    const hasQueue = Array.isArray(saved.deckQueueKeys);
    if (!hasQueue && !saved.completed) return;
    const remaining = new Set(saved.deckQueueKeys || []);
    const scopeWords = saved.selectedLessons
      .filter((lessonNo) => lessonIds.has(lessonNo))
      .flatMap((lessonNo) => getLessonWords(lessonNo));
    // 保存之后词库新加的词（老版本会追加到末尾）不能算已背
    const unseen = scopeWords.filter((word) => !remaining.has(getWordKey(word)));
    const total = Number(saved.sessionTotal) || 0;
    const extra = total ? Math.max(0, scopeWords.length - total) : 0;
    const learnedWords = saved.completed && !extra ? scopeWords : unseen.slice(0, unseen.length - extra);
    learnedWords.forEach((word) => {
      const lesson = String(word.lesson);
      if (!learned.has(lesson)) learned.set(lesson, new Set());
      learned.get(lesson).add(getWordKey(word));
    });

    const key = getSessionKeyFromSaved(saved);
    if (key && hasQueue && saved.deckQueueKeys.length) {
      queues[key] = {
        queueKeys: saved.deckQueueKeys,
        currentWordKey: saved.currentWordKey || null,
        savedAt: saved.savedAt || new Date(0).toISOString(),
      };
    }
  });

  state.learned = learned;
  saveLearned();
  saveQueues(queues);
  const latest = list
    .filter((saved) => saved && Array.isArray(saved.selectedLessons))
    .sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0))[0];
  if (latest) safeSetItem(LAST_SCOPE_KEY, JSON.stringify(latest));
  return learned;
}

// ---------- 队列顺序 / 当前位置（per 组合 + 模式，只是“书签”） ----------

function loadQueues() {
  const raw = readJson(QUEUE_KEY, {});
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function saveQueues(queues) {
  const entries = Object.entries(queues)
    .sort((a, b) => new Date(b[1]?.savedAt || 0) - new Date(a[1]?.savedAt || 0))
    .slice(0, MAX_SAVED_QUEUES);
  safeSetItem(QUEUE_KEY, JSON.stringify(Object.fromEntries(entries)));
}

function getSessionKeyFromSaved(saved) {
  if (!saved || !Array.isArray(saved.selectedLessons)) return null;
  const library = LIBRARIES.includes(saved.libraryMode) ? saved.libraryMode : "barron";
  const essaySub =
    saved.essaySubMode === "recognize"
      ? "recognize"
      : saved.essaySubMode === "misspell"
        ? "misspell"
        : "spell";
  const mode = saved.mode === "random" ? "random" : "sequential";
  let base;
  if (saved.type === "lesson") base = `lesson:${saved.quizLesson}`;
  else if (saved.type === "all") base = "all";
  else base = `selection:${saved.selectedLessons.join(",")}`;
  if (library === "essay") return `essay:${essaySub}|${base}@${mode}`;
  if (library === "kaoyan") return `kaoyan|${base}@${mode}`;
  return `barron|${base}@${mode}`;
}

function getSessionKey(scope = getCurrentSessionScope(), mode = state.currentMode) {
  if (!scope) return null;
  return getSessionKeyFromSaved({
    ...scope,
    libraryMode: state.libraryMode,
    essaySubMode: state.essaySubMode,
    mode,
  });
}

function restoreSavedSessionScopeOnStartup() {
  const saved = readJson(LAST_SCOPE_KEY, null);
  if (!saved || !Array.isArray(saved.selectedLessons) || !saved.selectedLessons.length) return;

  if (saved.libraryMode === "essay") {
    state.libraryMode = "essay";
    state.essaySubMode =
      saved.essaySubMode === "recognize"
        ? "recognize"
        : saved.essaySubMode === "misspell"
          ? "misspell"
          : "spell";
    state.currentSource = "normal";
    state.currentMode = saved.mode === "random" ? "random" : "sequential";
    state.quizLesson = null;
    saveLibraryMode();
    return;
  }

  if (saved.libraryMode === "kaoyan") {
    if (!state.data.kaoyan) return;
    const valid = new Set(getKaoyanLessons().map((lesson) => lesson.id));
    const lessons = saved.selectedLessons.filter((id) => valid.has(id));
    if (!lessons.length) return;
    state.libraryMode = "kaoyan";
    state.currentSource = "normal";
    state.currentMode = saved.mode === "random" ? "random" : "sequential";
    if (lessons.includes("freq")) {
      state.kaoyanBook = "freq";
      state.quizLesson = null;
    } else {
      state.kaoyanBook = "core";
      state.selectedKaoyanUnits = new Set(lessons);
      state.quizLesson = saved.type === "lesson" && valid.has(saved.quizLesson) ? saved.quizLesson : null;
    }
    saveLibraryMode();
    return;
  }

  const validLessons = new Set(state.data.lessons.map((lesson) => lesson.lesson));
  const selectedLessons = saved.selectedLessons.filter((lessonNo) => validLessons.has(lessonNo));
  if (!selectedLessons.length) return;

  state.libraryMode = "barron";
  state.currentSource = "normal";
  state.currentMode = saved.mode === "random" ? "random" : "sequential";
  state.selectedLessons = new Set(selectedLessons);
  state.quizLesson = saved.type === "lesson" && validLessons.has(saved.quizLesson) ? saved.quizLesson : null;
  saveLibraryMode();
}

function getCurrentSessionScope() {
  if (state.currentSource !== "normal") return null;

  if (isEssayMode()) {
    const lessonId = essayLessonId();
    return {
      type: "lesson",
      quizLesson: lessonId,
      selectedLessons: [lessonId],
      libraryMode: "essay",
      essaySubMode: state.essaySubMode,
      mode: state.currentMode,
    };
  }

  if (isKaoyanMode()) {
    const base = { libraryMode: "kaoyan", mode: state.currentMode };
    if (state.kaoyanBook === "freq") {
      return { ...base, type: "lesson", quizLesson: "freq", selectedLessons: ["freq"] };
    }
    if (state.quizLesson !== null) {
      return { ...base, type: "lesson", quizLesson: state.quizLesson, selectedLessons: [state.quizLesson] };
    }
    const units = sortKaoyanUnits([...state.selectedKaoyanUnits]);
    if (!units.length) return null;
    return {
      ...base,
      type: units.length === getKaoyanCoreLessons().length ? "all" : "selection",
      quizLesson: null,
      selectedLessons: units,
    };
  }

  const selectedLessons = [...state.selectedLessons].filter((n) => typeof n === "number").sort((a, b) => a - b);
  if (state.quizLesson !== null) {
    return {
      type: "lesson",
      quizLesson: state.quizLesson,
      selectedLessons: [state.quizLesson],
      libraryMode: "barron",
      mode: state.currentMode,
    };
  }

  if (!selectedLessons.length) return null;
  return {
    type: selectedLessons.length === state.data.lessons.length ? "all" : "selection",
    quizLesson: null,
    selectedLessons,
    libraryMode: "barron",
    mode: state.currentMode,
  };
}

function getScopeWords() {
  return state.quizLesson !== null ? getLessonWords(state.quizLesson) : getSelectedWords();
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

function saveLastScope() {
  const scope = getCurrentSessionScope();
  if (!scope) return;
  safeSetItem(LAST_SCOPE_KEY, JSON.stringify({ ...scope, savedAt: new Date().toISOString() }));
}

// 只在真正学习动作（判对错/翻页/撤销）时写队列，单纯切换勾选不产生垃圾会话
function saveCurrentSession() {
  const scope = getCurrentSessionScope();
  const key = getSessionKey(scope);
  if (!key) return;

  const queues = loadQueues();
  const current = state.deck[state.currentIndex];
  if (!state.deck.length || !current) {
    delete queues[key];
  } else {
    queues[key] = {
      queueKeys: state.deck.map(getWordKey),
      currentWordKey: getWordKey(current),
      savedAt: new Date().toISOString(),
    };
  }
  saveQueues(queues);
  saveLastScope();
}

function restoreSavedQueue() {
  const key = getSessionKey();
  const saved = key ? loadQueues()[key] : null;
  if (!saved || !Array.isArray(saved.queueKeys) || !state.deck.length) return;

  const byKey = new Map(state.deck.map((word) => [getWordKey(word), word]));
  const ordered = [];
  saved.queueKeys.forEach((wordKey) => {
    const word = byKey.get(wordKey);
    if (!word) return; // 已背或已不在词库
    ordered.push(word);
    byKey.delete(wordKey);
  });
  // 队列里没有的剩余词（新加的词、在别的组合里被撤销的词）按原顺序接在后面
  ordered.push(...byKey.values());
  state.deck = ordered;

  const index = ordered.findIndex((word) => getWordKey(word) === saved.currentWordKey);
  state.currentIndex = index >= 0 ? index : 0;
}

function handleKeyboardShortcuts(event) {
  // 拼写反馈期间：→ / 输入框外回车 = 下一题（输入框内回车由 spellInput 自己处理，避免同一次 Enter 提交又跳题）
  if (
    isSpellPractice() &&
    state.spellPendingAdvance &&
    (event.key === "Enter" || event.key === "ArrowRight") &&
    !event.repeat
  ) {
    if (event.key === "Enter" && event.target === els.spellInput) {
      return;
    }
    event.preventDefault();
    flushSpellPending();
    return;
  }

  const tagName = document.activeElement?.tagName || "";
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || event.repeat) {
    return;
  }

  if (isSpellPractice()) {
    if (event.key === "p" || event.key === "P") {
      event.preventDefault();
      speakCurrentWord(true);
    }
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
    const barron = state.data.lessons.flatMap((lesson) =>
      lesson.words.map((word) => ({ ...word, lessonTitle: lesson.title }))
    );
    const essay = [];
    const spell = state.data.essay?.spell || [];
    const recognize = state.data.essay?.recognize || [];
    const misspell = state.data.essay?.misspell || [];
    spell.forEach((word) => {
      essay.push({
        ...word,
        lesson: "essay-spell",
        lessonTitle: "作文·会拼写",
      });
    });
    recognize.forEach((word) => {
      essay.push({
        ...word,
        lesson: "essay-recognize",
        lessonTitle: "作文·要认识",
      });
    });
    misspell.forEach((word) => {
      essay.push({
        ...word,
        lesson: "essay-misspell",
        lessonTitle: "作文·错词",
      });
    });
    const kaoyan = getKaoyanLessons().flatMap((lesson) =>
      lesson.words.map((word) => ({ ...word, lesson: lesson.id, lessonTitle: lesson.title }))
    );
    allWordsCache = [...barron, ...essay, ...kaoyan];
  }
  return allWordsCache;
}

function getBarronWords() {
  return getAllWords().filter((word) => typeof word.lesson === "number");
}

function getSelectedWords() {
  return getAllWords().filter((word) => wordLibrary(word) === state.libraryMode && isWordInSelection(word));
}

// 按单元建索引：侧栏每次渲染要算 40+15 个单元的进度，词库合计 4000+ 词，逐个全表 filter 太慢
function getLessonWords(lessonNo) {
  if (!lessonIndexCache) {
    lessonIndexCache = new Map();
    getAllWords().forEach((word) => {
      if (!lessonIndexCache.has(word.lesson)) lessonIndexCache.set(word.lesson, []);
      lessonIndexCache.get(word.lesson).push(word);
    });
  }
  return [...(lessonIndexCache.get(lessonNo) || [])];
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
  const isNormal = state.currentSource === "normal";
  const sourceWords =
    state.currentSource === "wrong"
      ? getWrongWords({ lesson: state.wrongReviewLesson })
      : state.currentSource === "due"
        ? getDueWords().map((item) => item.word)
        : getScopeWords();

  // 普通背词：已背过的词不再进本轮（无论之前在哪个组合/模式里背的）
  state.deck = isNormal ? sourceWords.filter((word) => !isLearned(word)) : [...sourceWords];

  if (state.currentMode === "random") {
    shuffle(state.deck);
  } else if (state.currentSource === "wrong") {
    state.deck.sort(compareWrongWords);
  } else {
    state.deck.sort((a, b) => {
      if (a.lesson === b.lesson) return (a.index || 0) - (b.index || 0);
      if (typeof a.lesson === "number" && typeof b.lesson === "number") return a.lesson - b.lesson;
      return String(a.lesson).localeCompare(String(b.lesson));
    });
  }

  state.spellFeedback = "";
  state.spellRevealedAnswer = false;
  state.spellShowAnswer = false;
  state.spellPendingAdvance = null;
  if (els.spellInput) els.spellInput.value = "";

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
  state.sessionTotal = sourceWords.length;
  state.learnedCount = sourceWords.length - state.deck.length;
  if (isNormal) {
    restoreSavedQueue();
    saveLastScope();
  }
}

function reshuffleDeck() {
  const key = getSessionKey();
  if (key) {
    const queues = loadQueues();
    delete queues[key];
    saveQueues(queues);
  }
  buildDeck();
  renderAll();
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
  state.spellFeedback = "";
  state.spellRevealedAnswer = false;
  state.spellShowAnswer = false;
  state.spellPendingAdvance = null;
  if (els.spellInput) els.spellInput.value = "";
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
  if (last.source === "normal") {
    setLearned(last.word, last.wasLearned);
    saveLearned();
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

function markAnswer(isKnown, options = {}) {
  const current = state.deck[state.currentIndex];
  if (!current) return;
  state.spellPendingAdvance = null;
  const bypassReveal = options.bypassReveal || isSpellPractice();
  if (!bypassReveal && !state.showMeaning) {
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
    wasLearned: isLearned(current),
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
    if (state.currentSource === "normal") {
      setLearned(current, true);
      saveLearned();
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
  state.spellShowAnswer = false;
  state.spellFeedback = "";
  state.spellRevealedAnswer = false;
  if (els.spellInput) els.spellInput.value = "";
  saveCurrentSession();
  if (!state.deck.length && state.currentSource === "normal") {
    renderSidebar();
  }
  renderCard();
}

function revealSpellAnswer() {
  if (!isSpellPractice()) return;
  if (!state.deck[state.currentIndex]) return;
  if (state.spellPendingAdvance) return;
  state.spellShowAnswer = true;
  renderCard();
  els.spellInput?.focus();
}

function flushSpellPending() {
  if (!state.spellPendingAdvance) return false;
  const isKnown = Boolean(state.spellPendingAdvance.isKnown);
  state.spellPendingAdvance = null;
  state.spellFeedback = "";
  state.spellRevealedAnswer = false;
  state.spellShowAnswer = false;
  if (els.spellInput) els.spellInput.value = "";
  markAnswer(isKnown, { bypassReveal: true });
  return true;
}

function checkSpelling() {
  if (!isSpellPractice()) return;
  if (state.spellPendingAdvance) {
    // 已出对错，等用户点「下一个」
    return;
  }
  const current = state.deck[state.currentIndex];
  if (!current) return;
  const input = els.spellInput?.value || "";
  if (!normalizeAnswer(input)) {
    state.spellFeedback = "请先输入拼写";
    state.spellRevealedAnswer = false;
    renderCard();
    els.spellInput?.focus();
    return;
  }
  if (answersMatch(input, current.word)) {
    state.spellFeedback = "拼写正确 ✓ 回车或点「下一个」继续";
    state.spellRevealedAnswer = true;
    state.spellShowAnswer = true;
    state.spellPendingAdvance = { isKnown: true };
    renderCard();
    return;
  }
  state.spellFeedback = `不正确，答案：${current.word} · 回车或点「下一个」继续`;
  state.spellRevealedAnswer = true;
  state.spellShowAnswer = true;
  state.spellPendingAdvance = { isKnown: false };
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
  if (window.innerWidth >= 900) {
    els.flashcard?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
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
  const lessonRaw = actionEl.dataset.lesson;
  const lessonNo = /^\d+$/.test(String(lessonRaw || "")) ? Number(lessonRaw) : lessonRaw;

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

function startKaoyanUnitQuiz(lessonId) {
  state.selectedKaoyanUnits = new Set([lessonId]);
  state.currentSource = "normal";
  state.currentMode = "sequential";
  state.quizLesson = lessonId;
  state.wrongReviewLesson = null;
  saveKaoyanPrefs();
  syncModeButtons();
  buildDeck();
  renderAll();
}

function toggleKaoyanUnit(lessonId) {
  if (state.selectedKaoyanUnits.has(lessonId)) state.selectedKaoyanUnits.delete(lessonId);
  else state.selectedKaoyanUnits.add(lessonId);
  state.currentSource = "normal";
  state.quizLesson = null;
  state.wrongReviewLesson = null;
  saveKaoyanPrefs();
  buildDeck();
  renderAll();
}

function toggleAllLessons() {
  if (isKaoyanMode()) {
    const all = getKaoyanCoreLessons().map((lesson) => lesson.id);
    state.selectedKaoyanUnits = state.selectedKaoyanUnits.size === all.length ? new Set() : new Set(all);
    state.currentSource = "normal";
    state.quizLesson = null;
    state.wrongReviewLesson = null;
    saveKaoyanPrefs();
    buildDeck();
    renderAll();
    return;
  }
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
  if (a.lesson !== b.lesson) {
    // 作文词的 lesson 是字符串，直接相减会得到 NaN，排序结果不稳定
    if (typeof a.lesson === "number" && typeof b.lesson === "number") return a.lesson - b.lesson;
    return String(a.lesson).localeCompare(String(b.lesson));
  }
  return (a.index || 0) - (b.index || 0);
}

function getWrongWords({ lesson = null, selectedOnly = state.wrongOnlySelected } = {}) {
  return getAllWords().filter((word) => {
    const itemState = state.progress[getWordKey(word)];
    if (!isInWrongBook(itemState)) return false;
    if (lesson != null && word.lesson !== lesson) return false;
    // 错题本按词库隔离：巴朗 / 作文 / 考研各看各的
    if (wordLibrary(word) !== state.libraryMode) return false;
    if (selectedOnly && !isWordInSelection(word)) return false;
    return true;
  });
}

function getDueWords() {
  const now = Date.now();
  return getAllWords()
    .filter((word) => wordLibrary(word) === state.libraryMode)
    .map((word) => ({ word, progress: state.progress[getWordKey(word)] }))
    .filter(({ progress }) => progress && progress.nextReviewAt && new Date(progress.nextReviewAt).getTime() <= now);
}

function renderAll() {
  renderSidebar();
  refreshDashboard();
  renderCard();
}

function getLessonProgress(lessonNo) {
  const words = getLessonWords(lessonNo);
  const learned = words.filter(isLearned).length;
  return { learned, total: words.length, completed: words.length > 0 && learned >= words.length };
}

function getLessonProgressMap() {
  return new Map(state.data.lessons.map((lesson) => [lesson.lesson, getLessonProgress(lesson.lesson)]));
}

function renderSidebar() {
  els.lessonList.innerHTML = "";
  syncLibraryUi();

  if (isEssayMode()) {
    const items = [
      {
        id: "essay-spell",
        title: "会拼写",
        count: state.data.essay?.spellCount || (state.data.essay?.spell || []).length,
        sub: "spell",
        hint: "看中文，打字拼写",
      },
      {
        id: "essay-recognize",
        title: "要认识",
        count: state.data.essay?.recognizeCount || (state.data.essay?.recognize || []).length,
        sub: "recognize",
        hint: "翻卡：认识 / 不认识",
      },
      {
        id: "essay-misspell",
        title: "作文错词",
        count: state.data.essay?.misspellCount || (state.data.essay?.misspell || []).length,
        sub: "misspell",
        hint: "个人错词，打字拼写",
      },
    ];
    items.forEach((item) => {
      const active = state.essaySubMode === item.sub;
      const progress = getLessonProgress(item.id);
      const progressText = progress.completed
        ? "已完成"
        : progress.learned > 0
          ? `进度 ${progress.learned} / ${progress.total}`
          : `${item.count} 词`;
      const node = document.createElement("div");
      node.className = `lesson-item${active ? " active" : ""}${progress.completed ? " is-complete" : ""}`;
      node.innerHTML = `
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <div class="muted">${escapeHtml(progressText)} · ${escapeHtml(item.hint)}</div>
        </div>
        <div class="lesson-item-actions">
          <span class="tag">${active ? "当前" : "切换"}</span>
        </div>
      `;
      node.addEventListener("click", () => {
        if (state.essaySubMode === item.sub) return;
        state.essaySubMode = item.sub;
        state.currentSource = "normal";
        state.quizLesson = null;
        syncEssaySubButtons();
        syncLibraryUi();
        buildDeck();
        renderAll();
      });
      els.lessonList.appendChild(node);
    });
    return;
  }

  if (isKaoyanMode()) {
    renderKaoyanSidebar();
    return;
  }

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

function lessonStatusText(progress, total) {
  if (progress.completed) return `已完成 · ${progress.total} 个单词`;
  if (progress.learned > 0) return `进度 ${progress.learned} / ${progress.total}`;
  return `${total} 个单词`;
}

function renderKaoyanSidebar() {
  const lessons = state.kaoyanBook === "freq" ? getKaoyanLessons().filter((l) => l.book === "freq") : getKaoyanCoreLessons();
  const isFreq = state.kaoyanBook === "freq";

  lessons.forEach((lesson) => {
    const active = isFreq || state.selectedKaoyanUnits.has(lesson.id);
    const progress = getLessonProgress(lesson.id);
    const item = document.createElement("div");
    item.className = `lesson-item${active ? " active" : ""}${progress.completed ? " is-complete" : ""}`;

    if (!isFreq) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = active;
      checkbox.tabIndex = -1;
      item.appendChild(checkbox);
    }

    const info = document.createElement("div");
    const hint = isFreq ? " · 卡片标注真题出现次数" : "";
    info.innerHTML = `<strong>${escapeHtml(lesson.title)}</strong><div class="muted">${escapeHtml(
      lessonStatusText(progress, lesson.count) + hint
    )}</div>`;
    item.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "lesson-item-actions";
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = lesson.shortTitle || lesson.title;
    actions.appendChild(tag);

    if (!isFreq) {
      const quizButton = document.createElement("button");
      quizButton.type = "button";
      quizButton.className = "mini-button";
      quizButton.textContent = progress.completed ? "已完成" : progress.learned > 0 ? "继续背词" : "开始背词";
      quizButton.addEventListener("click", (event) => {
        event.stopPropagation();
        startKaoyanUnitQuiz(lesson.id);
      });
      actions.appendChild(quizButton);
      item.addEventListener("click", () => toggleKaoyanUnit(lesson.id));
    }
    item.appendChild(actions);
    els.lessonList.appendChild(item);
  });
}

function lessonTitleOf(lessonId) {
  if (typeof lessonId === "number") {
    return state.data.lessons.find((lesson) => lesson.lesson === lessonId)?.title || `Lesson ${lessonId}`;
  }
  return (
    getKaoyanLesson(lessonId)?.title ||
    getAllWords().find((word) => word.lesson === lessonId)?.lessonTitle ||
    String(lessonId ?? "")
  );
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

  if (isEssayMode()) {
    els.lessonCount.textContent = "3";
    els.wordCount.textContent = String(
      (state.data.essay?.spellCount || 0) +
        (state.data.essay?.recognizeCount || 0) +
        (state.data.essay?.misspellCount || 0)
    );
  } else if (isKaoyanMode()) {
    const freq = state.kaoyanBook === "freq";
    els.lessonCount.textContent = freq ? "1" : String(getKaoyanCoreLessons().length);
    els.wordCount.textContent = String(freq ? state.data.kaoyan.freqCount : state.data.kaoyan.coreCount);
  } else {
    els.lessonCount.textContent = String(state.data.lessonCount);
    els.wordCount.textContent = String(state.data.wordCount);
  }
  els.wrongCount.textContent = String(allWrongWords.length);

  if (state.currentSource === "wrong") {
    if (state.wrongReviewLesson != null) {
      els.currentScopeTitle.textContent = `${lessonTitleOf(state.wrongReviewLesson)} 错题复习`;
    } else if (state.wrongOnlySelected) {
      els.currentScopeTitle.textContent = "错题本复习（已选单元）";
    } else {
      els.currentScopeTitle.textContent = "错题本复习";
    }
    els.scopeHint.textContent = "不认识会放回队尾继续循环；点「认识」才移出错题本。列表里默认不显示释义，避免先剧透。";
  } else if (state.currentSource === "due") {
    els.currentScopeTitle.textContent = "到期复习";
    els.scopeHint.textContent = "正在复习今天到期的单词，答对会自动推迟下一次复习时间。";
  } else if (isEssayMode()) {
    if (state.essaySubMode === "spell") {
      els.currentScopeTitle.textContent = "作文 · 会拼写";
      els.scopeHint.textContent = "看中文拼英文；想不起来点「不会」可看正确拼写，仍可继续输入提交。";
    } else if (state.essaySubMode === "misspell") {
      els.currentScopeTitle.textContent = "作文 · 错词";
      els.scopeHint.textContent = "看中文拼英文；点「不会」显示正确拼写，仍可继续输入。对了下一词，错了进错题。";
    } else {
      els.currentScopeTitle.textContent = "作文 · 要认识";
      els.scopeHint.textContent = "先看英文，轻点卡片显示释义，再点认识 / 不认识。";
    }
  } else if (isKaoyanMode()) {
    const units = sortKaoyanUnits([...state.selectedKaoyanUnits]);
    if (state.kaoyanBook === "freq") {
      els.currentScopeTitle.textContent = "考研 · 真题高频200词";
      els.scopeHint.textContent = "按原书词族顺序排列，卡片上标注真题出现次数；先看英文，再显示释义判断。";
    } else if (state.quizLesson !== null) {
      els.currentScopeTitle.textContent = `${lessonTitleOf(state.quizLesson)} 背词中`;
      els.scopeHint.textContent = "先看英文，显示释义后再判断是否认识。";
    } else if (units.length === getKaoyanCoreLessons().length) {
      els.currentScopeTitle.textContent = "考研核心词 · 全部单元";
      els.scopeHint.textContent = `Unit 1–${units.length} 共 ${state.data.kaoyan.coreCount} 词，推荐按顺序背；想打乱顺序再切随机模式。`;
    } else if (units.length) {
      els.currentScopeTitle.textContent = `核心词：${units.map((id) => getKaoyanLesson(id)?.shortTitle || id).join("、")}`;
      els.scopeHint.textContent = `当前已选择 ${units.length} 个单元，推荐按顺序背；想打乱顺序再切随机模式。`;
    } else {
      els.currentScopeTitle.textContent = "未选择单元";
      els.scopeHint.textContent = "请先在面板选择至少一个核心词单元，再开始背词。";
    }
  } else if (state.quizLesson !== null) {
    els.currentScopeTitle.textContent = `${currentLessonTitle} 背词中`;
    els.scopeHint.textContent = "先看英文，显示释义后再判断是否认识。";
  } else if (selected.length === state.data.lessons.length) {
    els.currentScopeTitle.textContent = "巴朗 · 全部单元";
    els.scopeHint.textContent = "当前包含 Lesson 1–40，推荐按顺序背；想打乱顺序时再切到随机模式。";
  } else if (hasSelection) {
    els.currentScopeTitle.textContent = `已选单元：${selected.join("、")}`;
    els.scopeHint.textContent = `当前已选择 ${selected.length} 个单元，推荐按顺序背；想打乱顺序时再切到随机模式。`;
  } else {
    els.currentScopeTitle.textContent = "未选择单元";
    els.scopeHint.textContent = "请先在面板选择至少一个单元，再开始背词。";
  }

  if (isKaoyanMode()) {
    els.toggleAllLessons.textContent =
      state.selectedKaoyanUnits.size === getKaoyanCoreLessons().length ? "清空选择" : "全选单元";
  } else if (!isEssayMode()) {
    els.toggleAllLessons.textContent =
      state.selectedLessons.size === state.data.lessons.length ? "清空选择" : "全选单元";
  }
  const kaoyanHasScope =
    isKaoyanMode() && (state.kaoyanBook === "freq" || state.selectedKaoyanUnits.size > 0);
  els.startRandomBtn.disabled =
    state.currentSource === "normal" &&
    state.quizLesson === null &&
    !isEssayMode() &&
    !(isKaoyanMode() ? kaoyanHasScope : hasSelection);
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
  const spellMode = isSpellPractice();

  els.spellPanel?.classList.toggle("hidden-panel", !spellMode);
  els.knownBtn.classList.toggle("hidden-panel", spellMode);
  els.unknownBtn.classList.toggle("hidden-panel", spellMode);
  if (els.wordZoneLabel) els.wordZoneLabel.textContent = spellMode ? "请拼写" : "当前单词";
  if (els.meaningZoneLabel) els.meaningZoneLabel.textContent = spellMode ? "中文提示" : "中文释义";

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
    } else if (
      isEssayMode() ||
      (isKaoyanMode() ? state.kaoyanBook === "freq" || state.selectedKaoyanUnits.size : state.selectedLessons.size)
    ) {
      els.cardWord.textContent = "当前没有可背单词";
    } else {
      els.cardWord.textContent = "请先选择单元";
    }

    els.cardPos.textContent =
      finishedGroup && state.currentSource === "normal" ? "想再背一轮：面板 →「重置本组进度」" : "";
    els.tapHint.hidden = true;
    els.cardMeaning.textContent = spellMode ? "看中文，拼出英文后点检查。" : "轻点卡片查看中文意思。";
    els.cardMeaning.classList.add("hidden");
    els.knownBtn.disabled = true;
    els.unknownBtn.disabled = true;
    els.speakBtn.disabled = true;
    els.knownBtn.style.opacity = "0.55";
    els.unknownBtn.style.opacity = "0.55";
    if (els.spellFeedback) els.spellFeedback.textContent = "";
    if (els.spellHint) els.spellHint.textContent = "";
    if (els.spellCheckBtn) {
      els.spellCheckBtn.disabled = true;
      els.spellCheckBtn.textContent = "检查";
    }
    if (els.spellHintBtn) els.spellHintBtn.disabled = true;
    if (els.spellInput) {
      els.spellInput.disabled = false;
      els.spellInput.readOnly = false;
    }
    if (els.nextWordBtn) els.nextWordBtn.classList.remove("primary");
    return;
  }

  const modeText =
    state.currentSource === "wrong"
      ? "错题复习"
      : state.currentSource === "due"
        ? "到期复习"
        : spellMode
          ? "拼写练习"
          : state.quizLesson !== null
            ? "单元背词"
            : state.currentMode === "sequential"
              ? "顺序学习"
              : "随机学习";

  els.cardTag.textContent = `${current.lessonTitle} · ${modeText}`;
  els.cardProgress.textContent = `${state.learnedCount} / ${state.sessionTotal || state.deck.length}`;

  if (spellMode) {
    const showAnswer = state.spellShowAnswer || state.spellRevealedAnswer;
    // 中文意思默认一直显示，作为拼写提示
    els.cardMeaning.textContent = current.meaning || "未提取到释义";
    els.cardMeaning.classList.remove("hidden");
    els.cardMeaning.classList.add("revealed");
    els.flashcard.classList.add("is-revealed");
    // 「不会」或判错后：揭开英文正确答案
    els.cardWord.textContent = showAnswer ? current.word : "？？？";
    els.cardPos.textContent = current.part_of_speech || "";
    els.tapHint.hidden = showAnswer;
    els.tapHint.textContent = "想不起来可点「不会」看英文怎么拼";
    els.knownBtn.disabled = true;
    els.unknownBtn.disabled = true;
    els.speakBtn.disabled = false;
    els.knownBtn.style.opacity = "0.55";
    els.unknownBtn.style.opacity = "0.55";
    if (els.spellFeedback) {
      els.spellFeedback.textContent = state.spellFeedback || "";
      // 反馈文案带后缀（"拼写正确 ✓ 回车或…"），之前用 === 判断导致答对也显示成红色
      const ok = state.spellPendingAdvance?.isKnown === true;
      els.spellFeedback.classList.toggle("is-ok", ok);
      els.spellFeedback.classList.toggle("is-bad", Boolean(state.spellPendingAdvance) && !ok);
    }
    if (els.spellHint) {
      const bits = [];
      if (state.essaySubMode === "misspell" && Array.isArray(current.wrongForms) && current.wrongForms.length) {
        bits.push(`你曾写成：${current.wrongForms.join(" / ")}`);
      }
      if (current.syllable) bits.push(`音节：${current.syllable}`);
      if (showAnswer && !state.spellRevealedAnswer) bits.unshift("已显示英文拼写，可对照后再输入");
      els.spellHint.textContent = bits.join(" · ");
    }
    const pending = Boolean(state.spellPendingAdvance);
    if (els.spellCheckBtn) {
      els.spellCheckBtn.disabled = pending;
      els.spellCheckBtn.textContent = pending ? "已提交" : "检查";
    }
    if (els.spellInput) {
      // 用 readOnly 而非 disabled，这样反馈期间回车仍能触发 keydown → 下一题
      els.spellInput.readOnly = pending;
      els.spellInput.disabled = false;
    }
    if (els.spellHintBtn) {
      els.spellHintBtn.disabled = pending;
      els.spellHintBtn.textContent = state.spellShowAnswer || pending ? "已显示英文" : "不会";
      els.spellHintBtn.classList.toggle("active", state.spellShowAnswer || pending);
    }
    if (els.nextWordBtn) {
      els.nextWordBtn.classList.toggle("primary", pending);
    }
    setTimeout(() => {
      if (!els.spellInput) return;
      els.spellInput.focus();
      if (pending) {
        try {
          const len = els.spellInput.value.length;
          els.spellInput.setSelectionRange(len, len);
        } catch (_) {}
      }
    }, 0);
    return;
  }

  els.cardWord.textContent = current.word;
  const posText = current.part_of_speech || "未标注词性";
  els.cardPos.textContent = Number.isFinite(current.freq) ? `${posText} · 真题出现 ${current.freq} 次` : posText;
  els.tapHint.hidden = state.showMeaning;
  els.cardMeaning.textContent = current.meaning || "未提取到释义";
  els.cardMeaning.classList.toggle("hidden", !state.showMeaning);
  els.knownBtn.disabled = !state.showMeaning;
  els.unknownBtn.disabled = !state.showMeaning;
  els.speakBtn.disabled = false;
  els.knownBtn.style.opacity = state.showMeaning ? "1" : "0.55";
  els.unknownBtn.style.opacity = state.showMeaning ? "1" : "0.55";
  els.cardMeaning.classList.toggle("revealed", state.showMeaning);
  els.flashcard.classList.toggle("is-revealed", state.showMeaning);
  if (els.spellFeedback) els.spellFeedback.textContent = "";
  if (els.spellHint) els.spellHint.textContent = "";
  if (els.spellInput) {
    els.spellInput.disabled = false;
    els.spellInput.readOnly = false;
  }
  if (els.spellCheckBtn) {
    els.spellCheckBtn.disabled = false;
    els.spellCheckBtn.textContent = "检查";
  }
  if (els.nextWordBtn) els.nextWordBtn.classList.remove("primary");

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
    .sort((a, b) => {
      const aNum = typeof a[0] === "number";
      const bNum = typeof b[0] === "number";
      if (aNum && bNum) return a[0] - b[0];
      if (aNum) return -1;
      if (bNum) return 1;
      return String(a[0]).localeCompare(String(b[0]));
    })
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
  if (state.currentSource !== "normal") {
    showToast("请先退出错题本/复习，再重置背词进度");
    return;
  }
  const words = getScopeWords();
  const learnedWords = words.filter(isLearned);
  if (!window.confirm(`重置当前范围的背词进度？${learnedWords.length} 个已背单词会重新出现（错题本和复习记录保留）。`)) {
    return;
  }
  learnedWords.forEach((word) => setLearned(word, false));
  saveLearned();
  const queues = loadQueues();
  ["sequential", "random"].forEach((mode) => delete queues[getSessionKey(getCurrentSessionScope(), mode)]);
  saveQueues(queues);
  buildDeck();
  renderAll();
}

function resetProgress() {
  if (!window.confirm("清空全部进度？已背记录、错题本和复习计划都会被删除，无法恢复。")) return;
  [STORAGE_KEY, LEGACY_SESSION_KEY, LEARNED_KEY, QUEUE_KEY, LAST_SCOPE_KEY].forEach((key) =>
    localStorage.removeItem(key)
  );
  state.progress = {};
  state.learned = new Map();
  saveLearned(); // 写入空集合，避免下次启动又从旧版会话迁移
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

if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
