// 全問の自動検査（ブラウザで サイトを開き、開発者ツールのコンソールに貼って実行する。PCに node が無いため）
// build_questions.py の検査（答えの重複・問題文に答え・読みの形式）に加えて、画面の判定と4択を全問で確かめる。
// 1) 自分の答え・読み・別解が、判定で正解になるか
// 2) 問題文（出し方が複数ならすべて）が「？」で終わっているか
// 3) ひらがな4択が、全問・全文字で「4つ・重複なし・正解を含む」か（各3回）
// 4) ほかの問題の答えを入れたときに誤って○になる組み合わせ（増えていないかを見る。2026-11-28時点で32組、どれも許容範囲）
(() => {
  speechSynthesis.cancel();
  const Q = window.QUESTIONS, out = { total: Q.length, selfFail: [], noQ: [], choiceFail: [], dupId: [], falsePositive: [] };
  const ids = new Set();
  for (const q of Q) {
    if (ids.has(q.id)) out.dupId.push(q.id);
    ids.add(q.id);
    for (const s of [q.answer, q.reading, ...(q.accept || [])]) if (!judgeText(q, s)) out.selfFail.push(q.id + " " + s);
    for (const v of q.variants || [{ text: q.text }]) if (!v.text.endsWith("？")) out.noQ.push(q.id);
    const r = [...q.reading];
    for (let pos = 0; pos < r.length; pos++) for (let k = 0; k < 3; k++) {
      const ch = makeChoices(q, pos);
      if (ch.length !== 4 || new Set(ch).size !== 4 || !ch.includes(r[pos])) { out.choiceFail.push(q.id + "@" + pos); break; }
    }
  }
  const answers = Q.map((o) => o.answer);
  for (let i = 0; i < Q.length; i++) for (let j = 0; j < Q.length; j++) if (i !== j && judgeText(Q[i], answers[j])) out.falsePositive.push(Q[i].answer + " ← " + answers[j]);
  console.log(out);
  return out;
})();
