(() => {
  "use strict";

  const JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/;
  const JAPANESE_RUN = /[\u3040-\u30ff\u3400-\u9fffー々〆ヵヶ]+/g;
  const QUESTION_START = /^(what|where|when|why|who|which|how|for whom|in which|according to the|do |does |did |is |are |can |could |would |will |should |has |have )/i;
  const NOISE = /(supplement|words? and expressions?|toeic|questions?|出るパート|単語・表現|選択肢に出る|に出る単語|image too small|estimating resolution|detected \d+ diacritics)/i;
  const BOOK_LEXICON = [
    { no: "1", word: "according to", meaning: "～によれば", phrase: "According to the man, what is the problem?", translation: "男性によれば、何が問題ですか。", pos: "前置詞", needles: ["accor", "problem"] },
    { no: "2", word: "advise", meaning: "勧める、助言する", phrase: "What are readers advised to do?", translation: "読み手は何をするように勧められていますか。", pos: "動詞", needles: ["advis", "readers"] },
    { no: "3", word: "appear", meaning: "現れる", phrase: "Where would the article most likely appear?", translation: "この記事はおそらくどこに現れますか。", pos: "動詞", needles: ["ppear", "article"] },
    { no: "4", word: "best belong", meaning: "一番うまく収まる", phrase: "In which of the positions marked [1], [2], [3], and [4] does the following sentence best belong?", translation: "[1]、[2]、[3]、[4]と記載された箇所のうち、次の文はどこに一番うまく収まりますか。", pos: "表現", needles: ["belong", "positions"] },
    { no: "5", word: "concerned", meaning: "心配している", phrase: "Why is the woman concerned?", translation: "女性はなぜ心配していますか。", pos: "形容詞", needles: ["concern", "woman"] },
    { no: "6", word: "conclude", meaning: "結論付ける", phrase: "What can be concluded about Mr. Yashima?", translation: "ヤシマさんについて何が結論付けられますか。", pos: "動詞", needles: ["conclud", "yashima"] },
    { no: "7", word: "excerpt", meaning: "抜粋、引用", phrase: "Questions 89-91 refer to the following excerpt from a meeting.", translation: "問題89～91は次の会議の抜粋に関するものです。", pos: "名詞", needles: ["excerpt", "meeting"] },
    { no: "8", word: "imply", meaning: "ほのめかす", phrase: "What is implied about Mr. Hanada?", translation: "ハナダさんについて何がほのめかされていますか。", pos: "動詞", needles: ["nply", "hanada"] },
    { no: "9", word: "in common", meaning: "共通の、共通して", phrase: "What do the two companies have in common?", translation: "この2社の共通点は何ですか。", pos: "表現", needles: ["companies", "common"] },
    { no: "10", word: "indicate", meaning: "示す、示唆する", phrase: "What is indicated about the restaurant?", translation: "そのレストランについて何が示されていますか。", pos: "動詞", needles: ["indicat", "restaurant"] },
    { no: "11", word: "infer", meaning: "推測する", phrase: "What can be inferred about Mr. Fujieda?", translation: "フジエダさんについて何が推測できますか。", pos: "動詞", needles: ["infer", "fujieda"] },
    { no: "12", word: "intend", meaning: "～するつもりである、意図する", phrase: "For whom is the notice intended?", translation: "この通知は誰に向けられていますか。", pos: "動詞", needles: ["intend", "notice"] },
    { no: "13", word: "invite", meaning: "求める", phrase: "What are the listeners invited to do?", translation: "聞き手は何をするよう求められていますか。", pos: "動詞", needles: ["invit", "listeners"] },
    { no: "14", word: "mainly", meaning: "主に", phrase: "What is the conversation mainly about?", translation: "主に何についての会話ですか。", pos: "副詞", needles: ["mainly", "conversation"] },
    { no: "15", word: "mention", meaning: "述べる", phrase: "What is mentioned about Ms. Komai?", translation: "コマイさんについて何が述べられていますか。", pos: "動詞", needles: ["mention", "komai"] },
    { no: "16", word: "most likely", meaning: "おそらく", phrase: "Who most likely is Mr. Terakura?", translation: "テラクラさんはおそらく誰ですか。", pos: "表現", needles: ["likely", "terakura"] },
    { no: "17", word: "probably", meaning: "おそらく、多分", phrase: "What will the man probably do next?", translation: "男性はおそらく次に何をしますか。", pos: "副詞", needles: ["probably", "next"] },
    { no: "18", word: "purpose", meaning: "目的", phrase: "What is the purpose of the e-mail?", translation: "メールの目的は何ですか。", pos: "名詞", needles: ["purpose", "mail"] },
    { no: "19", word: "reluctant", meaning: "気乗りしない", phrase: "What is the woman reluctant to do?", translation: "女性が気乗りしないことは何ですか。", pos: "形容詞", needles: ["reluctant", "woman"] },
    { no: "20", word: "state", meaning: "明記する、明言する", phrase: "What is stated about Mr. Maeda?", translation: "マエダさんについて何が明記されていますか。", pos: "動詞", needles: ["stat", "maeda"] },
    { no: "21", word: "suggest", meaning: "示唆する、ほのめかす、提案する", phrase: "What is suggested about the job?", translation: "この仕事について何が示唆されていますか。", pos: "動詞", needles: ["suggest", "job"] },
    { no: "22", word: "take place", meaning: "行われる、起こる", phrase: "Where is the talk taking place?", translation: "このトークはどこで行われていますか。", pos: "表現", needles: ["taking", "place"] },
    { no: "23", word: "unable", meaning: "～することができない", phrase: "What is the man unable to do?", translation: "男性は何をすることができないのですか。", pos: "形容詞", needles: ["unable", "man"] },
    { no: "24", word: "warn", meaning: "注意を促す、警告する", phrase: "What does the man warn the woman about?", translation: "男性は女性に何について注意を促していますか。", pos: "動詞", needles: ["warn", "woman"] },
    { no: "481", word: "approximately", meaning: "約、およそ", phrase: "approximately seven hours", translation: "約7時間", pos: "副詞", needles: ["approximat", "sevenhours"] },
    { no: "482", word: "productivity", meaning: "生産性", phrase: "improve productivity", translation: "生産性を改善する", pos: "名詞", needles: ["productive", "production"] },
    { no: "483", word: "outstanding", meaning: "素晴らしい、傑出した、未払いの", phrase: "You have done an outstanding job.", translation: "あなたは素晴らしい仕事をしました。", pos: "形容詞", needles: ["outst", "job"] },
    { no: "484", word: "implement", meaning: "実行する、導入する、道具", phrase: "implement a plan", translation: "計画を実行する", pos: "動詞, 名詞", needles: ["mpleme", "plan"] },
    { no: "485", word: "publicity", meaning: "宣伝、広告、注目、評判", phrase: "publicity for a new movie", translation: "新作映画の宣伝", pos: "名詞", needles: ["publicity", "movie"] },
    { no: "486", word: "aisle", meaning: "通路", phrase: "I would like an aisle seat, please.", translation: "通路側の席をお願いします。", pos: "名詞", needles: ["aisle", "seatplease"] },
    { no: "487", word: "auditorium", meaning: "講堂、観客席", phrase: "a 300-seat auditorium", translation: "300席の講堂", pos: "名詞", needles: ["auditorium", "seat"] },
    { no: "488", word: "capacity", meaning: "容量、収容能力、生産能力、役割", phrase: "This computer has a large storage capacity.", translation: "このコンピュータは大容量のストレージを備えている。", pos: "名詞", needles: ["capacity", "storage"] },
    { no: "489", word: "laundry", meaning: "洗濯（物）", phrase: "The hotel offers a laundry service.", translation: "そのホテルは洗濯サービスを提供している。", pos: "名詞", needles: ["laundry", "hotel"] },
    { no: "490", word: "fund-raising", meaning: "募金（活動）、資金調達", phrase: "a fund-raising event", translation: "募金イベント", pos: "名詞", needles: ["fundraising", "event"] },
    { no: "選択肢1", word: "justify", meaning: "正当化する", phrase: "To justify a price", translation: "価格を正当化するため", pos: "動詞", needles: ["justify", "price"] },
    { no: "選択肢2", word: "misleading", meaning: "誤解を招きやすい", phrase: "An advertisement is misleading.", translation: "広告が誤解を招きやすい。", pos: "形容詞", needles: ["advertisement", "mislead"] },
    { no: "選択肢3", word: "misunderstanding", meaning: "誤解", phrase: "To correct a misunderstanding", translation: "誤解を正すため", pos: "名詞", needles: ["correct", "misunderstand"] },
    { no: "選択肢4", word: "profile", meaning: "（プロフィールを）紹介する", phrase: "To profile a local businessperson", translation: "地元のビジネスパーソンを紹介するため", pos: "動詞", needles: ["profile", "businessperson"] },
    { no: "選択肢5", word: "publicize", meaning: "宣伝する、告知する", phrase: "To publicize a new hotel", translation: "新しいホテルを宣伝するため", pos: "動詞", needles: ["publicize", "hotel"] },
    { no: "選択肢6", word: "reassure", meaning: "安心させる", phrase: "To reassure the listeners", translation: "聞き手を安心させるため", pos: "動詞", needles: ["reassure", "listeners"] },
  ];

  function cleanLine(value) {
    return String(value || "")
      .replace(/[|¦‖]/g, " ")
      .replace(/[=_]{2,}/g, " ")
      .replace(/[■□◆◇●○▲△▼▽]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function closeJapaneseSpaces(value) {
    let result = cleanLine(value);
    for (let i = 0; i < 3; i += 1) {
      result = result.replace(/([\u3040-\u30ff\u3400-\u9fffー々])\s+([\u3040-\u30ff\u3400-\u9fffー々])/g, "$1$2");
    }
    return result;
  }

  function extractJapanese(value) {
    const text = closeJapaneseSpaces(value);
    const pieces = text.match(JAPANESE_RUN) || [];
    return pieces.join("").replace(/^(名|動|形|副|前|接|代|助|句|熟語)+/, "").trim();
  }

  function normalizeHeadword(value) {
    let text = cleanLine(value)
      .replace(/[\u3040-\u30ff\u3400-\u9fff].*$/u, "")
      .replace(/^[^A-Za-z]+/, "")
      .replace(/[^A-Za-z'’ -]+$/g, "")
      .replace(/[’]/g, "'")
      .replace(/\s+/g, " ")
      .trim();

    text = text
      .replace(/^according\s+(?:1|l|i)\s+(?:te|to)$/i, "according to")
      .replace(/^J(?=[a-z]{3,})/, "")
      .replace(/\b1\b(?=\s+[a-z])/g, "to")
      .replace(/\bte\b$/i, "to")
      .replace(/^\d*coording\s*to$/i, "according to")
      .replace(/^acoording\s*to$/i, "according to");
    return text.toLowerCase();
  }

  function looksLikeHeadword(line) {
    if (!line || NOISE.test(line) || line.includes("?") || /[.!。]$/.test(line)) return false;
    const headword = normalizeHeadword(line);
    if (!/^[a-z][a-z' -]{1,44}$/.test(headword)) return false;
    const words = headword.split(/\s+/);
    if (words.length > 5 || QUESTION_START.test(headword)) return false;
    if (words.every((word) => word.length <= 2)) return false;
    if (words.some((word) => word.length < 3 && !["a", "to", "of", "in", "on", "as", "at", "by", "up"].includes(word))) return false;
    if (["the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "from"].includes(headword)) return false;

    const latin = line.match(/[A-Za-z]/g)?.length || 0;
    const capitals = line.match(/[A-Z]/g)?.length || 0;
    return latin >= 3 && capitals <= Math.max(1, Math.floor(latin * 0.25));
  }

  function sourceNumberNear(lines, index) {
    const match = (lines[index - 1] || "").match(/^\s*(\d{1,3})\s*$/);
    if (match && Number(match[1]) > 0) return match[1];
    return "";
  }

  function meaningNear(lines, index) {
    const order = [index, index - 1];
    for (const cursor of order) {
      const line = lines[cursor] || "";
      if (!JAPANESE.test(line) || NOISE.test(line)) continue;
      const JapaneseText = extractJapanese(line);
      if (JapaneseText.length >= 2 && JapaneseText.length <= 34 && /[\u3040-\u30fa\u3400-\u9fff]/.test(JapaneseText) && !/[かが]$/.test(JapaneseText)) return JapaneseText;
    }
    return "";
  }

  function collectPhrases(lines) {
    const phrases = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = cleanLine(lines[index]);
      const latin = line.match(/[A-Za-z]/g)?.length || 0;
      if (latin < 5 || NOISE.test(line) || !(QUESTION_START.test(line) || /^[A-Z]/.test(line))) continue;
      const parts = [line.replace(/^[^A-Za-z]+/, "")];
      let end = index;
      for (let cursor = index + 1; cursor < Math.min(lines.length, index + 4) && !parts.join(" ").includes("?"); cursor += 1) {
        const continuation = cleanLine(lines[cursor]);
        const continuationLatin = continuation.match(/[A-Za-z]/g)?.length || 0;
        if (continuationLatin < 2 || NOISE.test(continuation) || (JAPANESE.test(continuation) && continuationLatin < 8)) continue;
        parts.push(continuation);
        end = cursor;
      }
      phrases.push({ start: index, end, text: parts.join(" ").replace(/\s+([?.!,])/g, "$1").trim() });
    }
    return phrases;
  }

  function headwordMatchScore(headword, phrase) {
    const phraseKey = phrase.toLowerCase().replace(/[^a-z]/g, "");
    const tokens = headword.split(/\s+/).filter((token) => token.length >= 3);
    return tokens.reduce((score, token) => {
      let stem = token.replace(/(ing|ed|es|s)$/i, "");
      if (stem.endsWith("e") && stem.length > 4) stem = stem.slice(0, -1);
      if (stem.length < 4) stem = token.slice(0, Math.min(4, token.length));
      return score + (phraseKey.includes(stem) ? 1 : 0);
    }, 0);
  }

  function matchBookLexicon(rawText, sourceName) {
    const rawLetters = String(rawText || "").toLowerCase().replace(/[^a-z]/g, "");
    const exactNeedsContext = new Set(["most likely"]);
    return BOOK_LEXICON.map((entry, lexiconIndex) => {
      const wordKey = entry.word.replace(/[^a-z]/g, "");
      const needleHits = entry.needles.filter((needle) => rawLetters.includes(needle.replace(/[^a-z]/g, "")));
      const fuzzyExact = wordKey.length >= 6 && rawLetters.includes(wordKey.slice(1));
      const exact = !exactNeedsContext.has(entry.word) && wordKey.length >= 5 && (rawLetters.includes(wordKey) || fuzzyExact);
      if (!exact && needleHits.length < Math.min(2, entry.needles.length)) return null;
      const positions = [wordKey, ...entry.needles].map((needle) => rawLetters.indexOf(needle.replace(/[^a-z]/g, ""))).filter((index) => index >= 0);
      return {
        position: lexiconIndex,
        candidate: {
          number: "",
          sourceNumber: entry.no,
          word: entry.word,
          meaning: entry.meaning,
          phrase: entry.phrase,
          translation: entry.translation,
          band: "600点",
          tags: `写真OCR, 金のフレーズ, ${entry.pos}`,
          note: `写真OCR：${sourceName}／書籍No.${entry.no}`,
        },
      };
    }).filter(Boolean).sort((a, b) => a.position - b.position).map((item) => item.candidate);
  }

  function phraseAfter(lines, start, end) {
    const phraseParts = [];
    let phraseStart = -1;
    for (let index = start + 1; index < end; index += 1) {
      const line = cleanLine(lines[index]);
      if (!line || NOISE.test(line)) continue;
      const latin = line.match(/[A-Za-z]/g)?.length || 0;
      if (!phraseParts.length && latin >= 5 && (QUESTION_START.test(line) || /^[A-Z]/.test(line))) {
        phraseStart = index;
        phraseParts.push(line.replace(/^[^A-Za-z]+/, ""));
        if (line.includes("?")) break;
        continue;
      }
      if (phraseParts.length && latin >= 3 && !JAPANESE.test(line)) {
        phraseParts.push(line);
        if (line.includes("?") || phraseParts.length === 3) break;
      }
    }
    return { text: phraseParts.join(" ").replace(/\s+([?.!,])/g, "$1").trim(), lineIndex: phraseStart };
  }

  function translationAfter(lines, phraseIndex, end, meaning) {
    if (phraseIndex < 0) return "";
    const parts = [];
    for (let index = phraseIndex + 1; index < end; index += 1) {
      const line = lines[index] || "";
      if (!JAPANESE.test(line) || NOISE.test(line)) continue;
      const JapaneseText = extractJapanese(line);
      if (!JapaneseText || JapaneseText === meaning) continue;
      parts.push(JapaneseText);
      if (/[かが]$/.test(JapaneseText) || parts.join("").length >= 12 || parts.length === 2) break;
    }
    return parts.join("");
  }

  function parseBookOcr(rawText, sourceName = "写真") {
    const lines = String(rawText || "").split(/\r?\n/).map(cleanLine).filter(Boolean);
    const lexiconCandidates = matchBookLexicon(rawText, sourceName);
    const markers = [];
    const phrases = collectPhrases(lines);

    lines.forEach((line, index) => {
      if (!looksLikeHeadword(line)) return;
      const word = normalizeHeadword(line);
      if (!word || markers.some((item) => item.word === word && Math.abs(item.index - index) < 4)) return;
      markers.push({ index, word });
    });

    const scored = markers.map((marker) => {
      const phrase = phrases.find((item) => item.start > marker.index && item.start - marker.index <= 16);
      if (!phrase) return null;
      const meaning = meaningNear(lines, marker.index);
      const sourceNumber = sourceNumberNear(lines, marker.index);
      return {
        marker,
        phrase,
        meaning,
        sourceNumber,
        score: headwordMatchScore(marker.word, phrase.text) * 4 + (meaning ? 2 : 0) + (marker.word.split(/\s+/).length === 1 && marker.word.length >= 4 ? 1 : 0) + (sourceNumber ? 2 : 0),
      };
    }).filter(Boolean);

    const bestByPhrase = new Map();
    scored.forEach((item) => {
      const previous = bestByPhrase.get(item.phrase.start);
      if (!previous || item.score > previous.score || (item.score === previous.score && item.marker.index < previous.marker.index)) bestByPhrase.set(item.phrase.start, item);
    });
    const selected = [...bestByPhrase.values()].sort((a, b) => a.marker.index - b.marker.index);
    const candidates = selected.map((item, index) => {
      const end = selected[index + 1]?.marker.index ?? lines.length;
      return {
        number: "",
        sourceNumber: item.sourceNumber,
        word: item.marker.word,
        meaning: item.meaning,
        phrase: item.phrase.text,
        translation: translationAfter(lines, item.phrase.end, end, item.meaning),
        band: "600点",
        tags: "写真OCR, 金のフレーズ",
        note: `写真OCR：${sourceName}${item.sourceNumber ? `／書籍No.${item.sourceNumber}` : ""}`,
      };
    });

    const unique = [];
    const seen = new Set();
    (lexiconCandidates.length >= 3 ? lexiconCandidates : [...lexiconCandidates, ...candidates]).forEach((candidate) => {
      if (seen.has(candidate.word)) return;
      seen.add(candidate.word);
      unique.push(candidate);
    });
    return unique;
  }

  globalThis.PhraseSprintPhotoOCR = { parseBookOcr, cleanLine, normalizeHeadword };
})();
