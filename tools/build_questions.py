"""data/*.txt（1行1問の短い書式）から questions3.js を作り、問題の不備を検査する。
書式: ジャンル|問題文|答え|読み|別解;別解|読み上げ用文|もう一回;もう一回
  - 読みは省略可（答えがカナだけなら自動でひらがなにする）
  - 別解・読み上げ用文・もう一回は省略可。「もう一回」は惜しい答え（正解にはしないが、1回だけ答え直せる）。
    入力に答え・別解がまるごと含まれる場合（みずほ→みずほ銀行）は自動で「もう一回」になるので、それ以外の惜しい答えだけを書く。
  - 「元素記号Xx」は読み上げで自動的にアルファベット読みにする
使い方: python tools/build_questions.py
"""
import glob, json, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LETTER = {c: n for c, n in zip("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "エー ビー シー ディー イー エフ ジー エイチ アイ ジェー ケー エル エム エヌ オー ピー キュー アール エス ティー ユー ブイ ダブリュー エックス ワイ ゼット".split())}


def to_hira(s):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def norm(s):
    s = unicodedata.normalize("NFKC", s)
    s = to_hira(s)
    return re.sub(r"[\s・、。.,，．!！?？「」『』（）()＝=〜~\"'’]", "", s)


def tts_for(text):
    def rep(m):
        sym = m.group(1)
        return "元素記号" + "・".join(LETTER[c.upper()] for c in sym)
    t = re.sub(r"元素記号([A-Z][a-z]?)", rep, text)
    return t if t != text else None


def existing_questions():
    out = []
    for f in ["questions.js", "questions2.js"]:
        s = open(os.path.join(ROOT, f), encoding="utf-8").read()
        for m in re.finditer(r'id: "([^"]+)".*?answer: "([^"]+)", reading: "([^"]+)", accept: \[([^\]]*)\]', s):
            acc = re.findall(r'"([^"]+)"', m.group(4))
            out.append({"id": m.group(1), "answer": m.group(2), "reading": m.group(3), "accept": acc})
    return out


def main():
    rows, problems = [], []
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "*.txt"))):
        base = os.path.splitext(os.path.basename(path))[0]
        n = 0
        for ln, line in enumerate(open(path, encoding="utf-8"), 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("|")
            if len(parts) < 3:
                problems.append(f"{base}:{ln} 列が足りない: {line}")
                continue
            parts += [""] * (7 - len(parts))
            genre, text, answer, reading, accept, tts, retry = [p.strip() for p in parts[:7]]
            if not reading:
                reading = to_hira(re.sub(r"[・＝=\s]", "", answer))
            n += 1
            q = {"id": f"{base}-{n:03d}", "genre": genre, "text": text, "answer": answer, "reading": reading,
                 "accept": [a for a in accept.split(";") if a]}
            t = tts or tts_for(text)
            if t:
                q["tts"] = t
            if retry:
                q["retry"] = [a for a in retry.split(";") if a]
            q["_where"] = f"{base}:{ln}"
            rows.append(q)

    old = existing_questions()
    seen = {norm(q["answer"]): q["id"] for q in old}
    for q in rows:
        w = q["_where"]
        if not re.fullmatch(r"[ぁ-んー]+", q["reading"]):
            problems.append(f"{w} 読みがひらがなでない: {q['reading']} ({q['answer']})")
        na = norm(q["answer"])
        if na in seen:
            problems.append(f"{w} 答えが重複: {q['answer']}（{seen[na]}）")
        seen[na] = q["id"]
        t = norm(q["text"])
        for a in {q["answer"], q["reading"], *q["accept"]}:
            a = norm(a)
            if len(a) >= 2 and a in t:
                problems.append(f"{w} 答え「{a}」が問題文に入っている: {q['answer']}")
        ok_forms = {norm(a) for a in (q["answer"], q["reading"], *q["accept"])}
        for r in q.get("retry", []):
            if norm(r) in ok_forms:
                problems.append(f"{w} 「もう一回」に正解と同じ答えがある: {r}")
        if not q["text"].endswith("？"):
            problems.append(f"{w} 問題文が「？」で終わっていない")

    js = "// 追加問題（tools/build_questions.py が data/*.txt から生成。直接編集しない）\nwindow.QUESTIONS.push(\n"
    for q in rows:
        q = {k: v for k, v in q.items() if not k.startswith("_")}
        js += "  " + json.dumps(q, ensure_ascii=False) + ",\n"
    js += ");\n"
    open(os.path.join(ROOT, "questions3.js"), "w", encoding="utf-8", newline="\n").write(js)
    print(f"追加 {len(rows)} 問（既存 {len(old)} 問、合計 {len(rows) + len(old)} 問）")
    for p in problems:
        print("要確認:", p)
    print(f"要確認 {len(problems)} 件")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
