"""questions*.js の全問を JSON に書き出す（事実確認などの検証用）。"""
import json, re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
out = []
for fn in ["questions.js", "questions2.js", "questions3.js"]:
    src = (root / fn).read_text(encoding="utf-8")
    for m in re.finditer(r'\{\s*"?id"?:.*?\}(?=\s*,?\s*(?:\n|\)|\]))', src, re.S):
        s = m.group(0)
        s = re.sub(r'([{,]\s*)([A-Za-z_]+)\s*:(?!\s*\/)', r'\1"\2":', s)
        s = re.sub(r',\s*([}\]])', r'\1', s)
        try:
            o = json.loads(s)
        except Exception as e:
            print("PARSE FAIL", fn, s[:80], e, file=sys.stderr); continue
        o["file"] = fn
        out.append(o)
p = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / "all_questions.json"
p.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
print(len(out), "questions ->", p)
