// 「ターゲット1900」CSV の meaning_text を、意味本文と関連語（≒同意語 / ⇔反意語）に
// 分解する純粋パーサ。tsx の生成スクリプトから使えるよう `server-only` や `@/` 実行時 import を持たない。
//
// 文法（実データ検証済み）:
//   - トップレベルの全角カッコ `（…）` で中身が `≒`/`⇔` で始まるものだけ関連語グループ。それ以外の
//     カッコ（`（with）` `（to do）` `（of ⇒ about）` `（運命の）` 等）は意味本文にそのまま残す。
//   - `;` はカッコ内にも現れる（`（～に;...するのに）`）ため、分割はカッコ深さ 0 でのみ行う。
//   - グループ内エントリはカンマ区切り。ただしカンマは訳内にも出る（`⇔ nun 修道女, 尼` ＝ 1 件）。
//     継続規則: 深さ 0 でカンマ分割し、Latin 始まりは新エントリ、非 Latin 始まりは直前の訳へ連結。
//   - 各エントリは `term ⇒ NNN`（掲載番号リンク・訳なし）か `term [訳]`（リンクなし）のどちらか。
//     term は Latin 列（`make sure` 等の連語含む）。先頭の地域ラベル `【米】`/`【英】` は term に含める。
//     Latin 列より後ろの日本語は訳。訳にはネストした全角カッコが入り得る（`（を）輸出する`）。

export type ParsedRelatedKind = "SYNONYM" | "ANTONYM";

export type ParsedRelatedWord = {
  kind: ParsedRelatedKind;
  term: string;
  meaning: string | null; // 日本語/地域ラベルの訳。リンク形式・訳なしのとき null
  linkNumber: number | null; // ⇒ N の N（掲載番号）。無ければ null
};

export type ParseResult = {
  meaningTexts: string[]; // カッコ深さ0で ; 分割し、関連語グループを除去・trim・空除外したもの
  relatedWords: ParsedRelatedWord[]; // 出現順
};

const OPEN = "（";
const CLOSE = "）";
const MEANING_SEPARATOR = ";";
const ENTRY_SEPARATOR = ",";
const SYNONYM_MARK = "≒";
const ANTONYM_MARK = "⇔";
const LINK_MARK = "⇒";

/** 全角カッコの深さを数え、深さ 0 にある区切り文字でのみ分割する。 */
function splitTopLevel(input: string, separator: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of input) {
    if (ch === OPEN) depth += 1;
    else if (ch === CLOSE) depth = Math.max(0, depth - 1);
    if (ch === separator && depth === 0) {
      out.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  out.push(buf);
  return out;
}

/**
 * meaning_text を意味本文ごとに分割する（カッコ内の `;` は区切りにしない）。
 * 既存 import-words の素朴な `split(";")` を置き換えるために共有する。
 */
export function splitMeaningTexts(raw: string): string[] {
  return splitTopLevel(raw, MEANING_SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

type MarkerGroup = { kind: ParsedRelatedKind; inner: string };

/**
 * 1 セグメント中のトップレベル全角カッコを深さ対応で走査し、`≒`/`⇔` で始まるものだけを抜き出す。
 * 抜いた残り（非マーカーのカッコは温存）を stripped として返す。
 */
function extractMarkerGroups(segment: string): { stripped: string; groups: MarkerGroup[] } {
  const groups: MarkerGroup[] = [];
  let stripped = "";
  let depth = 0;
  let buf = ""; // 現在のトップレベルカッコの中身（ネストしたカッコ文字も含む）
  for (const ch of segment) {
    if (ch === OPEN) {
      if (depth === 0) buf = "";
      else buf += ch;
      depth += 1;
    } else if (ch === CLOSE) {
      depth -= 1;
      if (depth <= 0) {
        depth = 0;
        const trimmed = buf.trimStart();
        if (trimmed.startsWith(SYNONYM_MARK) || trimmed.startsWith(ANTONYM_MARK)) {
          const kind: ParsedRelatedKind = trimmed.startsWith(SYNONYM_MARK) ? "SYNONYM" : "ANTONYM";
          groups.push({ kind, inner: buf });
        } else {
          stripped += OPEN + buf + CLOSE; // 非マーカーカッコはそのまま残す
        }
      } else {
        buf += ch;
      }
    } else if (depth === 0) {
      stripped += ch;
    } else {
      buf += ch;
    }
  }
  if (depth > 0) stripped += OPEN + buf; // 不整合カッコの保険
  return { stripped, groups };
}

/** Latin（英字）で始まるか。新エントリ判定に使う。 */
function startsWithLatin(s: string): boolean {
  return /^[A-Za-z]/.test(s);
}

/** グループ内の 1 エントリ文字列を関連語に変換する。 */
function parseEntry(entry: string, kind: ParsedRelatedKind): ParsedRelatedWord {
  const linkIdx = entry.indexOf(LINK_MARK);
  if (linkIdx >= 0) {
    const term = entry.slice(0, linkIdx).trim();
    const numMatch = entry.slice(linkIdx + 1).match(/\d+/);
    return {
      kind,
      term,
      meaning: null,
      linkNumber: numMatch ? Number.parseInt(numMatch[0], 10) : null,
    };
  }
  // リンク無し: 「先頭ラベル＋Latin 列」を term、その後ろの日本語を訳にする。
  const latin = entry.match(/[A-Za-z][A-Za-z'’.\- ]*[A-Za-z]|[A-Za-z]/);
  if (!latin || latin.index === undefined) {
    return { kind, term: entry.trim(), meaning: null, linkNumber: null };
  }
  const latinEnd = latin.index + latin[0].length;
  const term = entry.slice(0, latinEnd).trim();
  const meaning = entry.slice(latinEnd).trim();
  return { kind, term, meaning: meaning.length > 0 ? meaning : null, linkNumber: null };
}

/** マーカーを除いたグループ中身を、継続規則を適用してエントリ配列に分解する。 */
function parseGroupEntries(group: MarkerGroup): ParsedRelatedWord[] {
  const withoutMark = group.inner.trimStart().slice(SYNONYM_MARK.length); // ≒/⇔ はともに 1 文字
  const entries: string[] = [];
  for (const piece of splitTopLevel(withoutMark, ENTRY_SEPARATOR)) {
    const t = piece.trim();
    if (t === "") continue;
    if (entries.length === 0 || startsWithLatin(t)) {
      entries.push(t);
    } else {
      entries[entries.length - 1] += `${ENTRY_SEPARATOR} ${t}`;
    }
  }
  return entries.map((e) => parseEntry(e, group.kind));
}

/** meaning_text を意味本文（複数）と関連語（複数）に分解する。 */
export function parseMeaningText(raw: string): ParseResult {
  const meaningTexts: string[] = [];
  const relatedWords: ParsedRelatedWord[] = [];
  for (const segment of splitTopLevel(raw, MEANING_SEPARATOR)) {
    const { stripped, groups } = extractMarkerGroups(segment);
    const meaning = stripped.trim();
    if (meaning.length > 0) meaningTexts.push(meaning);
    for (const group of groups) relatedWords.push(...parseGroupEntries(group));
  }
  return { meaningTexts, relatedWords };
}
