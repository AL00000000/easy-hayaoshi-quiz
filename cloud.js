// ===================== アカウント（端末をまたぐ記録）と共有ランキング =====================
// Firebase（Google のサービス。無料枠の Spark プラン）を使う。
// - ログインは「匿名アカウント」。メールアドレスや Google アカウントは使わない。
// - 別の端末へは「引き継ぎコード」で記録を写す（元の端末の記録も残る）。
// - 名前・レーティング・対戦数・自分の成績を players/{uid} に保存し、レーティングの上位をランキングに出す。
// Firebase の SDK は、使うときにだけ読み込む（ネットにつながらないときは、今までどおり端末の中だけで動く）。
// app.js のあとに読む。app.js の profile / me / saveProfile / saveMe / myKey / LS / esc / $ / app / renderHome を使う。
const FB_VER = "13.4.0";
const FB_CONFIG = {
  apiKey: "AIzaSyCB38fZxheY8dQePWJlkpJP8M6uGH58-es",
  authDomain: "easy-hayaoshi-quiz.firebaseapp.com",
  projectId: "easy-hayaoshi-quiz",
  storageBucket: "easy-hayaoshi-quiz.firebasestorage.app",
  messagingSenderId: "234787394720",
  appId: "1:234787394720:web:51c9fa10f6acdc4fa9a5c5",
};
const cloud = { ready: null, uid: null, fs: null, db: null, timer: null, error: null };

function cloudInit() {
  if (cloud.ready) return cloud.ready;
  cloud.ready = (async () => {
    const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
    const [{ initializeApp }, auth, fs] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
    const fbApp = initializeApp(FB_CONFIG);
    const a = auth.getAuth(fbApp);
    const user = a.currentUser || (await new Promise((ok) => { const off = auth.onAuthStateChanged(a, (u) => { off(); ok(u); }); })) || (await auth.signInAnonymously(a)).user;
    cloud.uid = user.uid;
    cloud.fs = fs;
    cloud.db = fs.getFirestore(fbApp);
    return cloud;
  })().catch((e) => { cloud.error = e; cloud.ready = null; throw e; });
  return cloud.ready;
}

// 端末の記録をクラウドへ写す（保存のたびに呼ばれるので、2秒まとめてから1回だけ書く）
function cloudSync() {
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(async () => {
    try {
      const c = await cloudInit();
      await c.fs.setDoc(c.fs.doc(c.db, "players", c.uid), {
        name: String(profile.name).slice(0, 16), rating: Math.round(profile.rating), games: profile.games || 0,
        profileId: profile.id, me, updated: c.fs.serverTimestamp(),
      });
    } catch (e) { console.warn("cloudSync", e); }
  }, 2000);
}

// 引き継ぎコード：読み間違えやすい文字（0/O, 1/I/L）を除いた10文字
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
const fmtCode = (c) => c.replace(/(.{5})(.{5})/, "$1-$2");

async function issueCode() {
  const c = await cloudInit();
  cloudSync();
  const code = newCode();
  await c.fs.setDoc(c.fs.doc(c.db, "transfers", code), { uid: c.uid, created: c.fs.serverTimestamp() });
  LS.set("ehq.transferCode", code);
  return code;
}

// 別の端末の記録を、この端末に写す
async function redeemCode(input) {
  const code = String(input).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 10) throw new Error("コードは10文字です（ハイフンはあってもなくても大丈夫です）");
  const c = await cloudInit();
  const t = await c.fs.getDoc(c.fs.doc(c.db, "transfers", code));
  if (!t.exists()) throw new Error("このコードは見つかりませんでした");
  const src = t.data().uid;
  if (src === c.uid) throw new Error("この端末で発行したコードです");
  const p = await c.fs.getDoc(c.fs.doc(c.db, "players", src));
  if (!p.exists()) throw new Error("元の端末の記録がまだクラウドにありません（元の端末で一度ゲームを遊んでから、もう一度お試しください）");
  const d = p.data();
  profile = { id: d.profileId || profile.id, name: d.name, rating: d.rating, games: d.games || 0 };
  LS.set("ehq.profile", profile);
  me = d.me || me;
  LS.set(myKey(), me);
  drawMe();
  cloudSync();
  return d;
}

