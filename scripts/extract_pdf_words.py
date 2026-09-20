from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path

try:
    import fitz  # PyMuPDF: preserves the PDF line structure better than pypdf here.
except ImportError as exc:  # pragma: no cover
    raise SystemExit("Please install PyMuPDF first: pip install pymupdf") from exc


LESSON_RE = re.compile(r"^Lesson\s*(\d+)\s*[：:]?$", re.IGNORECASE)
INDEX_RE = re.compile(r"^\d+$")
HEADER_LINES = {"序号", "单词", "词义", "词性"}
POS_TOKEN_RE = re.compile(
    r"^(?:n|v|adj|adv|prep|conj|pron|num|art|aux|int|vt|vi|modal|phr)\.?$",
    re.IGNORECASE,
)
POS_START_RE = re.compile(
    r"^(?P<pos>(?:n\s*\.?\s*/\s*v\.?|v\s*\.?\s*/\s*n\.?|n\s*\.?\s*&\s*v\.?|"
    r"&\s*v\.?|v\s*\.?\s*&\s*n\.?|adj\s*\.?\s*/\s*n\.?|(?:n|v|adj|adv|prep|conj|pron|num|art|aux|"
    r"int|vt|vi|modal|phr)\.?))\s*(?P<rest>.*)$",
    re.IGNORECASE,
)
CHINESE_RE = re.compile(r"[\u4e00-\u9fff]")
FULLWIDTH_MAP = str.maketrans(
    {
        "（": "(",
        "）": ")",
        "；": ";",
        "，": ",",
        "。": ".",
        "：": ":",
        "–": "-",
        "—": "-",
    }
)
OCR_FIXES = {
    "笨抽的": "笨拙的",
    "贫將的": "贫瘠的",
    "光乔秃的": "光秃秃的",
    "隔圆": "隔阂",
    "惊帽": "惊慌",
    "使惊鸭": "使惊讶",
    "使惊诺": "使惊诧",
    "闲昵": "闲暇",
    "速捕": "逮捕",
    "D.使": "v.使",
    "adi": "adj.",
    " V .": " v.",
    " V.": " v.",
    "V.": "v.",
    "n&": "n. &",
    "n.&v.": "n. & v.",
    "& v.": "& v.",
    "(:": "(",
    "：": ":",
    "…....": "……",
    "….…": "……",
}


@dataclass
class WordEntry:
    index: int
    word: str
    part_of_speech: str
    meaning: str
    lesson: int


@dataclass
class RawEntry:
    index: int
    word_line: str
    meaning_lines: list[str]
    lesson: int


def normalize_text(text: str) -> str:
    text = text.translate(FULLWIDTH_MAP)
    text = text.replace("\u3000", " ")
    text = text.replace("…… ", "……")
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def clean_meaning(text: str) -> str:
    text = normalize_text(text)
    for old, new in OCR_FIXES.items():
        text = text.replace(old, new)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s+([,.;:)])", r"\1", text)
    text = re.sub(r"([(])\s+", r"\1", text)
    text = text.replace(" .", ".").replace(" ,", ",")
    return text.strip(" ;,")


def clean_word(text: str) -> str:
    text = normalize_text(text)
    for old, new in OCR_FIXES.items():
        text = text.replace(old, new)
    text = re.sub(r"\s+", " ", text)
    text = text.replace(" V .", " v.").replace(" V.", " v.")
    return text.strip(" ;,")


def extract_raw_entries(pdf_path: Path) -> list[RawEntry]:
    doc = fitz.open(pdf_path)
    lines: list[str] = []
    for page in doc:
        for raw_line in page.get_text("text").splitlines():
            line = normalize_text(raw_line)
            if line:
                lines.append(line)

    entries: list[RawEntry] = []
    lesson_no: int | None = None
    i = 0
    while i < len(lines):
        line = lines[i]
        lesson_match = LESSON_RE.match(line)
        if lesson_match:
            lesson_no = int(lesson_match.group(1))
            i += 1
            continue

        if lesson_no is not None and INDEX_RE.match(line):
            index = int(line)
            if i + 1 >= len(lines):
                break
            word_line = lines[i + 1]
            i += 2
            meaning_lines: list[str] = []
            while i < len(lines):
                current = lines[i]
                if LESSON_RE.match(current) or INDEX_RE.match(current):
                    break
                if current not in HEADER_LINES:
                    meaning_lines.append(current)
                i += 1
            if word_line not in HEADER_LINES:
                entries.append(
                    RawEntry(
                        index=index,
                        word_line=word_line,
                        meaning_lines=meaning_lines,
                        lesson=lesson_no,
                    )
                )
            continue

        i += 1
    return entries


def split_pos_from_meaning(meaning: str) -> tuple[str, str]:
    meaning = clean_meaning(meaning)
    match = POS_START_RE.match(meaning)
    if not match:
        return "", meaning
    pos = normalize_pos(match.group("pos"))
    rest = match.group("rest").strip()
    return pos, clean_meaning(rest)


def normalize_pos(pos: str) -> str:
    pos = normalize_text(pos).lower()
    pos = pos.replace(" ", "")
    pos = pos.lstrip("&")
    pos = pos.replace("&", " & ").replace("/", "/")
    pos = re.sub(r"\.+", ".", pos)
    pos = re.sub(r"(?<!\.)\b(n|v|adj|adv|prep|conj|pron|num|art|aux|int|vt|vi|phr)\b(?!\.)", r"\1.", pos)
    pos = pos.replace("n.&v.", "n. & v.").replace("v.&n.", "v. & n.")
    pos = pos.replace("n. &v.", "n. & v.").replace("v. &n.", "v. & n.")
    pos = re.sub(r"\s+", " ", pos)
    return pos.strip()


