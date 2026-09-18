(() => {
  "use strict";

  const STORAGE_KEY = "phrase-sprint-v2";
  const CATALOG_VERSION = 11;
  const DAY = 86_400_000;
  const UNKNOWN_CHOICE_ID = "__unknown__";
  const OCR_URLS = {
    main: "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js",
    worker: "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js",
    core: "https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0",
    languages: "https://tessdata.projectnaptha.com/4.0.0_fast",
  };

  // デモ用の短いオリジナルデータ。書籍本文の転記ではありません。
  const DEMO_WORDS = globalThis.PHRASE_SPRINT_WORDS?.length ? globalThis.PHRASE_SPRINT_WORDS : [
    { number: "D01", word: "agenda", meaning: "議題、予定表", phrase: "review the meeting agenda", translation: "会議の議題を確認する", note: "デモデータ", band: "600点", tags: ["名詞", "会議"] },
    { number: "D02", word: "shipment", meaning: "発送、積荷", phrase: "track an international shipment", translation: "国際配送を追跡する", note: "デモデータ", band: "600点", tags: ["名詞", "物流"] },
    { number: "D03", word: "eligible", meaning: "資格がある", phrase: "be eligible for a discount", translation: "割引を受ける資格がある", note: "デモデータ", band: "730点", tags: ["形容詞"] },
    { number: "D04", word: "promptly", meaning: "速やかに", phrase: "respond promptly to a request", translation: "依頼に速やかに対応する", note: "デモデータ", band: "730点", tags: ["副詞"] },
    { number: "D05", word: "renovation", meaning: "改装、修復", phrase: "complete the office renovation", translation: "オフィスの改装を終える", note: "デモデータ", band: "860点", tags: ["名詞", "施設"] },
    { number: "D06", word: "tentative", meaning: "仮の、暫定的な", phrase: "a tentative schedule", translation: "仮の予定", note: "デモデータ", band: "860点", tags: ["形容詞"] },
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const todayKey = (date = new Date()) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

  function freshProgress() {
    return { stage: 0, ease: 2.5, interval: 0, due: Date.now(), attempts: 0, correct: 0, lapses: 0, lastRating: null };
  }

  function normalizeWord(raw, index = 0) {
    const tags = Array.isArray(raw.tags) ? raw.tags : String(raw.tags || "").split(/[、,]/).map((tag) => tag.trim()).filter(Boolean);
    const progress = { ...freshProgress(), ...(raw.progress || {}) };
    return {
      id: raw.id || uid(),
      number: String(raw.number ?? raw.no ?? raw["掲載番号"] ?? index + 1).trim(),
      word: String(raw.word ?? raw["英単語"] ?? "").trim(),
      meaning: String(raw.meaning ?? raw["意味"] ?? "").trim(),
      phrase: String(raw.phrase ?? raw["英語フレーズ"] ?? "").trim(),
      translation: String(raw.translation ?? raw["フレーズの訳"] ?? "").trim(),
      note: String(raw.note ?? raw["メモ"] ?? "").trim(),
      band: String(raw.band ?? raw.scoreBand ?? raw["レベル"] ?? "未分類").trim() || "未分類",
      tags,
      progress,
      createdAt: raw.createdAt || Date.now(),
    };
  }

  function loadState() {
    const catalogWords = DEMO_WORDS.map(normalizeWord);
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved?.version === 1 && Array.isArray(saved.words)) {
        const savedWords = saved.words.map(normalizeWord);
        const savedByNumber = new Map(savedWords.map((word) => [word.number, word]));
        const catalogNumbers = new Set(catalogWords.map((word) => word.number));
        const mergedCatalog = catalogWords.map((word) => {
          const previous = savedByNumber.get(word.number);
          return previous ? { ...word, id: previous.id, progress: previous.progress, note: previous.note || word.note, createdAt: previous.createdAt } : word;
        });
        const customWords = savedWords.filter((word) => !catalogNumbers.has(word.number) && !word.number.startsWith("D"));
        return { ...saved, catalogVersion: CATALOG_VERSION, words: [...mergedCatalog, ...customWords], activity: saved.activity || {} };
      }
    } catch (error) {
      console.warn("保存データを読み込めませんでした", error);
    }
    return { version: 1, catalogVersion: CATALOG_VERSION, words: catalogWords, activity: {} };
  }

  let state = loadState();
  let session = null;
  let lastSessionMode = "all";
  let photoFiles = [];
  let photoRotation = 0;
  let photoCandidates = [];
  let photoOcrBusy = false;
  let ocrLoadPromise = null;

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  saveState();

  function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast ${type === "error" ? "error" : ""}`;
    toast.textContent = message;
    $("#toast-region").append(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  function navigate(name) {
    $$(".view").forEach((view) => view.classList.toggle("is-active", view.id === `view-${name}`));
    $$(".nav-button").forEach((button) => button.classList.toggle("is-active", button.dataset.nav === name));
    document.body.classList.toggle("is-studying", name === "study");
    if (name !== "study") document.body.classList.remove("study-answered");
    if (name === "home") renderDashboard();
    if (name === "words") renderLibrary();
    window.scrollTo({ top: 0, behavior: name === "study" ? "auto" : "smooth" });
  }

  function wordStatus(word) {
    if (word.progress.stage >= 5 || word.progress.interval >= 21) return "mastered";
    if (word.progress.attempts > 0) return "learning";
    return "new";
  }

  function renderDashboard() {
    const mastered = state.words.filter((word) => wordStatus(word) === "mastered").length;
    const attempts = state.words.reduce((sum, word) => sum + word.progress.attempts, 0);
    const correct = state.words.reduce((sum, word) => sum + word.progress.correct, 0);
    const accuracy = attempts ? Math.round((correct / attempts) * 100) : null;
    const today = state.activity[todayKey()] || { answers: 0 };
    const formatted = new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(new Date());

    $("#today-label").textContent = formatted.toUpperCase();
    $("#all-pill").textContent = `${state.words.length} words`;
    $("#mastered-stat").textContent = mastered;
    $("#mastered-sub").textContent = `全${state.words.length}語`;
    $("#mastered-meter").style.width = `${state.words.length ? (mastered / state.words.length) * 100 : 0}%`;
    $("#accuracy-stat").textContent = accuracy === null ? "—" : `${accuracy}%`;
    $("#accuracy-sub").textContent = attempts ? `累計 ${attempts} 回の回答` : "まだ回答がありません";
    $("#today-stat").textContent = today.answers || 0;
    $("#start-random-button").disabled = state.words.length === 0;
    const wrongAll = state.words.filter((word) => word.progress.lapses > 0).length;
    $("#wrong-all-count").textContent = wrongAll;
    $("#start-wrong-all-button").disabled = wrongAll === 0;
    $$('[data-review-band]').forEach((button) => {
      const band = button.dataset.reviewBand;
      const bandWords = state.words.filter((word) => word.band === band);
      const count = bandWords.length;
      const reviewed = bandWords.filter((word) => word.progress.attempts > 0).length;
      const wrong = bandWords.filter((word) => word.progress.lapses > 0).length;
      const progress = count ? Math.round((reviewed / count) * 100) : 0;
      button.disabled = count === 0;
      const countLabel = button.querySelector(`[data-band-count="${band}"]`);
      if (countLabel) countLabel.textContent = count;
      const progressLabel = $(`[data-band-progress="${band}"]`);
      const reviewedLabel = $(`[data-band-reviewed="${band}"]`);
      const totalLabel = $(`[data-band-total="${band}"]`);
      const meter = $(`[data-band-meter="${band}"]`);
      const wrongButton = $(`[data-review-wrong-band="${band}"]`);
      const wrongLabel = $(`[data-band-wrong-count="${band}"]`);
      if (progressLabel) progressLabel.textContent = `${progress}%`;
      if (reviewedLabel) reviewedLabel.textContent = reviewed;
      if (totalLabel) totalLabel.textContent = count;
      if (meter) meter.style.width = `${progress}%`;
      if (wrongButton) wrongButton.disabled = wrong === 0;
      if (wrongLabel) wrongLabel.textContent = wrong;
    });
    renderMiniBars(accuracy);
  }

  function renderMiniBars(accuracy) {
    $("#mini-bars").innerHTML = [24, 37, 29, 49, 38, 55].map((height, index) => `<i class="${accuracy !== null && index < Math.ceil(accuracy / 17) ? "on" : ""}" style="height:${height}px"></i>`).join("");
  }

  function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function startSession(mode = "all") {
    const distinctMeanings = new Set(state.words.map((word) => word.meaning.trim().toLocaleLowerCase())).size;
    if (state.words.length < 4 || distinctMeanings < 4) {
      showToast("4択問題には意味の異なる4語以上の登録が必要です", "error");
      navigate("data");
      return;
    }
    lastSessionMode = mode;
    const now = Date.now();
    const bandWrongMode = mode.startsWith("band-wrong:");
    const targetBand = bandWrongMode ? mode.slice("band-wrong:".length) : mode.startsWith("band:") ? mode.slice(5) : "";
    let candidates = [];
    if (mode === "due") candidates = state.words.filter((word) => word.progress.due <= now).sort((a, b) => a.progress.due - b.progress.due);
    if (mode === "weak") candidates = state.words.filter((word) => word.progress.lapses > 0 || (word.progress.attempts > 0 && word.progress.correct / word.progress.attempts < 0.7)).sort((a, b) => b.progress.lapses - a.progress.lapses);
    if (mode === "wrong-all") candidates = shuffle(state.words.filter((word) => word.progress.lapses > 0)).sort((a, b) => b.progress.lapses - a.progress.lapses);
    if (mode === "all") candidates = shuffle(state.words);
    if (targetBand && !bandWrongMode) candidates = shuffle(state.words.filter((word) => word.band === targetBand));
    if (bandWrongMode) candidates = shuffle(state.words.filter((word) => word.band === targetBand && word.progress.lapses > 0)).sort((a, b) => b.progress.lapses - a.progress.lapses);
    if (!candidates.length) {
      if (mode === "wrong-all") {
        showToast("間違えた問題はまだありません", "error");
        return;
      }
      if (targetBand) {
        showToast(bandWrongMode ? `${targetBand}で間違えた問題はまだありません` : `${targetBand}の単語がありません`, "error");
        return;
      }
      candidates = shuffle(state.words);
      showToast(mode === "due" ? "復習待ちはありません。ランダム出題します" : "苦手語はまだありません。ランダム出題します");
    }
    const modeLabel = bandWrongMode
      ? `${targetBand} · 間違えた問題`
      : targetBand
      ? `${targetBand} · レベル別復習`
      : mode === "wrong-all" ? "全レベル · 間違えた問題" : mode === "due" ? "復習待ち · 10問" : mode === "weak" ? "苦手語 · 集中復習" : "全レベル · ランダム10問";
    session = { queue: candidates.slice(0, 10).map((word) => word.id), band: targetBand, modeLabel, index: 0, good: 0, review: 0, answered: 0, answeredCurrent: false, currentChoices: [] };
    navigate("study");
    renderStudyCard();
    speakCurrentWord();
  }

  function currentWord() {
    return state.words.find((word) => word.id === session?.queue[session.index]);
  }

  function renderStudyCard() {
    const word = currentWord();
    if (!word) return finishSession();
    const total = session.queue.length;
    $("#study-mode-label").textContent = session.modeLabel || "4-CHOICE QUIZ";
    $("#study-counter").textContent = `${session.index + 1} / ${total}`;
    $("#study-progress-bar").style.width = `${(session.index / total) * 100}%`;
    $("#card-number").textContent = `No. ${word.number || "—"}`;
    $("#card-band").textContent = word.band || "未分類";
    $("#card-word").textContent = word.word;
    $("#card-phrase").textContent = word.phrase || "例文は未登録です";
    document.body.classList.remove("study-answered");
    session.answeredCurrent = false;
    const usedMeanings = new Set([word.meaning.trim().toLocaleLowerCase()]);
    const distractors = [];
    const sameBandPool = session.band ? state.words.filter((item) => item.id !== word.id && item.band === session.band) : [];
    const fallbackPool = state.words.filter((item) => item.id !== word.id && (!session.band || item.band !== session.band));
    for (const candidate of [...shuffle(sameBandPool), ...shuffle(fallbackPool)]) {
      const meaningKey = candidate.meaning.trim().toLocaleLowerCase();
      if (!meaningKey || usedMeanings.has(meaningKey)) continue;
      usedMeanings.add(meaningKey);
      distractors.push(candidate);
      if (distractors.length === 3) break;
    }
    session.currentChoices = shuffle([word, ...distractors]);
    $("#choice-grid").innerHTML = session.currentChoices.map((choice, index) => `
      <button class="choice-button" data-choice-id="${escapeHtml(choice.id)}">
        <span class="choice-letter">${String.fromCharCode(65 + index)}</span>
        <span>${escapeHtml(choice.meaning)}</span>
      </button>`).join("") + `
      <button class="choice-button is-unknown" data-choice-id="${UNKNOWN_CHOICE_ID}">
        <span class="choice-letter">?</span>
        <span>分からない</span>
      </button>`;
    $("#quiz-feedback").hidden = true;
    $("#quiz-feedback").classList.remove("is-wrong");
    $("#next-button").hidden = true;
    $("#flashcard").animate?.([{ opacity: 0.25, transform: "translateX(8px)" }, { opacity: 1, transform: "translateX(0)" }], { duration: 220 });
  }

  function scheduleWord(word, rating) {
    const p = word.progress;
    p.attempts += 1;
    p.lastRating = rating;
    if (rating === "again") {
      p.stage = 0;
      p.interval = 0;
      p.lapses += 1;
      p.due = Date.now() + 10 * 60 * 1000;
    } else if (rating === "hard") {
      p.stage = Math.max(1, p.stage);
      p.ease = Math.max(1.3, p.ease - 0.15);
      p.interval = Math.max(1, Math.round((p.interval || 1) * 1.2));
      p.due = Date.now() + p.interval * DAY;
    } else {
      p.correct += 1;
      p.stage += rating === "easy" ? 2 : 1;
      p.ease = Math.min(3, p.ease + (rating === "easy" ? 0.15 : 0));
      if (p.interval === 0) p.interval = rating === "easy" ? 4 : 1;
      else if (p.interval === 1) p.interval = rating === "easy" ? 7 : 3;
      else p.interval = Math.round(p.interval * p.ease * (rating === "easy" ? 1.25 : 1));
      p.due = Date.now() + p.interval * DAY;
    }
  }

  function answerCurrent(choiceId) {
    const word = currentWord();
    if (!word || session.answeredCurrent) return;
    const correct = choiceId === word.id;
    session.answeredCurrent = true;
    $$(".choice-button", $("#choice-grid")).forEach((button) => {
      button.disabled = true;
      if (button.dataset.choiceId === word.id) button.classList.add("is-correct");
      if (!correct && button.dataset.choiceId === choiceId) button.classList.add("is-wrong");
    });
    scheduleWord(word, correct ? "good" : "again");
    document.body.classList.add("study-answered");
    session.answered += 1;
    if (correct) session.good += 1;
    else session.review += 1;
    const key = todayKey();
    const activity = state.activity[key] || { answers: 0, correct: 0 };
    activity.answers += 1;
    if (correct) activity.correct += 1;
    state.activity[key] = activity;
    saveState();

    $("#feedback-mark").textContent = correct ? "○" : "×";
    $("#feedback-title").textContent = `意味：${word.meaning}`;
    $("#feedback-translation").textContent = word.translation ? `例文訳：${word.translation}` : "例文の日本語訳は未登録です";
    $("#quiz-feedback").classList.toggle("is-wrong", !correct);
    $("#quiz-feedback").hidden = false;
    $("#next-button").hidden = false;
    $("#next-button").focus();
  }

  function nextQuestion() {
    if (!session?.answeredCurrent) return;
    session.index += 1;
    if (session.index >= session.queue.length) {
      finishSession();
    } else {
      renderStudyCard();
      speakCurrentWord();
    }
  }

  function finishSession() {
    if (!session) return navigate("home");
    $("#result-correct").textContent = session.good;
    $("#result-review").textContent = session.review;
    $("#result-total").textContent = session.answered;
    $("#result-message").textContent = session.good === session.answered ? "全問クリア。今日はかなり冴えています。" : "忘れた単語は、次の復習にちゃんと戻しておきました。";
    $("#study-progress-bar").style.width = "100%";
    navigate("results");
  }

  function renderLibrary() {
    const query = $("#word-search").value.trim().toLowerCase();
    const status = $("#status-filter").value;
    const band = $("#band-filter").value;
    const bands = [...new Set(state.words.map((word) => word.band || "未分類"))].sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));
    const currentBand = $("#band-filter").value;
    $("#band-filter").innerHTML = `<option value="all">すべてのレベル</option>${bands.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}`;
    $("#band-filter").value = bands.includes(currentBand) ? currentBand : "all";

    const filtered = state.words.filter((word) => {
      const haystack = [word.word, word.meaning, word.phrase, word.translation, word.tags.join(" ")].join(" ").toLowerCase();
      return (!query || haystack.includes(query)) && (status === "all" || wordStatus(word) === status) && (band === "all" || word.band === band);
    });
    const statusLabels = { new: "未学習", learning: "学習中", mastered: "習得済み" };
    $("#word-table-body").innerHTML = filtered.map((word) => {
      const currentStatus = wordStatus(word);
      return `<tr>
        <td>${escapeHtml(word.number || "—")}</td>
        <td><strong class="word-main">${escapeHtml(word.word)}</strong><span class="word-sub">${escapeHtml(word.phrase)}</span></td>
        <td>${escapeHtml(word.meaning)}<span class="word-sub">${escapeHtml(word.translation)}</span></td>
        <td><span class="badge">${escapeHtml(word.band)}</span></td>
        <td><span class="badge ${currentStatus}">${statusLabels[currentStatus]}</span></td>
        <td><button class="row-menu" data-edit-id="${escapeHtml(word.id)}" aria-label="${escapeHtml(word.word)}を編集">•••</button></td>
      </tr>`;
    }).join("");
    $("#word-empty").hidden = filtered.length > 0;
  }

  function openWordDialog(id = null) {
    const word = id ? state.words.find((item) => item.id === id) : null;
    $("#dialog-title").textContent = word ? "単語を編集" : "単語を追加";
    $("#field-id").value = word?.id || "";
    $("#field-number").value = word?.number || "";
    $("#field-band").value = word?.band === "未分類" ? "" : word?.band || "";
    $("#field-word").value = word?.word || "";
    $("#field-meaning").value = word?.meaning || "";
    $("#field-phrase").value = word?.phrase || "";
    $("#field-translation").value = word?.translation || "";
    $("#field-note").value = word?.note || "";
    $("#field-tags").value = word?.tags.join(", ") || "";
    $("#delete-word").hidden = !word;
    $("#word-dialog").showModal();
    setTimeout(() => $("#field-word").focus(), 50);
  }

  function saveWordFromForm(event) {
    event.preventDefault();
    const id = $("#field-id").value;
    const existing = state.words.find((word) => word.id === id);
    const values = {
      id: id || uid(),
      number: $("#field-number").value.trim() || String(state.words.length + 1).padStart(3, "0"),
      band: $("#field-band").value.trim() || "未分類",
      word: $("#field-word").value.trim(),
      meaning: $("#field-meaning").value.trim(),
      phrase: $("#field-phrase").value.trim(),
      translation: $("#field-translation").value.trim(),
      note: $("#field-note").value.trim(),
      tags: $("#field-tags").value,
      progress: existing?.progress || freshProgress(),
      createdAt: existing?.createdAt || Date.now(),
    };
    if (!values.word || !values.meaning) return;
    const normalized = normalizeWord(values);
    if (existing) state.words[state.words.indexOf(existing)] = normalized;
    else state.words.push(normalized);
    saveState();
    $("#word-dialog").close();
    renderLibrary();
    renderDashboard();
    showToast(existing ? "単語を更新しました" : "単語を追加しました");
  }

  function deleteCurrentWord() {
    const id = $("#field-id").value;
    const word = state.words.find((item) => item.id === id);
    if (!word || !confirm(`「${word.word}」を削除しますか？`)) return;
    state.words = state.words.filter((item) => item.id !== id);
    saveState();
    $("#word-dialog").close();
    renderLibrary();
    renderDashboard();
    showToast("単語を削除しました");
  }

  function loadOcrLibrary() {
    if (globalThis.Tesseract) return Promise.resolve(globalThis.Tesseract);
    if (ocrLoadPromise) return ocrLoadPromise;
    ocrLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = OCR_URLS.main;
      script.crossOrigin = "anonymous";
      script.onload = () => globalThis.Tesseract ? resolve(globalThis.Tesseract) : reject(new Error("OCRを開始できませんでした"));
      script.onerror = () => reject(new Error("OCRプログラムを読み込めません。通信環境を確認してください"));
      document.head.append(script);
    }).catch((error) => {
      ocrLoadPromise = null;
      throw error;
    });
    return ocrLoadPromise;
  }

  function loadPhotoImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name}を開けませんでした`)); };
      image.src = url;
    });
  }

  async function preparePhotoCanvas(file, { enhance = false, maxDimension = 2400, rotation = photoRotation } = {}) {
    const image = await loadPhotoImage(file);
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    const angle = ((rotation % 360) + 360) % 360;
    const rotated = document.createElement("canvas");
    const swapSides = angle === 90 || angle === 270;
    rotated.width = swapSides ? sourceHeight : sourceWidth;
    rotated.height = swapSides ? sourceWidth : sourceHeight;
    const rotatedContext = rotated.getContext("2d", { willReadFrequently: false });
    rotatedContext.fillStyle = "#fff";
    rotatedContext.fillRect(0, 0, rotated.width, rotated.height);
    if (angle === 90) { rotatedContext.translate(rotated.width, 0); rotatedContext.rotate(Math.PI / 2); }
    if (angle === 180) { rotatedContext.translate(rotated.width, rotated.height); rotatedContext.rotate(Math.PI); }
    if (angle === 270) { rotatedContext.translate(0, rotated.height); rotatedContext.rotate(-Math.PI / 2); }
    rotatedContext.drawImage(image, 0, 0);

    const crop = $("#photo-crop").value;
    let cropX = 0;
    let cropWidth = rotated.width;
    if (crop === "left") cropWidth = Math.round(rotated.width * 0.57);
    if (crop === "right") {
      cropX = Math.round(rotated.width * 0.43);
      cropWidth = rotated.width - cropX;
    }
    const scale = Math.min(1, maxDimension / Math.max(cropWidth, rotated.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(cropWidth * scale));
    canvas.height = Math.max(1, Math.round(rotated.height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: false });
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (enhance && "filter" in context) context.filter = "grayscale(1) contrast(1.22)";
    context.drawImage(rotated, cropX, 0, cropWidth, rotated.height, 0, 0, canvas.width, canvas.height);
    context.filter = "none";
    return canvas;
  }

  async function renderPhotoPreview() {
    if (!photoFiles.length) return;
    try {
      const prepared = await preparePhotoCanvas(photoFiles[0], { maxDimension: 1600 });
      const canvas = $("#photo-canvas");
      canvas.width = prepared.width;
      canvas.height = prepared.height;
      canvas.getContext("2d").drawImage(prepared, 0, 0);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function resetPhotoSelection() {
    photoFiles = [];
    photoCandidates = [];
    photoRotation = 0;
    $("#photo-file").value = "";
    $("#photo-camera").value = "";
    $("#photo-crop").value = "full";
    $("#photo-workspace").hidden = true;
    $("#photo-results").hidden = true;
    $("#ocr-progress").hidden = true;
    $("#photo-candidate-list").innerHTML = "";
  }

  function openPhotoDialog() {
    resetPhotoSelection();
    $("#photo-dialog").showModal();
  }

  function closePhotoDialog() {
    if (photoOcrBusy) return showToast("写真を読み取り中です。完了までお待ちください", "error");
    $("#photo-dialog").close();
  }

  async function selectPhotos(files, { append = false } = {}) {
    const incoming = [...files].filter((file) => file.type.startsWith("image/"));
    const combined = append ? [...photoFiles, ...incoming] : incoming;
    photoFiles = combined.slice(0, 10);
    if (combined.length > 10) showToast("写真は一度に10枚までです。先頭の10枚を選択しました", "error");
    if (!photoFiles.length) return;
    if (!append) {
      photoRotation = 0;
      $("#photo-crop").value = "full";
    }
    photoCandidates = [];
    $("#photo-workspace").hidden = false;
    $("#photo-results").hidden = true;
    $("#ocr-progress").hidden = true;
    $("#photo-file-label").textContent = photoFiles.length === 1 ? `${photoFiles[0].name}（1/10枚）` : `${photoFiles.length}/10枚を選択`;
    await renderPhotoPreview();
  }

  function updateOcrProgress(status, progress = 0) {
    const labels = {
      "loading tesseract core": "OCRエンジンを準備中",
      "initializing tesseract": "OCRエンジンを初期化中",
      "loading language traineddata": "英語・日本語データを準備中",
      "initializing api": "認識設定を準備中",
      "recognizing text": "写真の文字を認識中",
    };
    const percentage = Math.max(0, Math.min(100, Math.round(progress * 100)));
    $("#ocr-status").textContent = labels[status] || status || "OCRを準備中";
    $("#ocr-percent").textContent = `${percentage}%`;
    $("#ocr-meter-bar").style.width = `${percentage}%`;
  }

  function mergePhotoCandidates(candidates) {
    const byWord = new Map(photoCandidates.map((candidate) => [candidate.word.toLowerCase(), candidate]));
    candidates.forEach((candidate) => {
      const key = candidate.word.toLowerCase();
      const existing = byWord.get(key);
      if (existing) {
        ["meaning", "phrase", "translation", "sourceNumber"].forEach((field) => {
          if (!existing[field] && candidate[field]) existing[field] = candidate[field];
        });
      } else {
        const item = { ...candidate, include: true };
        photoCandidates.push(item);
        byWord.set(key, item);
      }
    });
  }

  function blankPhotoCandidate() {
    return { include: true, sourceNumber: "", word: "", meaning: "", phrase: "", translation: "", band: "600点", tags: "写真OCR, 金のフレーズ", note: "写真OCR：金のフレーズ" };
  }

  function renderPhotoCandidates() {
    $("#photo-result-count").textContent = `読み取り候補 ${photoCandidates.length}件`;
    $("#photo-candidate-list").innerHTML = photoCandidates.map((candidate, index) => `
      <article class="photo-candidate ${candidate.include ? "" : "is-unchecked"}" data-photo-card="${index}">
        <div class="photo-candidate-head">
          <label class="photo-candidate-check">
            <input type="checkbox" data-photo-include data-photo-index="${index}" ${candidate.include ? "checked" : ""} />
            <span>候補 ${String(index + 1).padStart(2, "0")}${candidate.sourceNumber ? `・書籍No.${escapeHtml(candidate.sourceNumber)}` : ""}</span>
          </label>
          <button type="button" class="photo-remove-row" data-photo-remove="${index}">候補を削除</button>
        </div>
        <div class="photo-candidate-grid">
          <label><span>英単語・表現 <b>必須</b></span><input data-photo-index="${index}" data-photo-field="word" value="${escapeHtml(candidate.word)}" /></label>
          <label><span>意味 <b>必須</b></span><input data-photo-index="${index}" data-photo-field="meaning" value="${escapeHtml(candidate.meaning)}" /></label>
          <label class="wide"><span>英語フレーズ</span><textarea rows="2" data-photo-index="${index}" data-photo-field="phrase">${escapeHtml(candidate.phrase)}</textarea></label>
          <label class="wide"><span>フレーズの訳</span><textarea rows="2" data-photo-index="${index}" data-photo-field="translation">${escapeHtml(candidate.translation)}</textarea></label>
          <label><span>レベル</span><input data-photo-index="${index}" data-photo-field="band" value="${escapeHtml(candidate.band)}" /></label>
          <label><span>メモ</span><input data-photo-index="${index}" data-photo-field="note" value="${escapeHtml(candidate.note)}" /></label>
        </div>
      </article>`).join("");
  }

  async function readPhotos() {
    if (!photoFiles.length || photoOcrBusy) return;
    photoOcrBusy = true;
    $("#photo-read").disabled = true;
    $("#ocr-progress").hidden = false;
    $("#photo-results").hidden = true;
    updateOcrProgress("OCRプログラムを読み込み中", 0.02);
    let worker;
    try {
      const Tesseract = await loadOcrLibrary();
      let activeFile = 0;
      worker = await Tesseract.createWorker(["eng", "jpn"], Tesseract.OEM.LSTM_ONLY, {
        workerPath: OCR_URLS.worker,
        corePath: OCR_URLS.core,
        langPath: OCR_URLS.languages,
        logger: (message) => {
          const totalProgress = photoFiles.length ? (activeFile + (message.progress || 0)) / photoFiles.length : message.progress || 0;
          updateOcrProgress(message.status, totalProgress);
        },
      });
      await worker.setParameters({ tessedit_pageseg_mode: String(Tesseract.PSM.SPARSE_TEXT), preserve_interword_spaces: "1" });

      photoCandidates = [];
      const rawSections = [];
      for (let index = 0; index < photoFiles.length; index += 1) {
        activeFile = index;
        const file = photoFiles[index];
        const orientationProbe = await loadPhotoImage(file);
        const likelySideways = orientationProbe.naturalHeight > orientationProbe.naturalWidth * 1.12;
        const rotationOrder = photoRotation === 0 && likelySideways
          ? [90, -90, 0, 180]
          : [photoRotation, photoRotation + 90, photoRotation - 90, photoRotation + 180];
        const rotations = [...new Set(rotationOrder)];
        let bestAttempt = null;
        for (let attemptIndex = 0; attemptIndex < rotations.length; attemptIndex += 1) {
          const rotation = rotations[attemptIndex];
          $("#ocr-status").textContent = `${file.name}の向きを確認中（${attemptIndex + 1}/${rotations.length}）`;
          const canvas = await preparePhotoCanvas(file, { enhance: true, maxDimension: 2400, rotation });
          const result = await worker.recognize(canvas, { rotateAuto: true });
          const rawText = result.data.text || "";
          const candidates = globalThis.PhraseSprintPhotoOCR.parseBookOcr(rawText, file.name);
          const bookMatches = candidates.filter((candidate) => candidate.sourceNumber).length;
          const quality = bookMatches * 1000 + (result.data.confidence || 0);
          if (!bestAttempt || quality > bestAttempt.quality) bestAttempt = { rotation, rawText, candidates, bookMatches, quality };
          if (bookMatches >= 3) break;
        }
        if (!bestAttempt) continue;
        rawSections.push(`===== ${file.name}（自動回転 ${((bestAttempt.rotation % 360) + 360) % 360}度） =====\n${bestAttempt.rawText.trim()}`);
        mergePhotoCandidates(bestAttempt.candidates);
        if (photoFiles.length === 1 && bestAttempt.rotation !== photoRotation) {
          photoRotation = bestAttempt.rotation;
          await renderPhotoPreview();
        }
      }

      if (!photoCandidates.length) photoCandidates.push(blankPhotoCandidate());
      $("#ocr-raw-text").value = rawSections.join("\n\n");
      renderPhotoCandidates();
      updateOcrProgress("読み取り完了", 1);
      $("#photo-results").hidden = false;
      $("#photo-results").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      console.error(error);
      updateOcrProgress("読み取りに失敗しました", 0);
      showToast(`写真を読み取れませんでした：${error.message}`, "error");
    } finally {
      if (worker) await worker.terminate().catch(() => {});
      photoOcrBusy = false;
      $("#photo-read").disabled = false;
    }
  }

  function reparsePhotoText() {
    const candidates = globalThis.PhraseSprintPhotoOCR.parseBookOcr($("#ocr-raw-text").value, "編集したOCR原文");
    photoCandidates = candidates.length ? candidates.map((candidate) => ({ ...candidate, include: true })) : [blankPhotoCandidate()];
    renderPhotoCandidates();
  }

  function importPhotoCandidates() {
    const selected = photoCandidates.filter((candidate) => candidate.include);
    if (!selected.length) return showToast("追加する候補をチェックしてください", "error");
    const incomplete = selected.filter((candidate) => !candidate.word.trim() || !candidate.meaning.trim());
    if (incomplete.length) return showToast("英単語・表現と意味を入力してから追加してください", "error");

    const existingByWord = new Map(state.words.map((word) => [word.word.toLowerCase(), word]));
    const usedNumbers = new Set(state.words.map((word) => word.number));
    let nextNumeric = Math.max(0, ...state.words.map((word) => Number(word.number)).filter(Number.isFinite)) + 1;
    const nextNumber = () => {
      let value = String(nextNumeric).padStart(3, "0");
      while (usedNumbers.has(value)) { nextNumeric += 1; value = String(nextNumeric).padStart(3, "0"); }
      usedNumbers.add(value);
      nextNumeric += 1;
      return value;
    };

    let added = 0;
    let updated = 0;
    selected.forEach((candidate) => {
      const existing = existingByWord.get(candidate.word.trim().toLowerCase());
      const normalized = normalizeWord({
        ...candidate,
        number: existing?.number || nextNumber(),
        tags: candidate.tags || "写真OCR, 金のフレーズ",
        progress: existing?.progress || freshProgress(),
        createdAt: existing?.createdAt || Date.now(),
      });
      if (existing) {
        normalized.id = existing.id;
        state.words[state.words.indexOf(existing)] = normalized;
        updated += 1;
      } else {
        state.words.push(normalized);
        existingByWord.set(normalized.word.toLowerCase(), normalized);
        added += 1;
      }
    });
    saveState();
    renderDashboard();
    renderLibrary();
    $("#photo-dialog").close();
    showToast(`${added}語を追加しました${updated ? `（${updated}語を更新）` : ""}`);
  }

  function resetProgress() {
    if (!confirm("登録単語は残したまま、すべての学習履歴をリセットしますか？")) return;
    state.words.forEach((word) => { word.progress = freshProgress(); });
    state.activity = {};
    saveState();
    renderDashboard();
    renderLibrary();
    showToast("学習履歴をリセットしました");
  }

  function speakCurrentWord() {
    const word = currentWord();
    if (!word || !("speechSynthesis" in window)) return showToast("このブラウザでは音声再生を利用できません", "error");
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word.word);
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    speechSynthesis.speak(utterance);
  }

  $$('[data-nav]').forEach((button) => button.addEventListener("click", () => navigate(button.dataset.nav)));
  $("#start-random-button").addEventListener("click", () => startSession("all"));
  $("#start-wrong-all-button").addEventListener("click", () => startSession("wrong-all"));
  $("#start-all-button").addEventListener("click", () => startSession("all"));
  $("#start-weak-button").addEventListener("click", () => startSession("weak"));
  $$('[data-review-band]').forEach((button) => button.addEventListener("click", () => startSession(`band:${button.dataset.reviewBand}`)));
  $$('[data-review-wrong-band]').forEach((button) => button.addEventListener("click", () => startSession(`band-wrong:${button.dataset.reviewWrongBand}`)));
  $("#study-close").addEventListener("click", () => navigate("home"));
  $("#choice-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-choice-id]");
    if (button) answerCurrent(button.dataset.choiceId);
  });
  $("#next-button").addEventListener("click", nextQuestion);
  $("#speak-button").addEventListener("click", speakCurrentWord);
  $("#result-again").addEventListener("click", () => startSession(lastSessionMode));
  $("#add-word-button").addEventListener("click", () => openWordDialog());
  $("#add-word-data-button").addEventListener("click", () => openWordDialog());
  $("#open-photo-ocr").addEventListener("click", openPhotoDialog);
  $("#photo-dialog-close").addEventListener("click", closePhotoDialog);
  $("#photo-cancel").addEventListener("click", closePhotoDialog);
  $("#photo-camera").addEventListener("change", async (event) => {
    await selectPhotos(event.target.files, { append: true });
    event.target.value = "";
  });
  $("#photo-file").addEventListener("change", async (event) => {
    await selectPhotos(event.target.files);
    event.target.value = "";
  });
  $("#photo-rotate-left").addEventListener("click", () => { photoRotation -= 90; renderPhotoPreview(); });
  $("#photo-rotate-right").addEventListener("click", () => { photoRotation += 90; renderPhotoPreview(); });
  $("#photo-crop").addEventListener("change", renderPhotoPreview);
  $("#photo-read").addEventListener("click", readPhotos);
  $("#photo-add-row").addEventListener("click", () => { photoCandidates.push(blankPhotoCandidate()); renderPhotoCandidates(); });
  $("#photo-reparse").addEventListener("click", reparsePhotoText);
  $("#photo-import").addEventListener("click", importPhotoCandidates);
  $("#photo-candidate-list").addEventListener("input", (event) => {
    const index = Number(event.target.dataset.photoIndex);
    const candidate = photoCandidates[index];
    if (!candidate) return;
    if (event.target.matches("[data-photo-include]")) {
      candidate.include = event.target.checked;
      event.target.closest(".photo-candidate").classList.toggle("is-unchecked", !candidate.include);
      return;
    }
    const field = event.target.dataset.photoField;
    if (field) candidate[field] = event.target.value;
  });
  $("#photo-candidate-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-photo-remove]");
    if (!button) return;
    photoCandidates.splice(Number(button.dataset.photoRemove), 1);
    renderPhotoCandidates();
  });
  $("#word-form").addEventListener("submit", saveWordFromForm);
  $("#dialog-close").addEventListener("click", () => $("#word-dialog").close());
  $("#dialog-cancel").addEventListener("click", () => $("#word-dialog").close());
  $("#delete-word").addEventListener("click", deleteCurrentWord);
  $("#word-table-body").addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-id]");
    if (button) openWordDialog(button.dataset.editId);
  });
  ["#word-search", "#status-filter", "#band-filter"].forEach((selector) => $(selector).addEventListener("input", renderLibrary));
  $("#reset-progress").addEventListener("click", resetProgress);

  document.addEventListener("keydown", (event) => {
    if (!$("#view-study").classList.contains("is-active") || ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    if (event.code === "Enter" && session?.answeredCurrent) { event.preventDefault(); nextQuestion(); return; }
    if (event.code === "Digit5" && !session?.answeredCurrent) { event.preventDefault(); answerCurrent(UNKNOWN_CHOICE_ID); return; }
    const indexByKey = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };
    const index = indexByKey[event.code];
    if (index !== undefined && session?.currentChoices[index] && !session.answeredCurrent) answerCurrent(session.currentChoices[index].id);
  });

  renderDashboard();
  renderLibrary();
})();
