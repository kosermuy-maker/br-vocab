#!/usr/bin/env python3
"""Build the 考研词汇 module: data/kaoyan.json + data/kaoyan-data.js (window.KAOYAN_DATA).

Sources (UTF-8 TXT exported from the two 小舟 PDFs):
  data/kaoyan-src/core.txt     27考研核心词，按 "=== Unit N ===" 分组，行格式：单词\t词性\t释义
  data/kaoyan-src/freq200.txt  真题高频200词，行格式：序号\t单词\t[频]N\t词性\t完整释义

Does NOT touch vocab.json / vocab-data.js, so existing 巴朗/作文 progress keys stay identical.
Word key in the app = f"{lesson}-{index}-{word}", so `index` must stay stable between rebuilds:
it is the 1-based position inside its unit after de-duplication.

Usage:  python scripts/build_kaoyan_vocab.py [core.txt] [freq200.txt]
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "kaoyan-src"
OUT_JSON = ROOT / "data" / "kaoyan.json"
OUT_JS = ROOT / "data" / "kaoyan-data.js"

UNIT_RE = re.compile(r"^===\s*Unit\s+(\d+)\s*===\s*$")
FREQ_RE = re.compile(r"^\[频\](\d+)$")
# 抽取时把单词误标成「词组/短语」、释义前缀粘着词性的情况，例如 "adj考古学的"
GLUED_POS_RE = re.compile(r"^(n|v|vt|vi|adj|adv|prep|conj)\.?(?=[\u4e00-\u9fff])")


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\ufeff", "")).strip()


def fix_pos(word: str, pos: str, meaning: str) -> tuple[str, str]:
    """单个单词却标「词组/短语」且释义以词性开头 → 还原词性。"""
    if pos == "词组/短语" and " " not in word and "/" not in word:
        m = GLUED_POS_RE.match(meaning)
        if m:
            tag = m.group(1) + "."
            return tag, meaning[m.end():].strip()
    return pos, meaning


def parse_core(path: Path) -> tuple[list[dict], dict]:
    units: dict[int, list[dict]] = {}
    unit = None
    raw_rows = dropped = fixed = 0
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        m = UNIT_RE.match(line.strip())
        if m:
            unit = int(m.group(1))
            units.setdefault(unit, [])
            continue
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = [clean(p) for p in line.split("\t")]
        if unit is None or len(parts) < 3 or not parts[0]:
            raise SystemExit(f"{path.name}:{lineno}: 无法解析：{line!r}")
        raw_rows += 1
        word, pos, meaning = parts[0], parts[1], parts[2]
        new_pos, new_meaning = fix_pos(word, pos, meaning)
        if (new_pos, new_meaning) != (pos, meaning):
            fixed += 1
        pos, meaning = new_pos, new_meaning
        bucket = units[unit]
        # PDF 抽取在部分页面把同一行重复输出 2–4 次（只会紧挨着出现）；保留第一条
        if bucket and bucket[-1]["word"].lower() == word.lower() and bucket[-1]["meaning"] == meaning:
            dropped += 1
            continue
        bucket.append({"word": word, "part_of_speech": pos, "meaning": meaning})

    lessons = []
    for no in sorted(units):
        lesson_id = f"core-{no}"
        words = [
            {**w, "index": i, "lesson": lesson_id}
            for i, w in enumerate(units[no], 1)
        ]
        lessons.append(
            {
                "id": lesson_id,
                "book": "core",
                "unit": no,
                "title": f"核心词 Unit {no}",
                "shortTitle": f"Unit {no}",
                "count": len(words),
                "words": words,
            }
        )
    stats = {"rawRows": raw_rows, "droppedRepeats": dropped, "posFixed": fixed}
    return lessons, stats


def parse_freq(path: Path) -> list[dict]:
    words = []
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = [clean(p) for p in line.split("\t")]
        if len(parts) < 5:
            raise SystemExit(f"{path.name}:{lineno}: 列数不足：{line!r}")
        no, word, freq_raw, pos, meaning = parts[:5]
        m = FREQ_RE.match(freq_raw)
        if not no.isdigit() or not m:
            raise SystemExit(f"{path.name}:{lineno}: 序号/词频格式不对：{line!r}")
        words.append(
            {
                "index": int(no),
                "word": word,
                "part_of_speech": pos,
                "meaning": meaning,
                "freq": int(m.group(1)),
                "lesson": "freq",
            }
        )
    if len({w["index"] for w in words}) != len(words):
        raise SystemExit(f"{path.name}: 序号重复")
    return words


def main() -> None:
    core_path = Path(sys.argv[1]) if len(sys.argv) > 1 else SRC / "core.txt"
    freq_path = Path(sys.argv[2]) if len(sys.argv) > 2 else SRC / "freq200.txt"

    core_lessons, stats = parse_core(core_path)
    freq_words = parse_freq(freq_path)
    freq_lesson = {
        "id": "freq",
        "book": "freq",
        "unit": None,
        "title": "真题高频200词",
        "shortTitle": "高频200词",
        "count": len(freq_words),
        "words": freq_words,
    }

    data = {
        "source": {
            "core": "27考研核心词【公众号：小舟学长】.pdf",
            "freq": "27考研英语阅读真题高频200词（含词频）【公众号：考研小舟】.pdf",
        },
        "books": [
            {"id": "core", "title": "核心词", "lessonIds": [l["id"] for l in core_lessons]},
            {"id": "freq", "title": "高频200词", "lessonIds": ["freq"]},
        ],
        "coreCount": sum(l["count"] for l in core_lessons),
        "freqCount": len(freq_words),
        "lessons": [*core_lessons, freq_lesson],
    }

    payload = json.dumps(data, ensure_ascii=False, indent=1)
    OUT_JSON.write_text(payload + "\n", encoding="utf-8", newline="\n")
    OUT_JS.write_text("window.KAOYAN_DATA = " + payload + ";\n", encoding="utf-8", newline="\n")

    print(
        f"core: {stats['rawRows']} 行 → {data['coreCount']} 词（去掉连续重复 {stats['droppedRepeats']}，"
        f"修正词性 {stats['posFixed']}），{len(core_lessons)} 个 Unit"
    )
    print(f"freq: {data['freqCount']} 词")
    print(f"wrote {OUT_JSON.relative_to(ROOT)} / {OUT_JS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