def split_word_and_pos(word_line: str, meaning: str) -> tuple[str, str, str]:
    word_line = clean_word(word_line)
    meaning = clean_meaning(meaning)

    # Fix PDF line wraps such as "emphasise(美" + "emphasize) v....".
    if "(" in word_line and ")" not in word_line and meaning and not CHINESE_RE.search(meaning.split(maxsplit=1)[0]):
        first, _, rest = meaning.partition(" ")
        word_line = f"{word_line} {first}"
        meaning = rest.strip()

    # Fix forms like "humour" + "(美humor) n....".
    if meaning.startswith("(美"):
        close_at = meaning.find(")")
        if close_at != -1:
            word_line = f"{word_line}{meaning[: close_at + 1]}"
            meaning = meaning[close_at + 1 :].strip()

    # Sometimes the POS is mistakenly attached to the word line: "dramatic adj".
    parts = word_line.rsplit(" ", 1)
    if len(parts) == 2 and POS_TOKEN_RE.match(parts[1]):
        return parts[0].strip(" ;,"), normalize_pos(parts[1]), meaning

    pos, meaning_without_pos = split_pos_from_meaning(meaning)
    if pos:
        return word_line, pos, meaning_without_pos

    # Some entries have adjectives before the actual POS: "qualify" + "合格 v....".
    if not pos:
        embedded = re.search(r"(?P<prefix>.+?)(?P<pos>(?:n|v|adj|adv|vt|vi)\.?)\s*(?P<rest>[\(（].*)", meaning, re.IGNORECASE)
        if embedded:
            pos = normalize_pos(embedded.group("pos"))
            meaning = clean_meaning(f"{embedded.group('prefix')}; {embedded.group('rest')}")
            return word_line, pos, meaning

    # Some OCR strings are like "collapse n&" with the remaining "v." in meaning.
    if re.search(r"\b[nv]\s*&\s*$", word_line, re.IGNORECASE):
        word = re.sub(r"\b([nv])\s*&\s*$", "", word_line, flags=re.IGNORECASE).strip()
        m = POS_START_RE.match(meaning)
        if m:
            second = normalize_pos(m.group("pos"))
            first = "n." if "n" in word_line.lower() else "v."
            return word, f"{first} & {second}", clean_meaning(m.group("rest"))

    return word_line, "", meaning


def parse_raw_entry(raw: RawEntry) -> WordEntry | None:
    meaning = " ".join(raw.meaning_lines)
    word, pos, meaning = split_word_and_pos(raw.word_line, meaning)
    word = clean_word(word)
    meaning = clean_meaning(meaning)

    if not word:
        return None
    return WordEntry(
        index=raw.index,
        word=word,
        part_of_speech=pos,
        meaning=meaning,
        lesson=raw.lesson,
    )


def merge_continuation_entries(entries: list[WordEntry]) -> list[WordEntry]:
    """Merge PDF rows where a second POS row was numbered as a separate entry.

    In this PDF, some entries are laid out as:
      1 understanding / n. ...
      2 adj. ...
    where row 2 is a continuation, not a new word.
    """
    merged: list[WordEntry] = []
    continuation_re = re.compile(r"^(?P<pos>adj|n|v|adv|vt|vi)\.\s+(?P<meaning>.+)$", re.IGNORECASE)
    for entry in entries:
        match = continuation_re.match(entry.word)
        if match and merged and not entry.part_of_speech:
            previous = merged[-1]
            pos = normalize_pos(match.group("pos"))
            extra_meaning = clean_meaning(match.group("meaning") + (entry.meaning or ""))
            previous.meaning = clean_meaning(f"{previous.meaning}; {pos} {extra_meaning}")
            continue
        merged.append(entry)
    return merged


def renumber_lesson(entries: list[WordEntry]) -> list[WordEntry]:
    for new_index, entry in enumerate(entries, start=1):
        entry.index = new_index
    return entries


def build_vocab(pdf_path: Path) -> dict:
    parsed_entries = [entry for raw in extract_raw_entries(pdf_path) if (entry := parse_raw_entry(raw))]
    lessons_out = []
    total_words = 0
    for lesson_no in sorted({entry.lesson for entry in parsed_entries}):
        lesson_entries = [entry for entry in parsed_entries if entry.lesson == lesson_no]
        lesson_entries = renumber_lesson(merge_continuation_entries(lesson_entries))
        entries = [asdict(entry) for entry in lesson_entries]
        lessons_out.append(
            {
                "id": f"lesson-{lesson_no}",
                "lesson": lesson_no,
                "title": f"Lesson {lesson_no}",
                "count": len(entries),
                "words": entries,
            }
        )
        total_words += len(entries)

    return {
        "sourcePdf": pdf_path.name,
        "lessonCount": len(lessons_out),
        "wordCount": total_words,
        "lessons": lessons_out,
    }


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    pdf_files = sorted(root.glob("*.pdf"))
    if not pdf_files:
        raise FileNotFoundError("No PDF found in workspace root.")

    pdf_path = pdf_files[0]
    output = build_vocab(pdf_path)

    data_dir = root / "data"
    data_dir.mkdir(exist_ok=True)
    (data_dir / "vocab.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (data_dir / "vocab-data.js").write_text(
        "window.VOCAB_DATA = "
        + json.dumps(output, ensure_ascii=True, indent=2)
        + ";\n",
        encoding="utf-8",
    )

    print(
        f"Parsed {output['lessonCount']} lessons and {output['wordCount']} words "
        f"from {pdf_path.name}"
    )


if __name__ == "__main__":
    main()
