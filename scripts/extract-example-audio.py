#!/usr/bin/env python3
# 【使い捨て】「ターゲット1900(6訂版)」例文音源 (tmp/1900_4_all/) から英語例文だけを切り出す。
#
# 元 mp3 は「見出し語(EN) → 日本語訳(1〜2区間) → 英語例文(末尾)」の繰り返し＋区切りアナウンス。
# 無音検出でエントリに分割し、文字起こしで英語例文区間を特定して <掲載番号>_<見出し語>.mp3 に切り出す。
# 手順・ハマりどころは docs/ops/extract-example-audio.md を参照。
#
# Usage:
#   <venv>/bin/python scripts/extract-example-audio.py [mp3...]
#     mp3 省略時は tmp/1900_4_all/*.mp3 全件。処理済み（report に記録あり）のファイルはスキップ。
#   --out tmp/1900_4_split/EN   出力ディレクトリ
#   --words tmp/target1900.words.csv
#   --report tmp/1900_4_split/report.jsonl   処理記録（resume 判定と人手レビューの根拠）
#   --redo                      report に記録があっても再処理する（対象ファイルの旧記録は report から除去）
#   --no-verify                 切り出し後の small.en 検証を省く（非推奨・高速確認用）
#   --noise -35 --min-silence 0.35 --entry-gap 1.2
#                               無音検出のパラメータ。失敗ファイルの個別再実行時に調整する
import argparse
import csv
import json
import re
import subprocess
import sys
from difflib import SequenceMatcher
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel

REPO = Path(__file__).resolve().parent.parent
SR = 16000
PAD_START = 0.20
PAD_END = 0.30


def ffprobe_duration(src: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(src)],
        capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def detect_speech(src: Path, dur: float, noise: float, min_silence: float) -> list[tuple[float, float]]:
    """無音区間の補集合として発話区間 [(start, end)] を返す。"""
    p = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(src),
         "-af", f"silencedetect=noise={noise}dB:d={min_silence}", "-f", "null", "-"],
        capture_output=True, text=True)
    starts = [float(m) for m in re.findall(r"silence_start: ([\d.]+)", p.stderr)]
    ends = [float(m) for m in re.findall(r"silence_end: ([\d.]+)", p.stderr)]
    speech = []
    prev = 0.0
    for s, e in zip(starts, ends):
        if s - prev > 0.05:
            speech.append((prev, s))
        prev = e
    if dur - prev > 0.05:
        speech.append((prev, dur))
    return speech


def group_entries(speech: list[tuple[float, float]], entry_gap: float) -> list[list[tuple[float, float]]]:
    groups, cur = [], []
    for i, (s, e) in enumerate(speech):
        if i > 0 and s - speech[i - 1][1] >= entry_gap:
            groups.append(cur)
            cur = []
        cur.append((s, e))
    if cur:
        groups.append(cur)
    return groups


def decode_audio(src: Path) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(src), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
        capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def transcribe_clip(model: WhisperModel, audio: np.ndarray, s: float, e: float, dur: float):
    clip = audio[int(max(0.0, s - 0.15) * SR):int(min(dur, e + 0.15) * SR)]
    segs, info = model.transcribe(clip, beam_size=5)
    text = "".join(sg.text for sg in segs).strip()
    return text, info.language


def norm_words(text: str) -> list[str]:
    return re.findall(r"[a-z']+", text.lower())


def headword_in_text(headword: str, text: str) -> bool:
    """見出し語が文に含まれるか。完全一致が無ければ音の揺れ・活用を難易度低めの fuzzy で拾う。"""
    hw = headword.lower()
    if hw in text.lower():
        return True
    return any(SequenceMatcher(None, hw, w).ratio() >= 0.75 for w in norm_words(text))


def sanitize(headword: str) -> str:
    return re.sub(r"[^A-Za-z0-9-]+", "_", headword).strip("_") or "x"


def load_headwords(words_csv: Path) -> list[str]:
    with open(words_csv, newline="") as f:
        rows = list(csv.reader(f))
    assert rows[0][0] == "headword", f"想定外のヘッダ: {rows[0]}"
    return [r[0] for r in rows[1:]]  # index 0 = 掲載番号 1


