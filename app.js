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
  // 出題：「デデン」
  start() {
    for (const [f, st, d] of [[196, 0, 0.16], [131, 0.2, 0.7]]) {
      this.tone(f, st, d, { type: "sawtooth", vol: 0.22, filter: 1400 });
      this.tone(f / 2, st, d, { type: "square", vol: 0.12, filter: 600 });
    }
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
function judgeText(q, text) {
  const n = norm(text);
  if (!n) return false;
  const set = acceptSet(q);
  return set.has(n) || set.has(n.replace(/です$/, ""));
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
    this.qlist = pickQuestions(s.count, this.roomRank);
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
    const q = this.qlist[this.qi];
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
  return Object.assign({ mode: 1, input: "choice", pct: 50, count: 10, tts: true, charMs: 120 }, LS.get("ehq.settings", {}));
}

// 正答率の低い問題ほど高ランクの部屋で多く出す
function pickQuestions(count, rank) {
  const target = RANK_TARGET[rank];
  const items = window.QUESTIONS.map((q) => {
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
    if (!client.game || client.game.over) renderLobby();
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

// ---------- 画面: ホーム ----------
function renderHome() {
  stopAll();
  app.innerHTML = `
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
  <div class="card"><div class="row"><button class="sub" id="stats">自分の成績・問題ごとの記録を見る</button><button class="sub" id="submit-q">問題を投稿する</button></div></div>`;
  $("#save-name").onclick = () => { profile.name = $("#name").value.trim() || profile.name; saveProfile(); };
  $("#solo").onclick = () => createRoom(false);
  $("#create").onclick = () => createRoom(true);
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
  client.host.open(() => { client.host.handle(null, { t: "join", id: profile.id, name: profile.name, rating: profile.rating }); }, (err) => { alert(err); leaveRoom(); });
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
  Object.assign(client, { host: null, conn: null, peer: null, isHost: false, game: null, paused: false });
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
    const ns = { mode, input, pct: Number($("#s-pct").value), count: Number($("#s-count").value), charMs: Number($("#s-speed").value), tts: $("#s-tts").checked };
    LS.set("ehq.settings", ns);
    client.host.setSettings(ns);
  };
  for (const id of ["s-mode", "s-pct", "s-input", "s-count", "s-speed", "s-tts"]) $("#" + id).onchange = read;
  $("#go").onclick = () => client.host.start();
}

// ---------- 画面: ゲーム ----------
function renderGame() {
  const g = client.game;
  app.innerHTML = `
  <div class="card">
    <div class="row" style="justify-content:space-between"><b id="qno"></b><span class="muted">部屋のランク <span class="rank">${g.roomRank}</span>・${g.settings.mode === 1 ? "方式1" : "方式2"}・${g.settings.input === "voice" ? "音声入力" : "ひらがな4択"}</span></div>
    <div id="scoreboard" class="players"></div>
  </div>
  <div class="card" id="game-card">
    <div id="qtext"></div>
    <div class="status" id="status"></div>
    <div id="answer-area"></div>
    <button id="buzz" disabled>押す！（スペース）</button>
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
    <input type="text" id="voice-input" class="voice-text" style="width:100%" autocomplete="off">
    <div class="row" style="margin-top:8px"><button id="voice-ok">この答えで解答（Enter）</button>${SR ? `<button class="sub" id="voice-retry">言い直す</button>` : ""}</div>`;
  const inp = $("#voice-input");
  inp.focus();
  const submit = () => submitAnswer(judgeText(c.q, inp.value), inp.value);
  inp.onkeydown = (e) => { if (client.paused) { e.preventDefault(); return; } if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); submit(); } };
  $("#voice-ok").onclick = submit;
  if (SR) { $("#voice-retry").onclick = () => { inp.value = ""; startRecognition(inp); }; startRecognition(inp); }
  startTimer(VOICE_MS, submit);
}
function startRecognition(inp) {
  const c = client.game.cur;
  try { c.rec && c.rec.abort(); } catch {}
  const rec = new SR();
  rec.lang = "ja-JP"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 5;
  rec.onresult = (e) => {
    let t = "";
    for (const r of e.results) {
      // 候補の中に正解があればそれを採用（同音の別表記で誤判定するのを減らす）
      let best = r[0].transcript;
      if (r.isFinal) for (const alt of r) if (judgeText(c.q, alt.transcript)) { best = alt.transcript; break; }
      t += best;
    }
    inp.value = t.replace(/[。、]/g, "");
  };
  rec.onerror = (e) => { if (e.error === "not-allowed") setStatus("マイクが許可されていません。答えを入力して Enter で解答してください。"); };
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
    if (c && c.myState === "answering" && inp && SR) startRecognition(inp);
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
  app.innerHTML = `
  <div class="card">
    <h2>結果</h2>
    <table><tr><th>順位</th><th>名前</th><th>正解数</th><th>レーティング</th></tr>
    ${ranking.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td>${m.scores[p.id] || 0}</td><td>${solo ? "（1人プレイは変動なし）" : `${Math.round(p.rating)} → ${Math.round(p.rating + (m.deltas[p.id] || 0))}（${(m.deltas[p.id] || 0) >= 0 ? "+" : ""}${m.deltas[p.id] || 0}）`}</td></tr>`).join("")}
    </table>
  </div>
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
  <div class="row">${client.isHost ? `<button id="again">部屋に戻る</button>` : `<span class="muted">部屋を立てた人が戻るのを待っています</span>`}<button class="sub" id="leave">部屋を出る</button></div>`;
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
  if (client.isHost) $("#again").onclick = () => client.host.lobby();
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
