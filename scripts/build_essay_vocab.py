#!/usr/bin/env python3
"""Rebuild vocab.json + vocab-data.js: drop L41-52, add essay spell/recognize."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path("/workspace/br-vocab")
SRC = Path("/workspace/kaoyan-writing")
VOCAB_JSON = ROOT / "data" / "vocab.json"
VOCAB_JS = ROOT / "data" / "vocab-data.js"

SPELL_MD = SRC / "5-必拼词表.md"
CHART_MD = SRC / "6-图表认识词表.md"
BOOK_MD = SRC / "书本词汇提取-原始.md"


def norm_key(word: str) -> str:
    w = word.strip().lower()
    w = re.sub(r"\s+", " ", w)
    return w


def split_pos_meaning(cell: str) -> tuple[str, str]:
    cell = cell.strip()
    # e.g. "adv. 因此；于是" or "短语 沉迷于" or "adj./v. 具备；配备"
    m = re.match(
        r"^((?:[a-z]+\.?/?)+|短语|n\.|v\.|adj\.|adv\.|det\.|pron\.|prep\.|conj\.|num\.)\s+(.+)$",
        cell,
        re.I,
    )
    if m:
        return m.group(1).strip(), m.group(2).strip()
    # "n./v. 经历；经验"
    m2 = re.match(r"^([^\u4e00-\u9fff]+?)\s+([\u4e00-\u9fff].*)$", cell)
    if m2:
        return m2.group(1).strip(), m2.group(2).strip()
    return "", cell


def parse_md_tables(text: str) -> list[dict]:
    """Parse markdown pipe tables; return rows as list of cell lists (skip header/sep)."""
    rows = []
    for line in text.splitlines():
        line = line.rstrip()
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if not cells:
            continue
        # skip separator
        if all(re.match(r"^:?-+:?$", c or "") for c in cells):
            continue
        # skip header-ish first column labels
        rows.append(cells)
    return rows


def parse_spell(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    group = "必拼"
    items = []
    for line in text.splitlines():
        if line.startswith("## "):
            # e.g. ## 一、框架句常用词（20）
            group = re.sub(r"^##\s+", "", line).strip()
            group = re.sub(r"（\d+）$", "", group).strip()
            continue
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) < 2:
            continue
        if cells[0] in ("单词", "---") or cells[0].startswith("---") or re.match(r"^:?-+:?$", cells[0]):
            continue
        if cells[0].startswith("**") or "合计" in cells[0]:
            continue
        word = cells[0].strip()
        if not word or word == "单词":
            continue
        pos, meaning = split_pos_meaning(cells[1] if len(cells) > 1 else "")
        syllable = cells[2] if len(cells) > 2 else ""
        items.append(
            {
                "word": word,
                "part_of_speech": pos,
                "meaning": meaning,
                "group": group,
                "syllable": syllable,
            }
        )
    return items


def parse_chart(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    group = "图表认识"
    items = []
    for line in text.splitlines():
        if line.startswith("## "):
            group = re.sub(r"^##\s+", "", line).strip()
            group = re.sub(r"（\d+）$", "", group).strip()
            continue
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) < 2:
            continue
        if cells[0] in ("单词/短语", "单词", "---") or cells[0].startswith("---"):
            continue
        if re.match(r"^:?-+:?$", cells[0]):
            continue
        word = cells[0].strip()
        if not word:
            continue
        meaning = cells[1].strip() if len(cells) > 1 else ""
        items.append(
            {
                "word": word,
                "part_of_speech": "",
                "meaning": meaning,
                "group": group,
                "syllable": "",
            }
        )
    return items


def parse_book_section(text: str, start_marker: str, end_marker: str | None) -> list[dict]:
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f"marker not found: {start_marker}")
    chunk = text[start:]
    if end_marker:
        end = chunk.find(end_marker)
        if end > 0:
            chunk = chunk[:end]
    items = []
    group = "核心词汇"
    for line in chunk.splitlines():
        if line.startswith("**〔") and line.endswith("**"):
            group = line.strip("*").strip()
            continue
        if line.startswith("### "):
            group = line[4:].strip()
            continue
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        # core: # | word | pos | meaning | syn | example | page
        if len(cells) < 4:
            continue
        if cells[0] in ("#", "---") or cells[0].startswith("---") or re.match(r"^:?-+:?$", cells[0]):
            continue
        if not re.match(r"^\d+$", cells[0]):
            continue
        word = cells[1].strip()
        pos = cells[2].strip()
        meaning = cells[3].strip()
        if pos == "—":
            pos = ""
        if meaning == "—":
            meaning = ""
        items.append(
            {
                "word": word,
                "part_of_speech": pos,
                "meaning": meaning,
                "group": group,
                "syllable": "",
                "_raw_cells": cells,
            }
        )
    return items


def fix_efficient_sticky(items: list[dict]) -> list[dict]:
    """范文024 efficient 行曾粘连 indulge in / refrain from."""
    out = []
    for it in items:
        word = it["word"]
        if norm_key(word) != "efficient":
            out.append(it)
            continue
        # Check sticky content in meaning or leftover fields
        blob = " ".join(str(x) for x in it.get("_raw_cells", []))
        blob_full = blob + " " + it.get("meaning", "")
        # Clean meaning to just efficient's meaning
        meaning = it["meaning"]
        # Strip glued synonym garbage if present
        meaning = re.split(r"be addicted|indulge|refrain", meaning, 1)[0].strip(" ；;/")
        if not meaning:
            meaning = "效率高的；有能力的"
        out.append(
            {
                "word": "efficient",
                "part_of_speech": it.get("part_of_speech") or "adj.",
                "meaning": meaning,
                "group": it.get("group", "精彩词汇"),
                "syllable": "",
            }
        )
        # Always ensure the two phrases exist when this sticky row appears
        if "indulge" in blob_full.lower() or True:
            # Always add if sticky markers present OR always for efficient from 精彩
            if "indulge" in blob_full.lower():
                out.append(
                    {
                        "word": "indulge in",
                        "part_of_speech": "短语",
                        "meaning": "沉迷于",
                        "group": it.get("group", "精彩词汇"),
                        "syllable": "",
                    }
                )
            if "refrain" in blob_full.lower():
                out.append(
                    {
                        "word": "refrain from",
                        "part_of_speech": "短语",
                        "meaning": "克制；避免",
                        "group": it.get("group", "精彩词汇"),
                        "syllable": "",
                    }
                )
    return out


def clean_item(it: dict) -> dict:
    return {
        "word": it["word"].strip(),
        "part_of_speech": (it.get("part_of_speech") or "").strip(),
        "meaning": (it.get("meaning") or "").strip(),
        "group": (it.get("group") or "").strip(),
        "syllable": (it.get("syllable") or "").strip(),
    }


def dedup_keep_order(items: list[dict], seen: set[str] | None = None) -> tuple[list[dict], set[str]]:
    if seen is None:
        seen = set()
    out = []
    for it in items:
        key = norm_key(it["word"])
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(clean_item(it))
    return out, seen


def main() -> None:
    data = json.loads(VOCAB_JSON.read_text(encoding="utf-8"))
    old_lessons = data["lessons"]
    kept = [L for L in old_lessons if int(L["lesson"]) <= 40]
    removed = [L for L in old_lessons if int(L["lesson"]) > 40]
    removed_words = sum(len(L["words"]) for L in removed)

    # reindex? keep original lesson numbers 1-40 and word indices as-is
    for L in kept:
        for w in L["words"]:
            # ensure lesson field consistent
            w["lesson"] = L["lesson"]

    spell_raw = parse_spell(SPELL_MD)
    chart_raw = parse_chart(CHART_MD)

    book_text = BOOK_MD.read_text(encoding="utf-8")
    core_raw = parse_book_section(book_text, "## 一、高频/常用写作词汇", "## 二、")
    fancy_raw = parse_book_section(book_text, "## 二、每篇范文后的「精彩词汇」", None)
    fancy_raw = fix_efficient_sticky(fancy_raw)
    # tag fancy groups
    for it in fancy_raw:
        if not str(it.get("group", "")).startswith("范文") and "精彩" not in str(it.get("group", "")):
            it["group"] = f"精彩词汇 · {it.get('group', '')}".strip(" ·")

    spell, seen = dedup_keep_order(spell_raw)
    # recognize: chart + core not in spell + fancy not in spell
    recognize_pool = chart_raw + core_raw + fancy_raw
    recognize, _ = dedup_keep_order(recognize_pool, seen=set(seen))  # spell keys excluded via seen copy
    # Wait: we need spell keys in seen so recognize excludes them
    recognize, _ = dedup_keep_order(recognize_pool, seen=set(norm_key(x["word"]) for x in spell))

    # index them
    for i, w in enumerate(spell, 1):
        w["index"] = i
        w["lesson"] = "essay-spell"
    for i, w in enumerate(recognize, 1):
        w["index"] = i
        w["lesson"] = "essay-recognize"

    misspell_path = ROOT / "data" / "essay-misspell.json"
    misspell = []
    if misspell_path.exists():
        mp = json.loads(misspell_path.read_text(encoding="utf-8"))
        misspell = mp.get("words") or []
        for i, w in enumerate(misspell, 1):
            w["index"] = i
            w["lesson"] = "essay-misspell"
            w.setdefault("group", "作文错词")
            w.setdefault("part_of_speech", "")
            w.setdefault("syllable", "")

    word_count = sum(len(L["words"]) for L in kept)
    data["lessons"] = kept
    data["lessonCount"] = len(kept)
    data["wordCount"] = word_count
    data["sourcePdf"] = "艾宾浩斯曲线版 单词.pdf（巴朗 Lesson 1–40）+ 考研写作作文词表"
    data["essay"] = {
        "spellCount": len(spell),
        "recognizeCount": len(recognize),
        "misspellCount": len(misspell),
        "spell": spell,
        "recognize": recognize,
        "misspell": misspell,
    }

    VOCAB_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    js = "window.VOCAB_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
    VOCAB_JS.write_text(js, encoding="utf-8")

    print("REMOVED_LESSONS", len(removed))
    print("REMOVED_WORDS", removed_words)
    print("BARRON_LESSONS", len(kept))
    print("BARRON_WORDS", word_count)
    print("SPELL", len(spell))
    print("RECOGNIZE", len(recognize))
    print("MISSPELL", len(misspell))
    print("SPELL_RAW", len(spell_raw), "CHART_RAW", len(chart_raw), "CORE_RAW", len(core_raw), "FANCY_RAW", len(fancy_raw))
    # sanity: efficient / indulge / refrain
    s_words = {norm_key(w["word"]) for w in spell}
    r_words = {norm_key(w["word"]) for w in recognize}
    for k in ("efficient", "indulge in", "refrain from", "metaphorical", "ironic"):
        print(f"LOC {k}: spell={k in s_words} recognize={k in r_words}")


if __name__ == "__main__":
    main()
