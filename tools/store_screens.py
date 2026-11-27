"""Google Play 用のスマホ画面スクリーンショットを撮る（1080×2160、縦横比2:1以内）。
ローカルサーバー（python -m http.server 8766）を立ててから実行する。Playwright が入った Python で動かす。"""
import pathlib, time
from playwright.sync_api import sync_playwright
OUT = pathlib.Path(__file__).resolve().parent.parent / "store" / "screenshots"
URL = "http://localhost:8766/"
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 400, "height": 800}, device_scale_factor=2.7, is_mobile=True, has_touch=True, locale="ja-JP")
    pg = ctx.new_page()
    pg.goto(URL); pg.wait_for_load_state("networkidle")
    pg.evaluate("""() => { localStorage.clear(); }""")
    pg.reload(); pg.wait_for_load_state("networkidle")
    pg.evaluate("""() => { profile.name = 'クイズ好き'; saveProfile(); renderHome(); }""")
    pg.screenshot(path=str(OUT / "01_home.png"))
    pg.evaluate("""() => { [...document.querySelectorAll('button')].find(x => x.textContent.includes('ひとり')).click(); }""")
    time.sleep(0.5)
    pg.evaluate("""() => { client.host.setSettings({ ...client.settings, count: 5, tts: false, charMs: 90 }); }""")
    time.sleep(0.3)
    pg.screenshot(path=str(OUT / "02_settings.png"))
    pg.evaluate("""() => { [...document.querySelectorAll('button')].find(x => x.textContent.includes('開始')).click(); }""")
    pg.wait_for_function("() => client.game && client.game.cur && client.game.cur.shown > 22", timeout=20000)
    pg.screenshot(path=str(OUT / "03_question.png"))
    pg.evaluate("() => buzz()")
    pg.wait_for_function("() => client.game.cur.myState === 'answering'", timeout=5000)
    pg.evaluate("""() => { const c = client.game.cur; const r = [...c.q.reading]; pickChoice(c.choices.indexOf(r[0])); }""")
    time.sleep(0.2)
    pg.screenshot(path=str(OUT / "04_answer.png"))
    pg.evaluate("""() => { const c = client.game.cur; const r = [...c.q.reading]; const go = () => { if (c.myState !== 'answering') return; const i = c.choices.indexOf(r[c.typed.length]); if (i >= 0) pickChoice(i); setTimeout(go, 60); }; go(); }""")
    pg.wait_for_function("() => document.querySelector('#answer-area') && document.querySelector('#answer-area').innerText.includes('正解：')", timeout=10000)
    time.sleep(0.3)
    pg.screenshot(path=str(OUT / "05_result.png"))
    b.close()
print("ok", sorted(x.name for x in OUT.iterdir()))