def is_word_group(segs: list[dict]) -> bool:
    """単語エントリの構造（非英語区間の後ろに英語区間で終わる）か。区切りアナウンスを弾く。"""
    if len(segs) < 2 or segs[-1]["lang"] != "en":
        return False
    return any(r["lang"] != "en" for r in segs)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("sources", nargs="*", type=Path)
    ap.add_argument("--out", type=Path, default=REPO / "tmp/1900_4_split/EN")
    ap.add_argument("--words", type=Path, default=REPO / "tmp/target1900.words.csv")
    ap.add_argument("--report", type=Path, default=REPO / "tmp/1900_4_split/report.jsonl")
    ap.add_argument("--redo", action="store_true")
    ap.add_argument("--no-verify", action="store_true")
    ap.add_argument("--noise", type=float, default=-35.0)
    ap.add_argument("--min-silence", type=float, default=0.35)
    # エントリ境界の無音閾値（実測: エントリ内 ≤0.95s / エントリ間 ≥1.4s）
    ap.add_argument("--entry-gap", type=float, default=1.2)
    args = ap.parse_args()

    sources = args.sources or sorted((REPO / "tmp/1900_4_all").glob("*.mp3"))
    headwords = load_headwords(args.words)
    args.out.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)

    done_sources = set()
    if args.report.exists():
        if args.redo:
            # 再処理対象の旧記録を除去してから追記する（report を 1 語 1 行に保つ）
            targets = {s.name for s in sources}
            with open(args.report) as f:
                kept = [line for line in f if line.strip()
                        and json.loads(line)["src"] not in targets]
            with open(args.report, "w") as f:
                f.writelines(kept)
        else:
            with open(args.report) as f:
                done_sources = {json.loads(line)["src"] for line in f if line.strip()}

    print("モデル読み込み中 (small / small.en) ...", file=sys.stderr)
    multi = WhisperModel("small", device="cpu", compute_type="int8")
    en_model = None if args.no_verify else WhisperModel("small.en", device="cpu", compute_type="int8")

    total_ok = total_check = 0
    failed_files: list[str] = []
    for src in sources:
        if src.name in done_sources:
            print(f"skip (report 記録済み): {src.name}", file=sys.stderr)
            continue
        m = re.search(r"_(\d{4})_(\d{4})\.mp3$", src.name)
        if not m:
            print(f"skip (範囲がファイル名から読めない): {src.name}", file=sys.stderr)
            continue
        lo, hi = int(m.group(1)), int(m.group(2))
        expected = hi - lo + 1

        dur = ffprobe_duration(src)
        audio = decode_audio(src)
        groups = group_entries(detect_speech(src, dur, args.noise, args.min_silence), args.entry_gap)

        # 全区間を文字起こし（言語判定が構造分類に必要）
        tr_groups: list[list[dict]] = []
        for g in groups:
            recs = []
            for s, e in g:
                text, lang = transcribe_clip(multi, audio, s, e, dur)
                recs.append({"start": s, "end": e, "lang": lang, "text": text})
            tr_groups.append(recs)

        word_groups = [g for g in tr_groups if is_word_group(g)]
        announcements = [g for g in tr_groups if not is_word_group(g)]
        for g in announcements:
            print(f"  アナウンス除外: {' / '.join(r['text'] for r in g)}", file=sys.stderr)
        if len(word_groups) != expected:
            print(f"NG {src.name}: 単語エントリ数 {len(word_groups)} が期待 {expected} と不一致。人手確認が必要（report 未記録）",
                  file=sys.stderr)
            failed_files.append(src.name)
            continue

        with open(args.report, "a") as rep:
            for num, segs in zip(range(lo, hi + 1), word_groups):
                hw = headwords[num - 1]
                last_ja = max(i for i, r in enumerate(segs) if r["lang"] != "en")
                ex = segs[last_ja + 1:]
                start = ex[0]["start"] - PAD_START
                end = min(dur, ex[-1]["end"] + PAD_END)
                out = args.out / f"{num:04d}_{sanitize(hw)}.mp3"
                subprocess.run(
                    ["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.3f}", "-to", f"{end:.3f}",
                     "-i", str(src), "-c:a", "libmp3lame", "-q:a", "2", str(out)],
                    check=True)
                ex_text = " ".join(r["text"] for r in ex)
                verify_text = ""
                if en_model is not None:
                    vsegs, _ = en_model.transcribe(str(out), beam_size=5)
                    verify_text = "".join(sg.text for sg in vsegs).strip()
                check_target = verify_text or ex_text
                hw_ok = headword_in_text(hw, check_target)
                hw_asr = segs[0]["text"]
                hw_asr_ok = headword_in_text(hw, hw_asr)
                verdict = "OK" if (hw_ok and hw_asr_ok) else "CHECK"
                if verdict == "OK":
                    total_ok += 1
                else:
                    total_check += 1
                rec = {"src": src.name, "num": num, "headword": hw, "file": out.name,
                       "dur": round(end - start, 2), "asr_headword": hw_asr,
                       "example_text": ex_text, "verify_text": verify_text, "verdict": verdict}
                rep.write(json.dumps(rec, ensure_ascii=False) + "\n")
                rep.flush()
                print(f"  {out.name}  {end - start:5.2f}s  [{verdict}] {check_target}", file=sys.stderr)
        print(f"done: {src.name} ({expected} 件)", file=sys.stderr)

    print(f"\nOK {total_ok} 件 / CHECK {total_check} 件（report の verdict=CHECK を人手レビュー）", file=sys.stderr)
    if failed_files:
        print(f"エントリ数不一致で未処理: {len(failed_files)} 件 → {', '.join(failed_files)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
