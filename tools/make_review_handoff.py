"""問題の見直しを claude.ai のチャットで相談するための引き継ぎファイルを作る。

使い方:
    python tools/make_review_handoff.py            # 株式（既定）
    python tools/make_review_handoff.py 08_pokemon # data/08_pokemon.txt の問題

出力先はリポジトリの外（C:\\Users\\yt\\easy-hayaoshi-<名前>-review.md）。公開サイトには載らない。
問題の一覧は生成済みの questions3.js から取るので、先に build_questions.py を実行しておくこと。
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
base = sys.argv[1] if len(sys.argv) > 1 else "09_stock"
short = base.split("_", 1)[-1]
out = Path.home() / f"easy-hayaoshi-{short}-review.md"

qs = []
for line in (ROOT / "questions3.js").read_text(encoding="utf-8").splitlines():
    line = line.strip().rstrip(",")
    if line.startswith("{") and f'"id": "{base}-' in line:
        qs.append(json.loads(line))
if not qs:
    sys.exit(f"{base} の問題が questions3.js に見つかりません（build_questions.py を先に実行）")

# data/*.txt の見出し（# ---- 〇〇 ----）を、その後の問題の前に出す
heads, n = {}, 0
for line in (ROOT / "data" / f"{base}.txt").read_text(encoding="utf-8").splitlines():
    s = line.strip()
    m = re.match(r"#\s*-+\s*(.+?)\s*-+\s*$", s)
    if m:
        heads[n + 1] = m.group(1)
    elif s and not s.startswith("#"):
        n += 1

def cell(s):
    return s.replace("|", "／").replace("\n", " ")

rows = []
for i, q in enumerate(qs, 1):
    if i in heads:
        rows.append(f"\n### {heads[i]}\n\n| ID | 問題文 | 答え | 読み | 別解 |\n|---|---|---|---|---|")
    elif i == 1:
        rows.append("\n| ID | 問題文 | 答え | 読み | 別解 |\n|---|---|---|---|---|")
    num = q["id"].rsplit("-", 1)[1]
    rows.append(f"| {num} | {cell(q['text'])} | {cell(q['answer'])} | {q['reading']} | {cell('、'.join(q.get('accept', [])))} |")

today = date.today().isoformat()
doc = f"""# 簡単早押しクイズ「{short}」の問題見直し 引き継ぎ（{today} 作成・{len(qs)}問）

このファイルを claude.ai の新しいチャットに添付（またはそのまま貼り付け）して、「これを読んで、問題の見直しを手伝って」と送る。

---

## あなた（Claude）への依頼

私（ユーザー）が作っている早押しクイズのサイトの問題を、このチャットで一緒に見直したい。
「この問題は良くない」「ここを直したい」という話を私がするので、相談に乗って、最後に修正内容をまとめてほしい。
実際のファイルの書き換えは、このチャットではなく、別の Claude Code（PC側）が行う。だから、このチャットの最終成果物は「修正のまとめ」（書式は下に指定）。

### サイトの概要
- 簡単早押しクイズ（株式版：https://al00000000.github.io/easy-hayaoshi-quiz/stock/ ）。株にくわしくないライト層も遊ぶ想定。
- 問題文が1文字ずつ流れ、早押しして答える。答えは「ひらがな4択を1文字ずつ選ぶ」か「音声入力」。
  そのため **読み（ひらがな）が正しいこと**、**答えが1つに決まること** が大事。
- 答えの判定は甘め（誤って×にしない方に倒す）。表記ゆれ（株式会社の有無、英字とカナ）は「別解」に入れる。

### 問題づくりのルール（これまでに決めたこと）
1. 決まった顔ぶれのもの（東証3市場、5大商社、3メガバンク、海運大手3社、陽線と陰線 など）は全部そろえる。一部だけだと消去法で絞れてしまうため。
2. 対になる問題は、片方の問題文にもう片方の答えを書かない（例：前場の問題文に「後場」と書かない）。ほかの問題の答えが問題文に出るのも避ける。
3. 会社四季報の文章は写さない。公開されている事実（沿革・証券コード・事業内容）から作る。
4. 実在の会社や人物の真偽不明なうわさは入れない。広く報道された出来事と、投資家の言葉は入れてよい。
5. 社名が変わった会社は「ナムコ（現・バンダイナムコ）」のように書く。
6. 時点で変わる事実（株価・上限額・社名・上場市場など）は、問題文に時点を書くか、変わりにくい事実にする。
7. 確かめられる事実は推測で書かない。事実の確認が要るときはウェブ検索で確かめ、確かめていないものは「未確認」とはっきり書く。

### 問題の番号（ID）について
- 各問題には番号（下の表の ID）があり、成績の記録や「よくない問題」の評価がこの番号に付いている。
- **問題を消すと、それより後ろの番号が全部ずれる**。だから消すのではなく、次のどちらかにする。
  - 文言の修正：その番号のまま直す（記録はそのまま引き継がれる）。
  - 別の問題に差し替え：その番号の中身を新しい問題に置き換える（古い記録が新しい問題に付くことは了承のうえで）。
- 新しい問題は一覧の最後に足す。

### 話し方
- 日本語で。私の理解が間違っていたら遠慮なく指摘してほしい。
- 私が番号で問題を挙げたら、何が問題か・どう直すかを一緒に考える。あなたからも「これは答えが複数ありうる」「これは時点で変わる」「読みが違う」などを積極的に指摘してよい。
- 好みで決まる話（難しすぎる・つまらない等）は、一般論で決めずに私に聞き返す。

### 最後のまとめの書式（私が「まとめて」と言ったら、これだけをコードブロックで出す）

```
# 株式の問題 修正まとめ（YYYY-MM-DD）
## 修正（番号はそのまま）
- 09_stock-012｜変更する項目：問題文／答え／読み／別解｜新：（新しい内容をそのまま）｜理由：〜
## 差し替え（番号はそのまま、中身を別の問題に）
- 09_stock-034｜新しい行：株式|問題文|答え|読み|別解;別解｜理由：〜
## 追加（一覧の最後に足す）
- 株式|問題文|答え|読み|別解;別解
## 保留・未確認
- 09_stock-056｜〜（事実を確かめられなかった、私の判断待ち など）
```
- 行の書式は `株式|問題文|答え|読み|別解;別解`。読みはひらがな。別解は「;」区切り。
- まとめは、私が Claude Code に「C:\\Users\\yt\\easy-hayaoshi-stock-handoff.md を読んで、このまとめを反映して」と添えて貼る。

---

## いまの問題一覧（{len(qs)}問、ID は「{base}-番号」）
{chr(10).join(rows)}
"""
out.write_text(doc, encoding="utf-8")
print(f"{out} を作成（{len(qs)}問）")
