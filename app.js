"use strict";
// ===================== 基本ユーティリティ =====================
const $ = (s) => document.querySelector(s);
const app = $("#app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rid = () => Math.random().toString(36).slice(2, 10);
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};
// ===================== 効果音（Web Audio で合成。音声ファイルは使わない） =====================
const Sound = {
  ctx: null,
  unlock() { // ブラウザは操作があるまで音を出せないので、最初のクリック/キーで準備する
    if (!this.ctx) { const A = window.AudioContext || window.webkitAudioContext; if (A) this.ctx = new A(); }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },
  tone(freq, start, dur, { type = "sine", vol = 0.25, attack = 0.005, filter = null } = {}) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + start;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = filter; o.connect(f); node = f; }
    node.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise(start, dur, { vol = 0.2, hp = 1000, lp = 12000 } = {}) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + start, len = Math.ceil(ctx.sampleRate * dur), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(), h = ctx.createBiquadFilter(), l = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = b; h.type = "highpass"; h.frequency.value = hp; l.type = "lowpass"; l.frequency.value = lp;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(h); h.connect(l); l.connect(g); g.connect(ctx.destination); s.start(t); s.stop(t + dur);
  },
  // 出題：「ジャン！」（和音を一発＋シンバル。se.html の候補3を本人が選択・2026-11-27）
  start() {
    for (const f of [261.6, 329.6, 392, 523.3]) this.tone(f, 0, 0.8, { type: "sawtooth", vol: 0.09, filter: 3000 });
    this.tone(130.8, 0, 0.8, { type: "square", vol: 0.12, filter: 800 });
    this.noise(0, 0.9, { vol: 0.12, hp: 5000 });
  },
  // 早押し：「ピロリローン」
  buzz() {
    [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, i * 0.055, 0.09, { type: "triangle", vol: 0.22 }));
    this.tone(2093, 0.22, 0.45, { type: "triangle", vol: 0.2 });
    this.tone(2637, 0.22, 0.45, { type: "sine", vol: 0.08 });
  },
  // 正解：「ピンポーン」
  correct() {
    this.tone(1319, 0, 0.35, { vol: 0.3 }); this.tone(2638, 0, 0.2, { vol: 0.06 });
    this.tone(1047, 0.3, 0.9, { vol: 0.3 }); this.tone(2094, 0.3, 0.5, { vol: 0.06 });
  },
  // 不正解：「ブブー」
  wrong() {
    this.tone(140, 0, 0.14, { type: "square", vol: 0.18, attack: 0.01, filter: 900 });
    this.tone(140, 0.2, 0.55, { type: "square", vol: 0.18, attack: 0.01, filter: 900 });
  },
};
document.addEventListener("pointerdown", () => Sound.unlock(), true);
document.addEventListener("keydown", () => Sound.unlock(), true);

// 一時停止できるタイマー（registry ごとにまとめて止める・再開する）
class PTimer {
  constructor(reg, fn, ms) { this.reg = reg; this.fn = fn; this.left = ms; reg.add(this); if (!reg.paused) this.run(); }
  run() { if (this.id || this.done) return; this.t0 = performance.now(); this.id = setTimeout(() => { this.id = null; this.done = true; this.reg.delete(this); this.fn(); }, Math.max(0, this.left)); }
  hold() { if (!this.id) return; clearTimeout(this.id); this.id = null; this.left -= performance.now() - this.t0; }
  cancel() { clearTimeout(this.id); this.id = null; this.done = true; this.reg.delete(this); }
}
function makeRegistry() {
  const r = new Set(); r.paused = false;
  r.pause = () => { r.paused = true; for (const t of r) t.hold(); };
  r.resume = () => { r.paused = false; for (const t of [...r]) t.run(); };
  return r;
}
const THUMB_DOWN = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"/></svg>`;
// スマホなどタッチ操作の端末か（キーボードの案内を出し分ける）
const TOUCH = window.matchMedia && matchMedia("(pointer: coarse)").matches;
const QMAP = Object.fromEntries(window.QUESTIONS.map((q) => [q.id, q]));

// ===================== プロフィール・ランク =====================
let profile = LS.get("ehq.profile", null);
if (!profile) { profile = { id: rid(), name: "ゲスト" + Math.floor(Math.random() * 900 + 100), rating: 1000, games: 0 }; LS.set("ehq.profile", profile); }
const saveProfile = () => { LS.set("ehq.profile", profile); drawMe(); };
// レーティング → ランク（境界は暫定）
const RANKS = [["S", 1500], ["A", 1300], ["B", 1100], ["C", -Infinity]];
const rankOf = (r) => RANKS.find(([, t]) => r >= t)[0];
const RANK_TARGET = { C: 0.7, B: 0.55, A: 0.4, S: 0.25 }; // そのランクの部屋で狙う正答率
function drawMe() {
  $("#me-box").innerHTML = `${esc(profile.name)} <span class="rank">${rankOf(profile.rating)}</span> ${Math.round(profile.rating)}`;
}

// ===================== 問題の統計（正答率・ブーイング・問題レーティング） =====================
// 構造: stats[qid] = { seen, answered, correct, byRank:{C:{answered,correct},...}, rating, boo:{correct,wrong,none},
//                     pos:[10]（正解者が押した位置：問題文の0-10%,10-20%,…の件数）, booReasons:[{key,cat,name,reasons,text,at}] }
// rating は「問題のレーティング」（将来案）。強い人が間違えると上がる。
let stats = LS.get("ehq.stats", {});
const saveStats = () => LS.set("ehq.stats", stats);
function qs(id) {
  if (!stats[id]) stats[id] = { seen: 0, answered: 0, correct: 0, byRank: {}, rating: 1000, boo: { correct: 0, wrong: 0, none: 0 } };
  return stats[id];
}
// 利用者が少ないうちは全体の正答率、ランク別のデータが溜まったらランク別を使う
const RANK_MIN_SAMPLES = 10;
function accuracyFor(id, rank) {
  const s = stats[id];
  if (!s) return null;
  const br = s.byRank[rank];
  if (br && br.answered >= RANK_MIN_SAMPLES) return br.correct / br.answered;
  if (s.answered >= 3) return s.correct / s.answered;
  return null;
}
const BOO_REASONS = ["答えが複数ありうる", "事実の誤り", "易しすぎる", "難しすぎる", "問題文が分かりにくい", "読み・選択肢がおかしい", "その他"];
const isBadCandidate = (s) => s && s.boo.correct >= 2 && s.boo.correct >= Math.max(1, s.correct) * 0.2;
const POS_BINS = 10;
const posBin = (pos) => Math.min(POS_BINS - 1, Math.max(0, Math.floor(pos * POS_BINS)));
function recordReveal(q, results, players) {
  const s = qs(q.id);
  s.pos ||= Array(POS_BINS).fill(0);
  s.seen += players.length;
  for (const [pid, r] of Object.entries(results)) {
    const p = players.find((x) => x.id === pid);
    const rating = p ? p.rating : 1000;
    const rk = rankOf(rating);
    s.answered++; if (r.ok) s.correct++;
    if (r.ok && typeof r.pos === "number") s.pos[posBin(r.pos)]++;
    const br = (s.byRank[rk] ||= { answered: 0, correct: 0 });
    br.answered++; if (r.ok) br.correct++;
    // 問題レーティング（Elo）：プレイヤーが正解＝問題の負け
    const e = 1 / (1 + 10 ** ((rating - s.rating) / 400));
    s.rating += 16 * ((r.ok ? 0 : 1) - e);
  }
  saveStats();
}

// ===================== 自分の成績（アカウント単位） =====================
// 将来アカウント機能（端末をまたいだ同期）を作るときに丸ごと移せるよう、プロフィールIDごとに分けて保存する。
// 構造: { total:{seen,answered,correct}, genre:{[ジャンル]:{seen,answered,correct}}, pos:[10]（正解時の押し位置）, posWrong:[10] }
const myKey = () => "ehq.me." + profile.id;
let me = LS.get(myKey(), null) || { total: { seen: 0, answered: 0, correct: 0 }, genre: {}, pos: Array(POS_BINS).fill(0), posWrong: Array(POS_BINS).fill(0) };
const saveMe = () => LS.set(myKey(), me);
function recordMine(q, r) {
  const gs = (me.genre[q.genre] ||= { seen: 0, answered: 0, correct: 0 });
  for (const t of [me.total, gs]) { t.seen++; if (r) { t.answered++; if (r.ok) t.correct++; } }
  if (r && typeof r.pos === "number") (r.ok ? me.pos : me.posWrong)[posBin(r.pos)]++;
  saveMe();
}
// 押し位置の分布（10%刻みの棒グラフ）
function posChart(bins, label) {
  const n = bins.reduce((a, b) => a + b, 0), max = Math.max(1, ...bins);
  return `<div class="pos-chart" title="${esc(label)}">${bins.map((v, i) => `<div class="pos-col"><div class="pos-bar" style="height:${Math.round((60 * v) / max)}px"></div><div class="pos-v">${v || ""}</div><div class="pos-l">${i * 10}%</div></div>`).join("")}</div><div class="muted">${esc(label)}（${n}件）</div>`;
}
const posAvg = (bins) => { const n = bins.reduce((a, b) => a + b, 0); return n ? Math.round(bins.reduce((a, v, i) => a + v * (i * 10 + 5), 0) / n) : null; };