async function loadRanking(n = 50) {
  const c = await cloudInit();
  const f = c.fs;
  const snap = await f.getDocs(f.query(f.collection(c.db, "players"), f.orderBy("rating", "desc"), f.limit(n * 2)));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((r) => r.games > 0).slice(0, n);
}

// ---------- 画面: アカウントとランキング ----------
async function renderCloud() {
  stopAll();
  const saved = LS.get("ehq.transferCode", null);
  app.innerHTML = `
  <div class="card">
    <h2>ランキング（レーティング）</h2>
    <p class="muted">2人以上の対戦を1回以上した人の上位50人です。</p>
    <div id="ranking">読み込み中…</div>
  </div>
  <div class="card">
    <h2>別の端末で続きを遊ぶ</h2>
    <p class="muted">この端末で「引き継ぎコード」を出し、別の端末で入力すると、名前・レーティング・成績がその端末に写ります。メールアドレスなどの登録はいりません。</p>
    <div class="row"><button id="issue">${saved ? "引き継ぎコードを表示" : "引き継ぎコードを発行"}</button><span id="code-out" class="code" style="font-size:22px"></span></div>
    <p class="muted">コードを知っている人は、あなたの記録を自分の端末に写せます。人に教えないでください。</p>
    <h3>引き継ぎコードを入力する</h3>
    <div class="row"><input type="text" id="code-in" maxlength="11" placeholder="XXXXX-XXXXX" autocomplete="off" style="text-transform:uppercase"><button class="sub" id="redeem">この端末に写す</button></div>
    <p class="muted">入力すると、この端末の今の記録は、写した記録に置き換わります。</p>
    <div id="cloud-msg"></div>
  </div>
  <div class="row"><button class="sub" id="back">戻る</button></div>`;
  $("#back").onclick = renderHome;
  const msg = (t, ok) => { $("#cloud-msg").innerHTML = `<p class="${ok ? "result-ok" : "result-ng"}">${esc(t)}</p>`; };
  $("#issue").onclick = async () => {
    try { const code = LS.get("ehq.transferCode", null) || (await issueCode()); $("#code-out").textContent = fmtCode(code); }
    catch (e) { msg("コードを発行できませんでした（ネットにつながっているか確認してください）", false); console.warn(e); }
  };
  $("#redeem").onclick = async () => {
    if (!confirm("この端末の今の記録を、引き継ぎコードの記録に置き換えます。よろしいですか？")) return;
    try { const d = await redeemCode($("#code-in").value); msg(`「${d.name}」さんの記録を写しました（レーティング ${Math.round(d.rating)}）`, true); }
    catch (e) { msg(e.message && !/firebase|permission/i.test(e.message) ? e.message : "写せませんでした（コードとネットの接続を確認してください）", false); console.warn(e); }
  };
  try {
    const rows = await loadRanking();
    const box = $("#ranking");
    if (!box) return;
    box.innerHTML = rows.length
      ? `<table class="rank-table"><tbody>${rows.map((r, i) => `<tr${r.uid === cloud.uid ? ' class="me-row"' : ""}><td>${i + 1}</td><td>${esc(r.name)}</td><td><span class="rank">${rankOf(r.rating)}</span> ${Math.round(r.rating)}</td><td class="muted">${r.games}戦</td></tr>`).join("")}</tbody></table>`
      : `<p class="muted">まだ記録がありません。</p>`;
  } catch (e) {
    const box = $("#ranking");
    if (box) box.innerHTML = `<p class="muted">ランキングを読み込めませんでした（ネットにつながっているか確認してください）。</p>`;
    console.warn(e);
  }
}

// 起動時に一度、今の記録をクラウドへ写す（オフラインなら何もしない）
if (navigator.onLine) cloudSync();
