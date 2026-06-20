#!/usr/bin/env python3
"""
Generate the misaki[zh] phoneme PARITY CORPUS — the shared oracle for the
0.15 Chinese-on-kokoro g2p engine (Fork B, Python shell-out).

This is run ONCE (and re-run whenever the pinned misaki/jieba versions move) to
emit `packages/narrate/test/fixtures/misaki-zh-parity.json`: a list of
`{ text, phonemes }` produced by the REAL misaki[zh] reference. The TS parity
unit test asserts `zhG2p(text)` reproduces these phonemes byte-for-byte, so a
future pure-TS Fork A can be checked against the same oracle offline.

PINS (must match `packages/narrate/src/zh-g2p.ts` MISAKI_PIN / JIEBA_PIN):
    misaki == 0.9.4
    jieba  == 0.42.1

Reproduce (no system pip needed — uses uv):
    uv venv /tmp/misaki-venv --python 3.12
    uv pip install --python /tmp/misaki-venv 'misaki[zh]==0.9.4' 'jieba==0.42.1'
    /tmp/misaki-venv/bin/python3 scripts/gen-misaki-parity.py

The corpus exercises: the spike line (你好 → ni↓xau↓), tone-sandhi cases
(你好 3+3, 一 / 不 tone changes), multi-word lines, and the Mandarin-distinctive
custom-IPA symbols (ɕ ʂ ʈ ŋ ɤ ɥ) + arrow tones (↓ → ↗ ↘).
"""
import json
import os
import sys

# The corpus texts. Keep these SHORT and stable; each is a real Mandarin line.
TEXTS = [
    "你好",          # nǐ hǎo — the spike line; 3+3 tone sandhi
    "你好世界",      # nǐ hǎo shìjiè — hello world
    "中国",          # zhōngguó
    "谢谢",          # xièxie
    "我爱你",        # wǒ ài nǐ
    "一个",          # yí gè — 一 tone change before 4th tone
    "一定",          # yídìng — 一 tone change
    "不是",          # bú shì — 不 tone change before 4th tone
    "不对",          # bú duì — 不 tone change
    "很好",          # hěn hǎo
    "老师",          # lǎoshī
    "北京",          # běijīng
    "欢迎",          # huānyíng
    "再见",          # zàijiàn
    "学生",          # xuéshēng
    "动画",          # dònghuà — "animation"
    "十分",          # shífēn
]


def main() -> int:
    try:
        from misaki import zh
    except ImportError as e:  # pragma: no cover
        print(
            f"misaki[zh] not importable ({e}). Install with:\n"
            "  uv pip install --python <venv> 'misaki[zh]==0.9.4' 'jieba==0.42.1'",
            file=sys.stderr,
        )
        return 2

    g = zh.ZHG2P()
    entries = []
    for text in TEXTS:
        phonemes, _ = g(text)
        entries.append({"text": text, "phonemes": phonemes})

    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(
        here, "..", "packages", "narrate", "test", "fixtures", "misaki-zh-parity.json"
    )
    out = os.path.normpath(out)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"wrote {len(entries)} entries -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