// ===================== かな処理 =====================
const toHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
function norm(s) {
  s = String(s).normalize("NFKC");
  s = toHira(s);
  return s.replace(/[\s・、。.,，．!！?？「」『』（）()＝=〜~"'’]/g, "");
}
function acceptSet(q) {
  return new Set([q.answer, q.reading, ...(q.accept || [])].map(norm));
}
// ----- 音声・文字入力の正誤判定 -----
// 方針（本人の要望）: 表記ゆれで正解を×にしないことを優先する。多少甘くて誤って○になるのは許容。
// 1) 表記の正規化（カタカナ/ひらがな・ヴ/バ行・ぢ/じ・づ/ず・長音・大文字小文字）
// 2) 「料理」「県」「川」などの分類語は、付いていても付いていなくても○（トルコ料理 ← トルコ）
// 3) 漢字とかなの混ぜ書きは○（長谷川町子 ← 長谷川まちこ）
// 4) かなで答えたときの1文字違い（読みが5文字以上）、2文字違い（9文字以上）は○
const isKana = (s) => /^[ぁ-ゖ]+$/.test(s);
function loose(s) {
  return norm(s).toLowerCase()
    .replace(/ゔぁ/g, "ば").replace(/ゔぃ/g, "び").replace(/ゔぇ/g, "べ").replace(/ゔぉ/g, "ぼ").replace(/ゔ/g, "ぶ")
    .replace(/ぢ/g, "じ").replace(/づ/g, "ず").replace(/ー/g, "");
}
// 分類語 [表記, 読み…]。答えがこの表記で終わるときだけ、表記と読みの両方から外した形も正解にする（トルコ料理 → トルコ）。
// 「星」「人」「教」は外すと別の答えになる（金星→金、仏教→仏）ので入れない
const SUFFIX_PAIRS = [
  ["料理", "りょうり"], ["県", "けん"], ["府", "ふ"], ["都", "と"], ["道", "どう"], ["市", "し"], ["町", "まち", "ちょう"], ["村", "むら", "そん"], ["区", "く"],
  ["川", "がわ", "かわ"], ["山", "さん", "やま", "ざん"], ["島", "しま", "じま", "とう"], ["湖", "こ"], ["駅", "えき"], ["語", "ご"],
  ["座", "ざ"], ["寺", "じ", "でら", "てら"], ["神社", "じんじゃ"], ["城", "じょう"], ["城郭", "じょうかく"], ["博士", "はかせ"], ["先生", "せんせい"],
  ["さん", "さん"], ["くん", "くん"], ["ちゃん", "ちゃん"], ["様", "さま"], ["大王", "だいおう"], ["警部", "けいぶ"], ["天皇", "てんのう"], ["運河", "うんが"], ["海峡", "かいきょう"],
  ["砂漠", "さばく"], ["山脈", "さんみゃく"], ["諸島", "しょとう"], ["大陸", "たいりく"], ["海", "かい", "うみ"], ["半島", "はんとう"], ["の滝", "のたき"], ["滝", "たき"],
  ["祭り", "まつり"], ["祭", "まつり", "さい"], ["公園", "こうえん"], ["条約", "じょうやく"], ["事件", "じけん"], ["の戦い", "のたたかい"], ["の乱", "のらん"],
  ["時代", "じだい"], ["幕府", "ばくふ"], ["星団", "せいだん"], ["星雲", "せいうん"],
].map((xs) => xs.map(loose)).sort((a, b) => b[0].length - a[0].length);
// 外しても別の答えになりにくい語（これ以外で外した形は、ほかの問題の答えと同じなら正解にしない）
const SAFE_SUFFIXES = new Set(["料理", "県", "府", "都", "語", "さん", "くん", "ちゃん", "様", "先生", "博士"].map(loose));
// 入力側から外すのは SAFE_SUFFIXES だけ（「東京都」→「東京」など）
// かな1文字の読み（と・ふ・ご）は外すと別の言葉になりやすいので除く（まひと→まひ）
const INPUT_SUFFIXES = SUFFIX_PAIRS.filter(([k]) => SAFE_SUFFIXES.has(k)).flat().filter((x) => !(x.length === 1 && isKana(x))).sort((a, b) => b.length - a.length);
// 全問題の答え・読み・別解（ほかの問題の答えを甘い判定で正解にしないために使う）
const KNOWN_ANSWERS = new Set(window.QUESTIONS.flatMap((q) => [q.answer, q.reading, ...(q.accept || [])].map(loose)));
// 答えの表記と読みから、分類語を外した [表記, 読み, 安全か] の組を作る
function answerPairs(q) {
  const rd = loose(q.reading), out = [];
  for (const f of [q.answer, ...(q.accept || [])].map(loose)) {
    out.push([f, rd, true]);
    for (const [k, ...rs] of SUFFIX_PAIRS) {
      if (!f.endsWith(k) || f.length - k.length < 1) continue;
      const rr = rs.find((r) => rd.endsWith(r) && rd.length - r.length >= 2);
      if (rr) out.push([f.slice(0, -k.length), rd.slice(0, -rr.length), SAFE_SUFFIXES.has(k)]);
    }
  }
  return out;
}
function inputVariants(s) {
  const v = new Set([s, s.replace(/です$/, ""), s.replace(/^(こたえは|えーと|えっと)/, ""), s.replace(/^(株式会社|かぶしきがいしゃ)|(株式会社|かぶしきがいしゃ)$/, "")]);
  for (const x of [...v]) for (const suf of INPUT_SUFFIXES) if (x.length - suf.length >= 2 && x.endsWith(suf)) v.add(x.slice(0, -suf.length));
  return [...v].filter(Boolean);
}
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// 漢字とかなの混ぜ書き: 漢字部分は答えの表記に、かな部分は読みに、順番どおり含まれていればよい
function mixedMatch(inp, ans, rd) {
  const segs = inp.match(/[ぁ-ゖ]+|[^ぁ-ゖ]+/g) || [];
  if (segs.length < 2 || !segs.some(isKana) || segs.every(isKana)) return false;
  let pa = 0, pr = 0, covered = 0;
  for (let i = 0; i < segs.length; i++) {
    const g = segs[i], kana = isKana(g), src = kana ? rd : ans, from = kana ? pr : pa;
    const at = src.indexOf(g, from);
    if (at < 0 || (i === 0 && at !== 0)) return false;
    if (i === segs.length - 1 && at + g.length !== src.length) return false;
    if (kana) pr = at + g.length; else pa = at + g.length;
    covered += g.length;
  }
  return covered >= rd.length * 0.6;
}
function judgeText(q, text) {
  const raw = loose(text);
  if (!raw) return false;
  const inputs = inputVariants(raw), pairs = answerPairs(q);
  // 完全一致（分類語を外した形どうしも含む）
  const exact = (i) => pairs.some(([f, r, safe]) => (i === f || i === r) && (safe || !KNOWN_ANSWERS.has(i)));
  if (inputs.some(exact)) return true;
  // 数字の答えは単位を省いてもよい（2025年←2025、1800万円←1800万・1800）。単位は数字の後ろの1〜2文字だけ
  const unitOk = (i) => /\d$/.test(i) || /\d[万億兆]$/.test(i) ? pairs.some(([f]) => f.length > i.length && f.startsWith(i) && /^[^\d]{1,2}$/.test(f.slice(i.length))) : false;
  if (inputs.some(unitOk)) return true;
  // ここから下の甘い判定は、入力がほかの問題の答えそのものなら使わない（岡山県→和歌山県 などを防ぐ）
  const free = inputs.filter((i) => !KNOWN_ANSWERS.has(i));
  // 漢字とかなの混ぜ書き
  for (const i of free) for (const [f, r] of pairs) if (mixedMatch(i, f, r)) return true;
  // かなの打ち間違い・聞き取り違い
  for (const i of free) if (isKana(i)) for (const [, r] of pairs) {
    const lim = r.length >= 9 ? 2 : r.length >= 5 ? 1 : 0;
    if (lim && Math.abs(i.length - r.length) <= lim && editDistance(i, r) <= lim) return true;
  }
  return false;
}
// 「もう一回」：正解ではないが惜しい答え（1問につき1回だけ答え直せる）
// 1) 問題ごとに登録した答え（q.retry）。ほかの問題の答えでもよい（ソフトバンクグループ←ソフトバンク）
// 2) 入力に答え・読み・別解（2文字以上）がまるごと含まれる場合（みずほ←みずほ銀行）。ほかの問題の答えそのものは除く
function isRetry(q, text) {
  const raw = loose(text);
  if (!raw) return false;
  const inputs = inputVariants(raw);
  const manual = (q.retry || []).map(loose);
  if (inputs.some((i) => manual.includes(i))) return true;
  const forms = [q.answer, q.reading, ...(q.accept || [])].map(loose).filter((f) => f.length >= 2);
  return inputs.some((i) => !KNOWN_ANSWERS.has(i) && forms.some((f) => i.length > f.length && i.includes(f)));
}
const KANA_ROWS = ["あいうえお", "かきくけこ", "さしすせそ", "たちつてと", "なにぬねの", "はひふへほ", "まみむめも", "やゆよ", "らりるれろ", "わをん", "がぎぐげご", "ざじずぜぞ", "だぢづでど", "ばびぶべぼ", "ぱぴぷぺぽ"];
const SMALL_PAIRS = { "ぁ": "あ", "ぃ": "い", "ぅ": "う", "ぇ": "え", "ぉ": "お", "ゃ": "や", "ゅ": "ゆ", "ょ": "よ", "っ": "つ" };
const BIG_TO_SMALL = Object.fromEntries(Object.entries(SMALL_PAIRS).map(([a, b]) => [b, a]));
const COMMON = KANA_ROWS.slice(0, 10).join("").replace(/[をぢづ]/g, "") + "がぎぐげござじずぜぞだでどばびぶべぼぱぴぷぺぽ";
// 「ー」「っ」「ん」など、行の概念がない文字の紛らわしい候補
const SPECIAL = { "ー": "うぃいっんぅ", "っ": "つーんぅゅ", "ん": "むうーっぬ", "ゃ": "やゅょぁ", "ゅ": "ゆゃょぅ", "ょ": "よゃゅぉ" };
const vowelOf = (c) => { for (const r of KANA_ROWS) { const i = r.indexOf(c); if (i >= 0 && r.length === 5) return i; } return -1; };
function similarKana(c) {
  const out = new Set();
  if (SPECIAL[c]) for (const x of SPECIAL[c]) out.add(x);
  if (SMALL_PAIRS[c]) out.add(SMALL_PAIRS[c]);
  if (BIG_TO_SMALL[c]) out.add(BIG_TO_SMALL[c]);
  const base = c.normalize("NFD")[0];
  for (const r of KANA_ROWS) {
    if (r.includes(c)) for (const x of r) out.add(x);
    for (const x of r) if (x.normalize("NFD")[0] === base) out.add(x); // 濁点・半濁点違い
  }
  const v = vowelOf(c);
  if (v >= 0) for (const r of KANA_ROWS.slice(0, 7)) out.add(r[v]); // 同じ段
  out.delete(c);
  return [...out];
}
// 別の読み（accept のうち全部ひらがなになるもの）で、その位置に来うる文字は不正解の選択肢にしない
function altReadings(q) {
  return [...acceptSet(q)].filter((x) => /^[ぁ-んー]+$/.test(x) && x !== q.reading);
}
function makeChoices(q, pos) {
  const r = [...q.reading];
  const correct = r[pos];
  const prefix = r.slice(0, pos).join("");
  const forbid = new Set([correct]);
  for (const alt of altReadings(q)) { const a = [...alt]; if (a.slice(0, pos).join("") === prefix && a[pos]) forbid.add(a[pos]); }
  const picks = [];
  for (const c of shuffle(similarKana(correct))) { if (picks.length >= 3) break; if (!forbid.has(c) && !picks.includes(c)) picks.push(c); }
  for (const c of shuffle([...COMMON])) { if (picks.length >= 3) break; if (!forbid.has(c) && !picks.includes(c)) picks.push(c); }
  return shuffle([correct, ...picks]);
}

// ===================== 読み上げ =====================
function speak(q, enabled) {
  if (!enabled || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(q.tts || q.text);
  u.lang = "ja-JP"; u.rate = 1.15;
  const v = speechSynthesis.getVoices().find((v) => v.lang && v.lang.startsWith("ja"));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
const stopSpeak = () => { if ("speechSynthesis" in window) speechSynthesis.cancel(); };

// ===================== 部屋（ホスト側のロジック） =====================
// ホストのブラウザが審判役。オンライン時は PeerJS（WebRTC）で他の参加者とつなぐ。
const COLLECT_MS = 150; // 最初の押下から、ほぼ同時の押下を集める猶予（押した時刻は各自の画面基準で比較）
class Host {
  constructor(online) {
    this.online = online;
    this.players = []; // {id,name,rating}
    this.conns = new Map(); // pid -> conn
    this.settings = defaultSettings();
    this.inGame = false;
    this.timers = makeRegistry();
    this.paused = false;
  }
  later(fn, ms) { return new PTimer(this.timers, fn, ms); }
  setPaused(on, by) {
    if (!this.inGame || this.paused === on) return;
    this.paused = on;
    if (on) this.timers.pause(); else this.timers.resume();
    this.broadcast({ t: "pause", on, by: nameOfPlayer(this.players, by) });
  }
  open(onReady, onError) {
    if (!this.online) { onReady(null); return; }
    if (typeof Peer === "undefined") { onError("通信ライブラリ（PeerJS）を読み込めませんでした"); return; }
    const code = String(Math.floor(10000 + Math.random() * 90000));
    this.peer = new Peer("ehq-" + code);
    this.peer.on("open", () => { this.code = code; onReady(code); });
    this.peer.on("error", (e) => {
      if (e.type === "unavailable-id") { this.peer.destroy(); this.open(onReady, onError); }
      else onError("通信エラー: " + e.type);
    });
    this.peer.on("connection", (conn) => {
      conn.on("data", (m) => this.handle(conn, m));
      conn.on("close", () => { if (conn.pid) this.leave(conn.pid); });
    });
  }
  broadcast(m) { for (const c of this.conns.values()) { try { c.send(m); } catch {} } client.onMsg(m); }
  sendTo(pid, m) { if (pid === profile.id) client.onMsg(m); else { const c = this.conns.get(pid); if (c) try { c.send(m); } catch {} } }
  lobby() { this.broadcast({ t: "lobby", players: this.players, settings: this.settings, code: this.code, hostId: profile.id, inGame: this.inGame }); }
  handle(conn, m) {
    const pid = conn ? conn.pid : profile.id;
    if (m.t === "join") {
      if (this.inGame) { conn && conn.send({ t: "reject", reason: "ゲーム中のため入れません。終わるまでお待ちください。" }); return; }
      const p = { id: m.id, name: String(m.name).slice(0, 16), rating: Number(m.rating) || 1000 };
      this.players = this.players.filter((x) => x.id !== p.id).concat(p);
      if (conn) { conn.pid = p.id; this.conns.set(p.id, conn); }
      this.lobby();
      return;
    }
    if (!pid) return;
    if (m.t === "buzz") this.onBuzz(pid, Number(m.elapsed), m.charIdx);
    else if (m.t === "answer") this.onAnswer(pid, !!m.ok, String(m.text || "").slice(0, 40));
    else if (m.t === "boo") this.onBoo(pid, m.qid, !!m.on);
    else if (m.t === "booReason") this.onBooReason(pid, m);
    else if (m.t === "pause") this.setPaused(!!m.on, pid);
    else if (m.t === "retry") { const c = this.cur; if (this.inGame && c && !c.closed && c.rights.includes(pid) && !c.results[pid]) this.broadcast({ t: "retry", pid }); }
  }
  leave(pid) {
    this.conns.delete(pid);
    this.players = this.players.filter((p) => p.id !== pid);
    const c = this.cur;
    if (this.inGame && c && !c.closed && c.rights.includes(pid) && !c.results[pid]) this.onAnswer(pid, false, "（退出）");
    if (!this.inGame) this.lobby(); else this.broadcast({ t: "players", players: this.players });
  }
  setSettings(s) {
    if (s.mode === 2) s.input = "choice"; // 方式2は同時に複数人が答えるため音声入力は不可
    this.settings = s; this.lobby();
  }
  start() {
    const s = this.settings;
    this.inGame = true;
    this.paused = false; this.timers = makeRegistry();
    this.startPlayers = this.players.map((p) => ({ ...p }));
    const avg = this.players.reduce((a, p) => a + p.rating, 0) / this.players.length;
    this.roomRank = rankOf(avg);
    this.qlist = this.daily ? dailyQuestions(this.daily.key, this.daily.mode) : pickQuestions(s.count, this.roomRank, s.genre);
    this.scores = Object.fromEntries(this.players.map((p) => [p.id, 0]));
    this.log = [];
    this.gameId = rid();
    this.qi = -1;
    this.broadcast({ t: "start", total: this.qlist.length, players: this.startPlayers, roomRank: this.roomRank, settings: s });
    this.later(() => this.next(), 800);
  }
  next() {
    this.qi++;
    if (this.qi >= this.qlist.length) return this.finish();
    const q = withVariant(this.qlist[this.qi], this.daily && this.daily.key);
    const n = this.players.length;
    const slots = this.settings.mode === 1 ? 1 : Math.max(1, Math.ceil((n * this.settings.pct) / 100));
    this.cur = { q, buzzes: [], rights: [], results: {}, closed: false, slots, timeUp: false };
    const delay = 1200;
    this.broadcast({ t: "q", i: this.qi, total: this.qlist.length, q, delay, slots });
    const dur = delay + [...q.text].length * this.settings.charMs + 5000;
    this.cur.endTimer = this.later(() => this.onTimeUp(), dur);
  }
  onBuzz(pid, elapsed, charIdx) {
    const c = this.cur;
    if (!c || c.closed || this.paused || c.buzzes.some((b) => b.pid === pid)) return;
    if (this.settings.mode === 1 && c.rights.length) { this.sendTo(pid, { t: "noright" }); return; }
    c.buzzes.push({ pid, elapsed, charIdx, done: false });
    if (!c.batch) c.batch = setTimeout(() => this.assign(), COLLECT_MS);
  }
  assign() {
    const c = this.cur;
    c.batch = null;
    const pend = c.buzzes.filter((b) => !b.done).sort((a, b) => a.elapsed - b.elapsed);
    for (const b of pend) {
      b.done = true;
      if (c.rights.length < c.slots) {
        c.rights.push(b.pid);
        if (this.settings.mode === 1) c.endTimer.cancel(); // 方式1は解答が終わるまで待つ
        this.broadcast({ t: "right", pid: b.pid, order: c.rights.length, charIdx: b.charIdx });
      } else this.sendTo(b.pid, { t: "noright" });
    }
  }
  onAnswer(pid, ok, text) {
    const c = this.cur;
    if (!c || c.closed || !c.rights.includes(pid) || c.results[pid]) return;
    const b = c.buzzes.find((x) => x.pid === pid), len = [...c.q.text].length;
    c.results[pid] = { ok, text, pos: b && len ? Math.min(1, Number(b.charIdx) / len) : null };
    this.broadcast({ t: "answered", pid, ok, text });
    const allAnswered = c.rights.every((p) => c.results[p]);
    if (this.settings.mode === 1) return this.reveal();
    const full = c.rights.length >= c.slots || c.rights.length >= this.players.length;
    if (allAnswered && (full || c.timeUp)) this.reveal();
  }
  onTimeUp() {
    const c = this.cur;
    c.timeUp = true;
    if (c.rights.every((p) => c.results[p])) this.reveal();
  }
  reveal() {
    const c = this.cur;
    if (c.closed) return;
    c.closed = true;
    c.endTimer.cancel(); clearTimeout(c.batch);
    for (const [pid, r] of Object.entries(c.results)) if (r.ok) this.scores[pid] = (this.scores[pid] || 0) + 1;
    this.log.push({ qid: c.q.id, results: c.results });
    this.broadcast({ t: "reveal", q: c.q, results: c.results, scores: this.scores });
    this.later(() => this.next(), 2500);
  }
  finish() {
    this.inGame = false;
    this.paused = false;
    const deltas = eloDeltas(this.startPlayers, this.scores);
    for (const p of this.players) p.rating += deltas[p.id] || 0;
    this.broadcast({ t: "end", scores: this.scores, deltas, log: this.log, players: this.startPlayers });
  }
  onBoo(pid, qid, on) {
    if (!this.log || !this.log.some((l) => l.qid === qid)) return;
    const r = this.log.find((l) => l.qid === qid).results[pid];
    const cat = !r ? "none" : r.ok ? "correct" : "wrong";
    this.broadcast({ t: "boo", pid, qid, on, cat });
  }
  onBooReason(pid, m) {
    if (!this.log || !this.log.some((l) => l.qid === m.qid)) return;
    const r = this.log.find((l) => l.qid === m.qid).results[pid];
    const cat = !r ? "none" : r.ok ? "correct" : "wrong";
    const p = this.players.find((x) => x.id === pid);
    const reasons = (Array.isArray(m.reasons) ? m.reasons : []).filter((x) => BOO_REASONS.includes(x));
    this.broadcast({ t: "booReason", key: pid + ":" + this.gameId, qid: m.qid, cat, name: p ? p.name : "？", reasons, text: String(m.text || "").slice(0, 200), pid });
  }
  close() { if (this.peer) this.peer.destroy(); }
}

const nameOfPlayer = (players, pid) => (players.find((p) => p.id === pid) || {}).name || "？";
function defaultSettings() {
  const s = Object.assign({ mode: 1, input: "choice", pct: 50, count: 10, tts: true, charMs: 120, genre: "all" }, LS.get("ehq.settings", {}));
  if (EDITION !== "all") s.genre = EDITION; // ポケモン版・株式版は常にそのジャンルだけ
  return s;
}

// 正答率の低い問題ほど高ランクの部屋で多く出す
// ジャンルの絞り込み（"all" ならすべて）
const GENRE_FILTERS = { all: ["すべて", () => true], pokemon: ["ポケモンだけ", (q) => q.genre === "ポケモン" || /ポケモン|ポケットモンスター/.test(q.text)], stock: ["株式だけ", (q) => q.genre === "株式"] };
function pickQuestions(count, rank, genre = "all") {
  const target = RANK_TARGET[rank];
  const pool = window.QUESTIONS.filter((GENRE_FILTERS[genre] || GENRE_FILTERS.all)[1]);
  const items = pool.map((q) => {
    const acc = accuracyFor(q.id, rank);
    const p = acc == null ? 0.6 : acc; // データがない問題は「やや易しい」とみなす
    let w = Math.exp(-((p - target) ** 2) / (2 * 0.2 ** 2)) + 0.05;
    if (isBadCandidate(stats[q.id])) w *= 0.3;
    return { q, w };
  });
  const out = [];
  while (out.length < count && items.length) {
    const total = items.reduce((a, x) => a + x.w, 0);
    let r = Math.random() * total;
    const i = items.findIndex((x) => (r -= x.w) <= 0);
    out.push(items.splice(i < 0 ? items.length - 1 : i, 1)[0].q);
  }
  return out;
}

// 最終得点で総当たりのElo。1人プレイではレーティングは動かさない
function eloDeltas(players, scores) {
  const d = Object.fromEntries(players.map((p) => [p.id, 0]));
  const n = players.length;
  if (n < 2) return d;
  const K = 32 / (n - 1);
  for (const a of players) for (const b of players) {
    if (a === b) continue;
    const e = 1 / (1 + 10 ** ((b.rating - a.rating) / 400));
    const sa = scores[a.id] > scores[b.id] ? 1 : scores[a.id] === scores[b.id] ? 0.5 : 0;
    d[a.id] += K * (sa - e);
  }
  for (const k in d) d[k] = Math.round(d[k]);
  return d;
}

// ===================== クライアント（画面側） =====================
const client = {
  host: null, conn: null, isHost: false,
  players: [], settings: null, code: null, hostId: null,
  game: null,
  timers: makeRegistry(),
  paused: false,
  send(m) {
    if (this.isHost) this.host.handle(null, m);
    else if (this.conn) this.conn.send(m);
  },
  onMsg(m) {
    const h = handlers[m.t];
    if (h) h(m);
  },
};
const handlers = {
  lobby(m) {
    Object.assign(client, { players: m.players, settings: m.settings, code: m.code, hostId: m.hostId });
    if ((!client.game || client.game.over) && !client.daily) renderLobby();
  },
  reject(m) { alert(m.reason); leaveRoom(); },
  players(m) { client.players = m.players; drawScoreboard(); },
  start(m) {
    client.game = { total: m.total, players: m.players, settings: m.settings, roomRank: m.roomRank, scores: {}, over: false, myResults: {}, qs: [] };
    renderGame();
  },
  q(m) { onQuestion(m); },
  right(m) { onRight(m); },
  noright() { const g = client.game; if (g && g.cur) { g.cur.myState = "noright"; if (g.settings.mode === 2) setStatus("回答枠がいっぱいでした。"); updateBuzz(); } },
  answered(m) { onAnswered(m); },
  retry(m) { if (m.pid !== profile.id && client.game?.cur) setStatus(`${esc(nameOf(m.pid))}：<span class="result-ng">もう一回！</span>`); },
  reveal(m) { onReveal(m); },
  end(m) { onEnd(m); },
  pause(m) { onPause(m); },
  booReason(m) {
    const s = qs(m.qid);
    s.booReasons ||= [];
    const e = { key: m.key, cat: m.cat, name: m.name, reasons: m.reasons, text: m.text, at: new Date().toISOString() };
    const i = s.booReasons.findIndex((x) => x.key === m.key);
    if (i >= 0) s.booReasons[i] = e; else s.booReasons.push(e);
    if (s.booReasons.length > 100) s.booReasons.splice(0, s.booReasons.length - 100);
    saveStats();
    if (m.pid === profile.id) { const el = document.querySelector(`.boo-form[data-q="${CSS.escape(m.qid)}"] .boo-sent`); if (el) el.textContent = "送りました"; }
  },
  boo(m) {
    const s = qs(m.qid);
    s.boo[m.cat] = Math.max(0, s.boo[m.cat] + (m.on ? 1 : -1));
    saveStats();
    if (m.pid === profile.id) { const g = client.game; if (g) { if (m.on) g.myBoos.add(m.qid); else g.myBoos.delete(m.qid); drawBooButtons(); } }
  },
};

// ===================== 今日の10問（全員共通の出題・ゴースト対戦・シェア） =====================
// 記録は Google フォーム「簡単早押しクイズ 今日の10問の記録」に送り、回答シート（リンクを知っている人は閲覧可）から
// gviz の CSV で読む。サーバーを持たずに「ほかの人の記録」を共有するための仕組み。
const DAILY_COUNT = 10;
const DAILY_FORM = "https://docs.google.com/forms/d/e/1FAIpQLSfR60v7eP7eKWKhj-7JUWHJBkd4VQPz3IVkmRwvUAEFGMJQ5w/formResponse";
const DAILY_FIELDS = { date: "entry.1524584379", name: "entry.1927649045", rec: "entry.732693691", score: "entry.455250847" };
const DAILY_SHEET = "https://docs.google.com/spreadsheets/d/1v7S6vgtqQ9nWrvLPNtPEdW0XrfrU5N4ejDxgeVhGwSs/gviz/tq";
const SITE_URL = "https://al00000000.github.io/easy-hayaoshi-quiz/";
// 版：全体版（/）とポケモン版（/pokemon/）は URL を分ける。ポケモン版は pokemon/index.html で EHQ_EDITION を設定する
// 版：全体版（/）・ポケモン版（/pokemon/）・株式版（/stock/）
const EDITION = ["pokemon", "stock"].includes(window.EHQ_EDITION) ? window.EHQ_EDITION : "all";
const BASE = EDITION === "all" ? "" : "../"; // サイト直下のファイル（プライバシーポリシーなど）への相対パス
const EDITION_URL = { all: SITE_URL, pokemon: SITE_URL + "pokemon/", stock: SITE_URL + "stock/" };
// 日本時間の日付（YYYY-MM-DD）
const todayKey = (offsetDays = 0) => new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
// シートで日付に自動変換されないよう、記録には「d20261127」の形で書く
// ジャンルごとに別の記録にする（全体は d、ポケモンは p）
const DAILY_MODES = { all: { label: "今日の10問", tag: "d", ls: "ehq.daily" }, pokemon: { label: "今日の10問（ポケモン）", tag: "p", ls: "ehq.daily.pokemon" }, stock: { label: "今日の10問（株式）", tag: "s", ls: "ehq.daily.stock" } };
const dailyTag = (key, mode = "all") => DAILY_MODES[mode].tag + key.replace(/-/g, "");
// 問題文の出し方が複数ある問題は、出題のたびに1つを選ぶ。「証券コード」から始まる文は合わせて20%
// （コードを覚えている人だけが極端に有利にならないように。本人の要望）。今日の10問は日付で決めて全員同じ文にする
const CODE_FIRST_RATE = 0.2;
function withVariant(q, seed) {
  const vs = q.variants;
  if (!vs || vs.length < 2) return q;
  const code = vs.filter((v) => v.text.startsWith("証券コード")), other = vs.filter((v) => !v.text.startsWith("証券コード"));
  // hash32 は似た文字列どうしで値が近くなるので、混ぜてから使う（hash32 自体は今日の10問の選び方に使うので変えない）
  const mix = (h) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
  const r = seed ? mix(hash32(seed + ":" + q.id)) / 4294967296 : Math.random();
  let pool, x;
  if (!code.length || !other.length) { pool = vs; x = r; }
  else if (r < CODE_FIRST_RATE) { pool = code; x = r / CODE_FIRST_RATE; }
  else { pool = other; x = (r - CODE_FIRST_RATE) / (1 - CODE_FIRST_RATE); }
  const v = pool[Math.min(pool.length - 1, Math.floor(x * pool.length))];
  const out = { ...q, text: v.text };
  if (v.tts) out.tts = v.tts; else delete out.tts;
  return out;
}
function hash32(str) { let h = 0x811c9dc5; for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
// 日付と問題IDのハッシュが小さい順に10問。全員が同じ10問になる（問題が増えても大半は変わらない）
function dailyQuestions(key, mode = "all") {
  const pool = window.QUESTIONS.filter(GENRE_FILTERS[mode][1]);
  const salt = mode === "all" ? "" : mode + "|";
  return pool.map((q) => ({ q, h: hash32(salt + key + "|" + q.id) })).sort((a, b) => a.h - b.h).slice(0, DAILY_COUNT).map((x) => x.q);
}
const dailyStates = {};
const dailyState = (mode = "all") => (dailyStates[mode] ||= LS.get(DAILY_MODES[mode].ls, { streak: 0, best: 0, last: null, days: {} }));
const saveDaily = (mode = "all") => LS.set(DAILY_MODES[mode].ls, dailyState(mode));
const dailyDone = (mode = "all", key = todayKey()) => !!dailyState(mode).days[key];
// 連続日数（最後に挑戦した日が昨日より前なら途切れている）
const currentStreak = (mode = "all") => { const d = dailyState(mode); return d.last === todayKey(-1) || d.last === todayKey() ? d.streak : 0; };

// ----- ゴースト（その日にほかの人が残した記録） -----
function parseCSV(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
async function loadGhosts(key, qids, mode = "all") {
  const tq = encodeURIComponent(`select C,D,E where B='${dailyTag(key, mode)}' order by A desc limit 300`);
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const text = await fetch(`${DAILY_SHEET}?tqx=out:csv&tq=${tq}`, { signal: ctl.signal }).then((r) => r.text());
    const seen = new Set([profile.id]), list = [];
    for (const [name, recText] of parseCSV(text).slice(1)) {
      let rec; try { rec = JSON.parse(recText); } catch { continue; }
      if (!rec || !Array.isArray(rec.q) || !Array.isArray(rec.r) || seen.has(rec.u)) continue;
      seen.add(rec.u);
      const map = {};
      rec.q.forEach((id, i) => { const r = rec.r[i] || []; map[id] = { p: typeof r[0] === "number" && r[0] >= 0 ? r[0] / 100 : null, ok: !!r[1] }; });
      if (!qids.some((id) => map[id])) continue;
      list.push({ name: String(name).slice(0, 16) || "名無し", map, score: qids.filter((id) => map[id]?.ok).length });
    }
    // いちばん成績の良い人＋ランダムに2人
    list.sort((a, b) => b.score - a.score);
    const out = list.length ? [list[0]] : [];
    const rest = shuffle(list.slice(1));
    while (out.length < 3 && rest.length) out.push(rest.pop());
    return out;
  } catch { return []; } finally { clearTimeout(timer); }
}
// ゴーストとの勝敗：正解した人のうち、早く押した方の勝ち
function ghostDuel(me, gh) {
  const mo = me?.ok, go = gh?.ok;
  if (mo && go) { const a = me.p ?? 1, b = gh.p ?? 1; return a < b ? 1 : a > b ? -1 : 0; }
  return mo ? 1 : go ? -1 : 0;
}

async function startDaily(mode = "all") {
  const key = todayKey(), qs = dailyQuestions(key, mode);
  app.innerHTML = `<div class="card">${DAILY_MODES[mode].label}を準備しています…</div>`;
  const ghosts = await loadGhosts(key, qs.map((q) => q.id), mode);
  client.daily = { key, mode, official: !dailyDone(mode, key), ghosts, qids: qs.map((q) => q.id) };
  createRoom(false);
}
// 1問ごとのゴースト表示（押した瞬間にチップを出し、正解発表で結果を出す）
function drawGhosts(reveal) {
  const el = $("#ghostbar"), g = client.game, c = g?.cur;
  if (!el || !client.daily || !c) return;
  const gs = client.daily.ghosts;
  if (!gs.length) { el.innerHTML = `<span class="muted">👻 今日のゴーストはまだいません（あなたが一番乗り）</span>`; return; }
  el.innerHTML = gs.map((gh, i) => {
    const r = gh.map[c.q.id];
    let st = "まだ";
    if (reveal) st = !r ? "記録なし" : r.p == null ? "押さず" : `${r.ok ? "○" : "×"} ${Math.round(r.p * 100)}%`;
    else if (c.ghostPressed?.has(i)) st = "押した！";
    return `<span class="ghost ${reveal && r?.ok ? "ok" : ""} ${!reveal && c.ghostPressed?.has(i) ? "pressed" : ""}">👻${esc(gh.name)}：${st}</span>`;
  }).join("");
}
function checkGhosts() {
  const c = client.game?.cur;
  if (!client.daily || !c) return;
  c.ghostPressed ||= new Set();
  const frac = c.shown / c.chars.length;
  let changed = false;
  client.daily.ghosts.forEach((gh, i) => { const r = gh.map[c.q.id]; if (r && r.p != null && frac >= r.p && !c.ghostPressed.has(i)) { c.ghostPressed.add(i); changed = true; } });
  if (changed) { Sound.tone(880, 0, 0.08, { type: "triangle", vol: 0.08 }); drawGhosts(false); }
}

// ----- 終了時：記録・連続日数・送信・シェア -----
function finishDaily(m) {
  const d = client.daily, key = d.key, mode = d.mode || "all", daily = dailyState(mode);
  const recs = d.qids.map((id) => { const l = m.log.find((x) => x.qid === id), r = l?.results[profile.id]; return { p: r && typeof r.pos === "number" ? r.pos : null, ok: !!r?.ok }; });
  const score = recs.filter((r) => r.ok).length;
  if (d.official) {
    daily.days[key] = { score, r: recs.map((r) => [r.p == null ? -1 : Math.round(r.p * 100), r.ok ? 1 : 0]) };
    daily.streak = daily.last === todayKey(-1) ? daily.streak + 1 : daily.last === key ? daily.streak : 1;
    daily.last = key; daily.best = Math.max(daily.best || 0, score);
    saveDaily(mode);
    const body = new URLSearchParams();
    body.append(DAILY_FIELDS.date, dailyTag(key, mode));
    body.append(DAILY_FIELDS.name, profile.name);
    body.append(DAILY_FIELDS.rec, JSON.stringify({ v: 1, u: profile.id, q: d.qids, r: daily.days[key].r }));
    body.append(DAILY_FIELDS.score, String(score));
    fetch(DAILY_FORM, { method: "POST", mode: "no-cors", body }).catch(() => {});
    d.official = false; // 2回目以降は練習扱い
  }
  return { recs, score };
}
function dailyShareText(key, recs, score, mode = "all") {
  const row = recs.map((r) => (r.ok ? "🟩" : r.p == null ? "⬜" : "🟥")).join("");
  const ps = recs.filter((r) => r.ok && r.p != null).map((r) => r.p);
  const avg = ps.length ? Math.round((ps.reduce((a, b) => a + b, 0) / ps.length) * 100) : null;
  const [, mm, dd] = key.split("-");
  return [`簡単早押しクイズ ${DAILY_MODES[mode].label} ${Number(mm)}/${Number(dd)}`, `${row} ${score}/${DAILY_COUNT}`, avg != null ? `⚡正解した問題は平均${avg}%で押した` : null, currentStreak(mode) > 1 ? `🔥${currentStreak(mode)}日連続` : null, EDITION_URL[mode]].filter(Boolean).join("\n");
}
function dailyResultHTML(m) {
  const d = client.daily, wasOfficial = d.official;
  const { recs, score } = finishDaily(m);
  const mode = d.mode || "all";
  const text = dailyShareText(d.key, recs, score, mode);
  const duel = d.ghosts.map((gh) => {
    let w = 0, l = 0;
    d.qids.forEach((id, i) => { const v = ghostDuel(recs[i], gh.map[id]); if (v > 0) w++; else if (v < 0) l++; });
    return `<tr><td>👻${esc(gh.name)}</td><td>${gh.score}/${DAILY_COUNT}</td><td>${w}勝${l}敗${w > l ? " 🏆" : ""}</td></tr>`;
  }).join("");
  return `
  <div class="card daily-result">
    <h2>${DAILY_MODES[mode].label}の結果 ${wasOfficial ? "" : `<span class="muted">（2回目以降は練習扱い・記録は最初の1回）</span>`}</h2>
    <div style="font-size:26px;letter-spacing:2px">${recs.map((r) => (r.ok ? "🟩" : r.p == null ? "⬜" : "🟥")).join("")}</div>
    <p style="font-size:20px;margin:6px 0"><b>${score}</b> / ${DAILY_COUNT} 問正解　🔥 ${currentStreak(mode)}日連続</p>
    ${duel ? `<h3>ゴーストとの勝負</h3><table><tr><th>相手</th><th>正解数</th><th>あなたから見て</th></tr>${duel}</table><p class="muted">同じ問題で、正解した人のうち早く押した方の勝ち。</p>` : `<p class="muted">今日のゴーストはまだいません。あなたの記録が、次に遊ぶ人のゴーストになります。</p>`}
    <h3>結果をシェア</h3>
    <pre class="share-text">${esc(text)}</pre>
    <div class="row">
      <a class="btn" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">Xでポスト</a>
      <a class="btn" href="https://line.me/R/share?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">LINEで送る</a>
      <button class="sub" id="share-copy">コピー</button>
      ${navigator.share ? `<button class="sub" id="share-native">ほかのアプリで共有</button>` : ""}
      <span class="muted" id="share-msg"></span>
    </div>
    <p class="muted">名前と成績は、ほかの人の「ゴースト」として表示されます。</p>
  </div>`;
}
function bindDailyShare() {
  const text = $(".share-text")?.textContent;
  if (!text) return;
  $("#share-copy").onclick = async () => { try { await navigator.clipboard.writeText(text); $("#share-msg").textContent = "コピーしました"; } catch { $("#share-msg").textContent = "コピーできませんでした"; } };
  if ($("#share-native")) $("#share-native").onclick = () => navigator.share({ text }).catch(() => {});
}

// ---------- 画面: ホーム ----------
function renderHome() {
  stopAll();
  const dailyRow = (mode) => {
    const done = dailyDone(mode), today = dailyState(mode).days[todayKey()], st = currentStreak(mode);
    return `<div class="row daily-row"><button id="daily-${mode}">${done ? "もう一度（練習）" : "挑戦する"}</button>${done ? `<span>今日：<b>${today.score}</b> / ${DAILY_COUNT}</span>` : ""}${st ? `<span>🔥${st}日連続</span>` : ""}</div>`;
  };
  app.innerHTML = `
  <div class="card daily-card">
    <h2>今日の10問 <span class="muted">${todayKey().slice(5).replace("-", "/")}</span></h2>
    <p class="muted">全員共通の10問。ほかの人の記録（ゴースト）と早押しで勝負できます。</p>
    ${dailyRow(EDITION)}
  </div>
  <div class="card">
    <h2>名前</h2>
    <div class="row"><input type="text" id="name" maxlength="16" value="${esc(profile.name)}"> <button class="sub" id="save-name">保存</button></div>
    <p class="muted">ランク <span class="rank">${rankOf(profile.rating)}</span> レーティング ${Math.round(profile.rating)}（2人以上の対戦で変動）</p>
  </div>
  <div class="card">
    <h2>遊ぶ</h2>
    <div class="row">
      <button id="solo">ひとりで練習</button>
      <button id="create">部屋を立てる</button>
      <input type="text" id="code" placeholder="部屋番号（5桁）" maxlength="5" size="10" inputmode="numeric">
      <button class="sub" id="join">部屋に入る</button>
    </div>
    <p class="muted">早押しはクリックかスペースキー。答えはひらがな4択（1〜4キーでも選べます）か、音声入力。</p>
  </div>
  <div class="card"><div class="row"><button class="sub" id="stats">自分の成績・問題ごとの記録を見る</button><button class="sub" id="submit-q">問題を投稿する</button></div></div>
  <p class="muted" style="text-align:center"><a href="${BASE}privacy.html">プライバシーポリシー</a></p>`;
  $("#save-name").onclick = () => { profile.name = $("#name").value.trim() || profile.name; saveProfile(); };
  $("#solo").onclick = () => { client.daily = null; createRoom(false); };
  $(`#daily-${EDITION}`).onclick = () => startDaily(EDITION);
  $("#create").onclick = () => { client.daily = null; createRoom(true); };
  $("#join").onclick = () => joinRoom($("#code").value.trim());
  $("#stats").onclick = renderStats;
  $("#submit-q").onclick = renderSubmit;
}

// ---------- 画面: 問題の投稿 ----------
// 投稿は Google フォームに送る（回答はフォーム所有者のスプレッドシートにだけ入り、外からは見えない）。
// 送られた問題は Claude が文法だけ整えて data/07_user.txt に足す（手動。ジャンル「投稿」を付ける）。
const SUBMIT_URL = "https://docs.google.com/forms/d/e/1FAIpQLSexB_m447RgeWP5t8gJQqU6bRbGO9hgQ1y_ywN8swWUWByBZg/formResponse";
const SUBMIT_FIELDS = { text: "entry.1221034603", answer: "entry.588971532", reading: "entry.885368661", accept: "entry.1858969264", genre: "entry.1758969097", name: "entry.818392278" };
function renderSubmit() {
  stopAll();
  app.innerHTML = `
  <div class="card">
    <h2>問題を投稿する</h2>
    <p class="muted">投稿された問題は、文法だけ整えてから出題に加えます（反映は不定期）。加わった問題にも、ほかの問題と同じように👎が付けられます。</p>
    <ul class="muted" style="margin:6px 0 12px 1.2em;padding:0">
      <li>難しいヒントから先に書き、だんだん易しくなるように</li>
      <li>答えが一つに決まるように（同じ種類の言葉で別の答えにならないように）</li>
      <li>問題文の中に答えそのものを書かないように</li>
    </ul>
    <label>問題文（必須）<textarea id="sq-text" rows="3" maxlength="300" style="width:100%" placeholder="〜は何でしょう？"></textarea></label>
    <div class="row">
      <label style="flex:1">答え（必須）<input type="text" id="sq-answer" maxlength="40" style="width:100%"></label>
      <label style="flex:1">答えの読み・ひらがな（必須）<input type="text" id="sq-reading" maxlength="40" style="width:100%"></label>
    </div>
    <div class="row">
      <label style="flex:1">別の正解（あれば。「、」区切り）<input type="text" id="sq-accept" maxlength="80" style="width:100%"></label>
      <label style="flex:1">ジャンル（任意）<input type="text" id="sq-genre" maxlength="20" style="width:100%"></label>
    </div>
    <label>投稿者名（任意）<input type="text" id="sq-name" maxlength="20" value="${esc(profile.name)}"></label>
    <div class="row" style="margin-top:12px"><button id="sq-send">送信する</button><button class="sub" id="back">戻る</button><span id="sq-msg" class="muted"></span></div>
  </div>`;
  $("#back").onclick = renderHome;
  $("#sq-send").onclick = async () => {
    const v = (id) => $("#" + id).value.trim();
    const d = { text: v("sq-text"), answer: v("sq-answer"), reading: toHira(v("sq-reading").normalize("NFKC")), accept: v("sq-accept"), genre: v("sq-genre"), name: v("sq-name") };
    const msg = (t) => ($("#sq-msg").textContent = t);
    if (!d.text || !d.answer || !d.reading) return msg("問題文・答え・読みは必須です");
    if (!/^[ぁ-んー]+$/.test(d.reading)) return msg("読みはひらがなで入力してください");
    if (norm(d.text).includes(norm(d.answer))) return msg("問題文の中に答えが入っています");
    const body = new URLSearchParams();
    for (const [k, f] of Object.entries(SUBMIT_FIELDS)) body.append(f, d[k]);
    $("#sq-send").disabled = true; msg("送信中…");
    try {
      await fetch(SUBMIT_URL, { method: "POST", mode: "no-cors", body });
      msg("送信しました。ありがとうございます！");
      for (const id of ["sq-text", "sq-answer", "sq-reading", "sq-accept"]) $("#" + id).value = "";
    } catch (e) { msg("送信できませんでした：" + e.message); }
    $("#sq-send").disabled = false;
  };
}

function createRoom(online) {
  client.isHost = true;
  client.host = new Host(online);
  app.innerHTML = `<div class="card">部屋を準備しています…</div>`;
  client.host.open(() => {
    client.host.handle(null, { t: "join", id: profile.id, name: profile.name, rating: profile.rating });
    if (client.daily) { // 今日の10問：方式1・10問・ふつうの速さで固定。答え方と読み上げはふだんの設定のまま
      const s = defaultSettings();
      client.host.settings = { ...s, mode: 1, count: DAILY_COUNT, charMs: 120 };
      client.host.daily = client.daily;
      client.host.start();
    }
  }, (err) => { alert(err); leaveRoom(); });
}
function joinRoom(code) {
  if (!/^\d{5}$/.test(code)) { alert("部屋番号は5桁の数字です"); return; }
  if (typeof Peer === "undefined") { alert("通信ライブラリ（PeerJS）を読み込めませんでした"); return; }
  client.isHost = false;
  app.innerHTML = `<div class="card">部屋 ${esc(code)} に接続しています…</div>`;
  const peer = new Peer();
  client.peer = peer;
  peer.on("open", () => {
    const conn = peer.connect("ehq-" + code, { reliable: true });
    client.conn = conn;
    conn.on("open", () => conn.send({ t: "join", id: profile.id, name: profile.name, rating: profile.rating }));
    conn.on("data", (m) => client.onMsg(m));
    conn.on("close", () => { if (client.conn !== conn) return; alert("部屋との接続が切れました"); leaveRoom(); });
  });
  peer.on("error", (e) => { alert(e.type === "peer-unavailable" ? "その部屋は見つかりませんでした" : "通信エラー: " + e.type); leaveRoom(); });
}
function leaveRoom() {
  stopAll();
  if (client.host) client.host.close();
  if (client.peer) client.peer.destroy();
  Object.assign(client, { host: null, conn: null, peer: null, isHost: false, game: null, paused: false, daily: null });
  drawPause();
  renderHome();
}

// 左上のロゴ: トップページへ戻る（部屋にいるときは確認してから抜ける）
document.getElementById("logo").addEventListener("click", (e) => {
  e.preventDefault();
  const inRoom = client.peer || client.host || client.conn;
  if (inRoom && !confirm("部屋から抜けてトップページに戻りますか？")) return;
  leaveRoom();
});

// 左上のQRボタン: この版のURLをQRコードで表示（スマホで読み取って開ける）
// QRの生成ライブラリは押されたときだけ読み込む（一度読めば sw.js が保存するのでオフラインでも出せる）
const QR_LIB = "https://unpkg.com/qrcode-generator@1.4.4/qrcode.js";
let qrLibLoading = null;
const loadQrLib = () => (qrLibLoading ||= new Promise((ok, ng) => {
  if (window.qrcode) return ok();
  const s = document.createElement("script");
  s.src = QR_LIB; s.onload = ok; s.onerror = () => { qrLibLoading = null; ng(new Error("QR")); };
  document.head.appendChild(s);
}));
function closeQr() { const ov = $("#qr-overlay"); if (ov) ov.remove(); }
async function showQr() {
  if ($("#qr-overlay")) return closeQr();
  const url = EDITION_URL[EDITION];
  const ov = document.createElement("div");
  ov.id = "qr-overlay";
  ov.innerHTML = `<div class="qr-box" role="dialog" aria-label="このページのQRコード">
    <button class="sub qr-close" title="閉じる（Esc）">✕</button>
    <h2>スマホで読み取って開く</h2>
    <div id="qr-img">QRコードを作っています…</div>
    <p class="qr-url">${esc(url)}</p>
    <div class="row" style="justify-content:center"><button id="qr-copy" class="sub">URLをコピー</button></div>
  </div>`;
  document.body.appendChild(ov);
  ov.onclick = (e) => { if (e.target === ov) closeQr(); };
  ov.querySelector(".qr-close").onclick = closeQr;
  $("#qr-copy").onclick = async () => {
    try { await navigator.clipboard.writeText(url); $("#qr-copy").textContent = "コピーしました"; } catch { $("#qr-copy").textContent = "コピーできませんでした"; }
  };
  try {
    await loadQrLib();
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    const box = $("#qr-img");
    if (box) box.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
  } catch {
    const box = $("#qr-img");
    if (box) box.textContent = "QRコードを作れませんでした（ネットにつながっているか確認してください）";
  }
}
{
  const btn = document.createElement("button");
  btn.id = "qr-btn"; btn.type = "button"; btn.title = "このページのQRコードを表示"; btn.textContent = "QR";
  btn.onclick = showQr;
  const h1 = document.querySelector("header h1");
  const wrap = document.createElement("div");
  wrap.className = "head-left";
  h1.before(wrap); wrap.append(btn, h1);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#qr-overlay")) { e.stopImmediatePropagation(); closeQr(); } }, true);
}

// ---------- 画面: 部屋（設定） ----------
function renderLobby() {
  stopAll();
  const s = client.settings;
  const solo = client.isHost && !client.host.online;
  const dis = client.isHost ? "" : "disabled";
  app.innerHTML = `
  <div class="card">
    ${solo ? "<h2>ひとりで練習</h2>" : `<h2>部屋番号</h2><div class="code">${esc(client.code)}</div><p class="muted">この番号を一緒に遊ぶ人に伝えてください。</p>`}
    <div class="players">${client.players.map((p) => `<span>${esc(p.name)} <span class="rank">${rankOf(p.rating)}</span></span>`).join("")}</div>
  </div>
  <div class="card">
    <h2>ゲームの設定${client.isHost ? "" : "（部屋を立てた人が決めます）"}</h2>
    <label>出題方式
      <select id="s-mode" ${dis}>
        <option value="1" ${s.mode === 1 ? "selected" : ""}>方式1：最初に押した1人だけが答える</option>
        <option value="2" ${s.mode === 2 ? "selected" : ""}>方式2：押した順に、人数の上位◯％までが答える</option>
      </select></label>
    <label id="pct-row" style="${s.mode === 2 ? "" : "display:none"}">方式2で答えられる人数（部屋の人数に対する割合・暫定）
      <select id="s-pct" ${dis}>${[30, 50, 70, 100].map((v) => `<option value="${v}" ${s.pct === v ? "selected" : ""}>上位${v}％</option>`).join("")}</select></label>
    <label>答え方
      <select id="s-input" ${dis}>
        <option value="choice" ${s.input === "choice" ? "selected" : ""}>ひらがな4択</option>
        <option value="voice" ${s.input === "voice" ? "selected" : ""} ${s.mode === 2 ? "disabled" : ""}>音声入力${s.mode === 2 ? "（方式2では使えません）" : ""}</option>
      </select></label>
    <label ${EDITION !== "all" ? 'style="display:none"' : ""}>ジャンル <select id="s-genre" ${dis}>${Object.entries(GENRE_FILTERS).map(([k, [l]]) => `<option value="${k}" ${(s.genre || "all") === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <label>問題数 <select id="s-count" ${dis}>${[5, 10, 15, 20].map((v) => `<option ${s.count === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    <label>文字の速さ <select id="s-speed" ${dis}>${[[160, "ゆっくり"], [120, "ふつう"], [85, "はやい"]].map(([v, l]) => `<option value="${v}" ${s.charMs === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <label><input type="checkbox" id="s-tts" ${s.tts ? "checked" : ""} ${dis}> 問題文を音声で読み上げる</label>
    <div class="row" style="margin-top:12px">
      ${client.isHost ? `<button id="go">ゲーム開始</button>` : `<span class="muted">開始を待っています…</span>`}
      <button class="sub" id="leave">部屋を出る</button>
    </div>
  </div>`;
  $("#leave").onclick = leaveRoom;
  if (!client.isHost) return;
  const read = () => {
    const mode = Number($("#s-mode").value);
    let input = $("#s-input").value;
    if (mode === 2) input = "choice"; // 方式2は同時に複数人が答えるため音声入力は不可
    const ns = { mode, input, pct: Number($("#s-pct").value), count: Number($("#s-count").value), charMs: Number($("#s-speed").value), tts: $("#s-tts").checked, genre: EDITION !== "all" ? EDITION : $("#s-genre").value };
    if (EDITION !== "all") { LS.set("ehq.settings", { ...ns, genre: LS.get("ehq.settings", {}).genre || "all" }); client.host.setSettings(ns); return; }
    LS.set("ehq.settings", ns);
    client.host.setSettings(ns);
  };
  for (const id of ["s-mode", "s-pct", "s-input", "s-count", "s-speed", "s-tts", "s-genre"]) $("#" + id).onchange = read;
  $("#go").onclick = () => client.host.start();
}

// ---------- 画面: ゲーム ----------
function renderGame() {
  const g = client.game;
  app.innerHTML = `
  <div class="card">
    <div class="row" style="justify-content:space-between"><b id="qno"></b><span class="muted">部屋のランク <span class="rank">${g.roomRank}</span>・${g.settings.mode === 1 ? "方式1" : "方式2"}・${g.settings.input === "voice" ? "音声入力" : "ひらがな4択"}</span></div>
    <div id="scoreboard" class="players"></div>
    ${client.daily ? `<div id="ghostbar" class="players ghostbar"></div>` : ""}
  </div>
  <div class="card" id="game-card">
    <div id="qtext"></div>
    <div class="status" id="status"></div>
    <div id="answer-area"></div>
    <button id="buzz" disabled>押す！${TOUCH ? "" : "（スペース）"}</button>
  </div>`;
  $("#buzz").onclick = buzz;
  client.paused = false; client.timers = makeRegistry();
  drawPause();
  drawScoreboard();
}
function drawScoreboard() {
  const g = client.game, el = $("#scoreboard");
  if (!g || !el) return;
  el.innerHTML = g.players.map((p) => `<span>${esc(p.name)}：${g.scores[p.id] || 0}</span>`).join("");
}
const setStatus = (h) => { const el = $("#status"); if (el) el.innerHTML = h; };
const nameOf = (pid) => { const p = (client.game?.players || client.players).find((x) => x.id === pid); return p ? p.name : "？"; };

function onQuestion(m) {
  const g = client.game;
  stopAll();
  g.cur = { q: m.q, chars: [...m.q.text], shown: 0, t0: null, pausedMs: 0, myState: "wait", token: rid(), slots: m.slots };
  Sound.start();
  g.qs.push(m.q);
  $("#qno").textContent = `第${m.i + 1}問 / ${m.total}`;
  $("#answer-area").innerHTML = "";
  drawText();
  drawGhosts(false);
  setStatus("まもなく出題…");
  updateBuzz();
  const tok = g.cur.token;
  g.cur.delayTimer = new PTimer(client.timers, () => {
    if (!g.cur || g.cur.token !== tok) return;
    g.cur.t0 = performance.now();
    g.cur.myState = "listen";
    setStatus("");
    updateBuzz();
    speak(m.q, g.settings.tts);
    streamTick(tok);
  }, m.delay);
}
function streamTick(tok) {
  const c = client.game?.cur;
  if (!c || c.token !== tok || c.paused) return;
  c.shown++;
  drawText();
  checkGhosts();
  if (c.shown < c.chars.length) c.streamTimer = new PTimer(client.timers, () => streamTick(tok), client.game.settings.charMs);
}
function pauseStream() {
  const c = client.game?.cur;
  if (!c) return;
  c.paused = true;
  c.streamTimer?.cancel();
  stopSpeak();
}
function drawText(all) {
  const c = client.game.cur, el = $("#qtext");
  if (!el) return;
  const n = all ? c.chars.length : c.shown;
  el.innerHTML = esc(c.chars.slice(0, n).join(""));
  if (all && c.shown < c.chars.length) el.innerHTML = esc(c.chars.slice(0, c.shown).join("")) + `<span class="rest">${esc(c.chars.slice(c.shown).join(""))}</span>`;
}
function updateBuzz() {
  const b = $("#buzz"), c = client.game?.cur;
  if (b) b.disabled = !(c && c.myState === "listen" && c.t0 != null);
}
function buzz() {
  const c = client.game?.cur;
  if (!c || c.myState !== "listen" || c.t0 == null || client.paused) return;
  c.myState = "buzzed";
  c.buzzSoundPlayed = true;
  Sound.buzz();
  pauseStream();
  updateBuzz();
  setStatus("押しました！");
  client.send({ t: "buzz", elapsed: performance.now() - c.t0 - c.pausedMs, charIdx: c.shown });
}
function onRight(m) {
  const g = client.game, c = g.cur;
  if (!c) return;
  if (m.pid !== profile.id || !c.buzzSoundPlayed) Sound.buzz();
  if (m.pid === profile.id) {
    c.myState = "answering";
    updateBuzz();
    setStatus(`<b>回答権を得ました</b>${g.settings.mode === 2 ? `（${m.order}番目）` : ""}`);
    if (g.settings.input === "voice") startVoiceAnswer(); else startChoiceAnswer();
  } else {
    if (g.settings.mode === 1) {
      pauseStream();
      if (c.myState === "listen" || c.myState === "buzzed") c.myState = "locked";
      updateBuzz();
      setStatus(`${esc(nameOf(m.pid))} さんが解答中…`);
    } else {
      setStatus(`${esc(nameOf(m.pid))} さんが押しました（${m.order}/${c.slots}）`);
    }
  }
}
function onAnswered(m) {
  if (m.pid === profile.id) return;
  if (m.ok) Sound.correct(); else Sound.wrong();
  const g = client.game;
  if (g.settings.mode === 1) setStatus(`${esc(nameOf(m.pid))}：<span class="${m.ok ? "result-ok" : "result-ng"}">${m.ok ? "正解" : "不正解"}</span>`);
}
function submitAnswer(ok, text) {
  const c = client.game.cur;
  if (c.myState !== "answering") return;
  c.myState = "done";
  stopAnswerUI();
  client.game.myResults[c.q.id] = ok;
  if (ok) Sound.correct(); else Sound.wrong();
  setStatus(ok ? `<span class="result-ok">正解！</span>` : `<span class="result-ng">不正解…</span>`);
  $("#answer-area").innerHTML = "";
  client.send({ t: "answer", ok, text });
}

// ----- ひらがな4択 -----
const CHOICE_MS = 6000; // 1文字ごとの制限時間
function startChoiceAnswer() {
  const c = client.game.cur;
  c.typed = [];
  drawChoices();
}
function drawChoices() {
  const c = client.game.cur, q = c.q;
  const pos = c.typed.length;
  const ch = makeChoices(q, pos);
  c.choices = ch;
  $("#answer-area").innerHTML = `
    <div class="typed">${esc(c.typed.join(""))}<span class="muted">${"＿".repeat([...q.reading].length - pos)}</span></div>
    <div class="timer"><div id="tbar" style="width:100%"></div></div>
    <div class="choices">${ch.map((x, i) => `<button data-i="${i}">${esc(x)}<span class="key">${i + 1}</span></button>`).join("")}</div>`;
  for (const b of document.querySelectorAll(".choices button")) b.onclick = () => pickChoice(Number(b.dataset.i));
  startTimer(CHOICE_MS, () => submitAnswer(false, c.typed.join("") + "…（時間切れ）"));
}
function pickChoice(i) {
  const c = client.game.cur;
  if (c.myState !== "answering" || !c.choices || client.paused) return;
  const r = [...c.q.reading];
  const pick = c.choices[i];
  c.typed.push(pick);
  if (pick !== r[c.typed.length - 1]) return submitAnswer(false, c.typed.join(""));
  if (c.typed.length === r.length) return submitAnswer(true, c.typed.join(""));
  drawChoices();
}

// ----- 音声入力 -----
const VOICE_MS = 15000;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function startVoiceAnswer() {
  const c = client.game.cur;
  $("#answer-area").innerHTML = `
    <div class="timer"><div id="tbar" style="width:100%"></div></div>
    <p class="muted">${SR ? "マイクに向かって答えを言ってください。認識された文字を確認して Enter で解答（直接書き換えもできます）。" : "このブラウザは音声認識に対応していません（Chrome / Edge で使えます）。答えを入力して Enter で解答してください。"}</p>
    <div id="retry-msg"></div>
    <input type="text" id="voice-input" class="voice-text" style="width:100%" autocomplete="off">
    <div class="row" style="margin-top:8px"><button id="voice-ok">この答えで解答（Enter）</button>${SR ? `<button class="sub" id="voice-retry">言い直す</button>` : ""}</div>`;
  const inp = $("#voice-input");
  inp.focus();
  // timeUp のときは「もう一回」にしない（残り時間がないため）
  const submit = (timeUp) => {
    if (c.myState !== "answering") return;
    const ok = judgeText(c.q, inp.value);
    if (!ok && timeUp !== true && !c.retried && isRetry(c.q, inp.value)) {
      c.retried = true;
      Sound.wrong();
      $("#retry-msg").innerHTML = `<span class="result-ng">もう一回！</span><span class="muted">（「${esc(inp.value)}」は惜しい。制限時間はそのまま）</span>`;
      inp.value = "";
      inp.focus();
      if (SR) startRecognition(inp);
      client.send({ t: "retry" });
      return;
    }
    submitAnswer(ok, inp.value);
  };
  inp.onkeydown = (e) => { if (client.paused) { e.preventDefault(); return; } if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); submit(); } };
  $("#voice-ok").onclick = () => submit();
  if (SR) { $("#voice-retry").onclick = () => { inp.value = ""; startRecognition(inp); }; startRecognition(inp); }
  startTimer(VOICE_MS, () => submit(true));
}
function startRecognition(inp, keep) {
  const c = client.game.cur;
  try { c.rec && c.rec.abort(); } catch {}
  const rec = new SR();
  // 聞き直すときは、それまでに聞き取った文字を残して後ろに足す
  const base = keep ? inp.value : "";
  rec.lang = "ja-JP"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 5;
  rec.onresult = (e) => {
    let t = "";
    for (const r of e.results) {
      // 候補の中に正解があればそれを採用（同音の別表記で誤判定するのを減らす）
      let best = r[0].transcript;
      if (r.isFinal) for (const alt of r) if (judgeText(c.q, alt.transcript)) { best = alt.transcript; break; }
      t += best;
    }
    inp.value = base + t.replace(/[。、]/g, "");
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") { rec.denied = true; setStatus("マイクが許可されていません。答えを入力して Enter で解答してください。"); }
    else if (e.error === "audio-capture" || e.error === "network") rec.denied = true; // 聞き直しても直らないので繰り返さない
  };
  // 考えて黙っていると、ブラウザが数秒で聞き取りを打ち切る（その後に話しても拾わない）。解答中ならすぐ聞き直す
  rec.onend = () => {
    if (rec.denied || c.rec !== rec || c.myState !== "answering" || client.paused || client.game?.cur !== c) return;
    setTimeout(() => { if (c.rec === rec && c.myState === "answering" && !client.paused) startRecognition(inp, true); }, 150);
  };
  c.rec = rec;
  try { rec.start(); } catch {}
}

// ----- 一時停止（部屋の全員が止まる。誰でも押せる） -----
function togglePause() {
  if (!client.game || client.game.over) return;
  client.send({ t: "pause", on: !client.paused });
}
function onPause(m) {
  const c = client.game?.cur;
  client.paused = m.on;
  if (m.on) {
    client.timers.pause();
    if ("speechSynthesis" in window) speechSynthesis.pause();
    if (c) { c.pauseStart = performance.now(); try { c.rec && c.rec.abort(); } catch {} }
  } else {
    client.timers.resume();
    if ("speechSynthesis" in window) speechSynthesis.resume();
    if (c && c.pauseStart != null) { if (c.t0 != null) c.pausedMs += performance.now() - c.pauseStart; c.pauseStart = null; }
    const inp = $("#voice-input");
    if (c && c.myState === "answering" && inp && SR) startRecognition(inp, true);
  }
  drawPause(m.by);
}
function drawPause(by) {
  const b = $("#pause-btn");
  if (b) {
    b.textContent = client.paused ? "▶ 再開" : "⏸ 一時停止";
    b.style.display = client.game && !client.game.over ? "" : "none";
    b.onclick = togglePause;
  }
  const card = $("#game-card");
  if (!card) return;
  let ov = $("#pause-overlay");
  if (client.paused) {
    if (!ov) { ov = document.createElement("div"); ov.id = "pause-overlay"; card.appendChild(ov); }
    ov.innerHTML = `<div><div style="font-size:28px">一時停止中</div><div class="muted">${esc(by || "")} さんが止めました</div><button id="resume-btn" style="margin-top:12px">▶ 再開</button></div>`;
    $("#resume-btn").onclick = togglePause;
  } else if (ov) ov.remove();
}

// ----- タイマー -----
function startTimer(ms, onEnd) {
  const c = client.game.cur;
  clearInterval(c.timer);
  let used = 0, last = performance.now();
  c.timer = setInterval(() => {
    const now = performance.now();
    if (!client.paused) used += now - last; // 一時停止中は制限時間を進めない
    last = now;
    const left = 1 - used / ms;
    const bar = $("#tbar");
    if (bar) bar.style.width = Math.max(0, left * 100) + "%";
    if (left <= 0) { clearInterval(c.timer); onEnd(); }
  }, 50);
}
function stopAnswerUI() {
  const c = client.game?.cur;
  if (!c) return;
  clearInterval(c.timer);
  try { c.rec && c.rec.abort(); } catch {}
  c.choices = null;
}
function stopAll() {
  const c = client.game?.cur;
  if (c) { c.delayTimer?.cancel(); c.streamTimer?.cancel(); c.paused = true; stopAnswerUI(); c.token = null; }
  stopSpeak();
}

function onReveal(m) {
  const g = client.game, c = g.cur;
  if (!c) return;
  stopAnswerUI(); pauseStream();
  if (c.myState === "answering") c.myState = "done";
  c.myState = c.myState === "done" ? "done" : "over";
  updateBuzz();
  g.scores = m.scores;
  drawScoreboard();
  drawText(true);
  recordReveal(m.q, m.results, g.players);
  recordMine(m.q, m.results[profile.id]);
  const rows = Object.entries(m.results).map(([pid, r]) => `<div>${esc(nameOf(pid))}：<span class="${r.ok ? "result-ok" : "result-ng"}">${r.ok ? "○" : "×"}</span> <span class="muted">${esc(r.text)}</span></div>`).join("");
  $("#answer-area").innerHTML = `<div style="font-size:22px">正解：<b>${esc(m.q.answer)}</b> <span class="muted">（${esc(m.q.reading)}）</span></div>${rows || `<div class="muted">誰も押しませんでした</div>`}`;
  setStatus("");
  g.resultsLog = g.resultsLog || {};
  g.resultsLog[m.q.id] = m.results;
  drawGhosts(true);
}

// ---------- 画面: ゲーム終了（ブーイング） ----------
function onEnd(m) {
  stopAll();
  const g = client.game;
  g.over = true;
  client.paused = false;
  drawPause();
  g.myBoos = new Set();
  g.endLog = m.log;
  const solo = m.players.length < 2;
  const myDelta = m.deltas[profile.id] || 0;
  if (!solo) { profile.rating += myDelta; profile.games = (profile.games || 0) + 1; saveProfile(); }
  const ranking = m.players.slice().sort((a, b) => (m.scores[b.id] || 0) - (m.scores[a.id] || 0));
  const dailyHTML = client.daily ? dailyResultHTML(m) : "";
  app.innerHTML = dailyHTML + (client.daily ? "" : `
  <div class="card">
    <h2>結果</h2>
    <table><tr><th>順位</th><th>名前</th><th>正解数</th><th>レーティング</th></tr>
    ${ranking.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td>${m.scores[p.id] || 0}</td><td>${solo ? "（1人プレイは変動なし）" : `${Math.round(p.rating)} → ${Math.round(p.rating + (m.deltas[p.id] || 0))}（${(m.deltas[p.id] || 0) >= 0 ? "+" : ""}${m.deltas[p.id] || 0}）`}</td></tr>`).join("")}
    </table>
  </div>`) + `
  <div class="card">
    <h2>出た問題</h2>
    <p class="muted">悪い問題だと思ったら ${THUMB_DOWN.replace('width="22" height="22"', 'width="14" height="14"')} を押してください（もう一度押すと取り消し）。</p>
    <table>${m.log.map((l) => { const q = QMAP[l.qid] || g.qs.find((x) => x.id === l.qid); const r = l.results[profile.id]; return `<tr><td>${esc(q.text)}<br><b>${esc(q.answer)}</b> <span class="muted">あなた：${!r ? "答えず" : r.ok ? "○" : "×"}</span></td><td><button class="boo" data-q="${esc(l.qid)}" title="よくない問題" aria-label="よくない問題" aria-pressed="false">${THUMB_DOWN}</button></td></tr>
      <tr class="boo-row" data-q="${esc(l.qid)}" hidden><td colspan="2"><div class="boo-form" data-q="${esc(l.qid)}">
        <div class="muted">よくないと思った理由（任意・いくつでも）</div>
        <div class="boo-reasons">${BOO_REASONS.map((x) => `<label><input type="checkbox" value="${esc(x)}"> ${esc(x)}</label>`).join("")}</div>
        <div class="row"><input type="text" class="boo-text" maxlength="200" placeholder="具体的に（例：○○も正解になる）" style="flex:1;min-width:200px"><button class="sub boo-send">理由を送る</button><span class="muted boo-sent"></span></div>
      </div></td></tr>`; }).join("")}</table>
  </div>
  <div class="row">${client.daily ? `<button id="leave">トップに戻る</button>` : `${client.isHost ? `<button id="again">部屋に戻る</button>` : `<span class="muted">部屋を立てた人が戻るのを待っています</span>`}<button class="sub" id="leave">部屋を出る</button>`}</div>`;
  bindDailyShare();
  for (const b of document.querySelectorAll(".boo")) b.onclick = () => client.send({ t: "boo", qid: b.dataset.q, on: !g.myBoos.has(b.dataset.q) });
  for (const f of document.querySelectorAll(".boo-form")) {
    f.querySelector(".boo-send").onclick = () => {
      const reasons = [...f.querySelectorAll("input[type=checkbox]:checked")].map((x) => x.value);
      const text = f.querySelector(".boo-text").value.trim();
      if (!reasons.length && !text) { f.querySelector(".boo-sent").textContent = "理由を選ぶか書いてください"; return; }
      f.querySelector(".boo-sent").textContent = "送信中…";
      client.send({ t: "booReason", qid: f.dataset.q, reasons, text });
    };
  }
  $("#leave").onclick = leaveRoom;
  if (client.isHost && $("#again")) $("#again").onclick = () => client.host.lobby();
}
function drawBooButtons() {
  const g = client.game;
  for (const b of document.querySelectorAll(".boo")) { const on = g.myBoos.has(b.dataset.q); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }
  for (const r of document.querySelectorAll(".boo-row")) r.hidden = !g.myBoos.has(r.dataset.q);
}

// ---------- 画面: 統計 ----------
function renderStats() {
  stopAll();
  const rows = window.QUESTIONS.map((q) => ({ q, s: stats[q.id] })).sort((a, b) => (b.s?.answered || 0) - (a.s?.answered || 0));
  const pct = (c, a) => (a ? Math.round((100 * c) / a) + "%" : "—");
  const genres = Object.entries(me.genre).sort((a, b) => b[1].answered - a[1].answered);
  const reasonCount = (s) => { const c = {}; for (const e of s.booReasons || []) for (const r of e.reasons) c[r] = (c[r] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join("、"); };
  const reasonTexts = (s) => (s.booReasons || []).filter((e) => e.text).map((e) => `${e.name}（${e.cat === "correct" ? "正解者" : e.cat === "wrong" ? "不正解者" : "未解答"}）：${e.text}`).join("\n");
  app.innerHTML = `
  <div class="card">
    <h2>あなたの成績（${esc(profile.name)}）</h2>
    <p>全体：出題 ${me.total.seen}問 ／ 解答 ${me.total.answered}問 ／ 正解 ${me.total.correct}問 ／ 正答率 <b>${pct(me.total.correct, me.total.answered)}</b>（押した問題のうち） ／ 出題に対する正解率 ${pct(me.total.correct, me.total.seen)}</p>
    <table><tr><th>ジャンル</th><th>出題</th><th>解答</th><th>正解</th><th>正答率</th><th>正解率（出題比）</th></tr>
    ${genres.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.seen}</td><td>${v.answered}</td><td>${v.correct}</td><td>${pct(v.correct, v.answered)}</td><td>${pct(v.correct, v.seen)}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">まだ記録がありません</td></tr>`}
    </table>
    <h3>押した位置（問題文の何%まで出たところで押したか）</h3>
    <div class="row" style="align-items:flex-start;gap:30px">
      <div>${posChart(me.pos, "正解したとき")}${posAvg(me.pos) != null ? `<div class="muted">平均 約${posAvg(me.pos)}%</div>` : ""}</div>
      <div>${posChart(me.posWrong, "不正解だったとき")}${posAvg(me.posWrong) != null ? `<div class="muted">平均 約${posAvg(me.posWrong)}%</div>` : ""}</div>
    </div>
    <p class="muted">記録はこの端末のこの名前（プロフィール）に保存されます。端末をまたいだアカウント機能は未対応です。</p>
  </div>
  <div class="card">
    <h2>問題ごとの記録（この端末）</h2>
    <p class="muted">正答率＝正解数 ÷ 答えた人数。ランク別はそのランクで${RANK_MIN_SAMPLES}件以上たまると出題の重み付けに使います。悪問候補＝正解した人から2件以上、かつ正解数の2割以上の${THUMB_DOWN.replace('width="22" height="22"', 'width="14" height="14"')}。</p>
    <table><tr><th>ジャンル</th><th>答え</th><th>答えた</th><th>正答率</th><th>ランク別</th><th>問題レート</th><th>正解時の押し位置</th><th>${THUMB_DOWN.replace('width="22" height="22"', 'width="14" height="14"')}（正解者/不正解者/未解答）</th><th>${THUMB_DOWN.replace('width="22" height="22"', 'width="14" height="14"')}の理由</th></tr>
    ${rows.map(({ q, s }) => `<tr><td>${esc(q.genre)}</td><td>${esc(q.answer)}</td><td>${s?.answered || 0}</td><td>${pct(s?.correct, s?.answered)}</td><td>${s ? Object.entries(s.byRank).map(([k, v]) => `${k}:${pct(v.correct, v.answered)}`).join(" ") : ""}</td><td>${s ? Math.round(s.rating) : ""}</td><td>${s?.pos && posAvg(s.pos) != null ? `平均${posAvg(s.pos)}%（${s.pos.reduce((a, b) => a + b, 0)}件）` : ""}</td><td>${s ? `${s.boo.correct}/${s.boo.wrong}/${s.boo.none}` : ""}${isBadCandidate(s) ? ` <b class="result-ng">悪問候補</b>` : ""}</td><td>${s ? `<span title="${esc(reasonTexts(s))}">${esc(reasonCount(s))}${reasonTexts(s) ? " 💬" : ""}</span>` : ""}</td></tr>`).join("")}
    </table>
    <div class="row" style="margin-top:12px"><button class="sub" id="back">戻る</button><button class="sub" id="export">記録をJSONで保存</button></div>
  </div>`;
  $("#back").onclick = renderHome;
  $("#export").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ profile, me, stats }, null, 1)], { type: "application/json" }));
    a.download = "easy-hayaoshi-stats.json"; a.click();
  };
}

// ---------- キー操作 ----------
document.addEventListener("keydown", (e) => {
  const c = client.game?.cur;
  if (!c) return;
  const inInput = document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if (e.key === "Escape" || (e.key.toLowerCase() === "p" && !inInput)) { if (!client.game.over) { e.preventDefault(); togglePause(); } return; }
  if (client.paused) return;
  if (e.code === "Space" && !inInput) { e.preventDefault(); buzz(); return; }
  if (c.myState === "answering" && c.choices && /^[1-4]$/.test(e.key)) { e.preventDefault(); pickChoice(Number(e.key) - 1); }
});

drawMe();
renderHome();
