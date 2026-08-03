// 単語コンテンツ（意味・例文・メモ等の文章系フィールド）の装飾記法パーサ。
// ユーザーが入力欄に打った Markdown 風の囲み記号を、描画用のセグメント列へ分解する。
//
// 記法（開始と終了で同じ記号を使う対称記法）:
//   **太字**  *斜体*  ***太字の斜体***  ==赤文字==  __青下線__
//
// 設計上の前提（docs/adr/0077-rich-text-markup.md）:
//   - DB に入るのは打った文字列そのもの。HTML へ変換して保存しない（描画のたびにここでパースする）。
//   - エスケープ記法は持たない。閉じ記号が無い記号は装飾にならず、そのまま文字として表示される。
//   - server-only を付けない（client component から直接 import する）。

export type RichTextMark = "bold" | "italic" | "red" | "underline";

/** 装飾の切れ目で分割したテキスト片。marks が空なら素のテキスト。 */
export type RichTextSegment = { text: string; marks: RichTextMark[] };

/**
 * 囲み記号の一覧。**先頭から順に照合するため、長い記号を先に並べる**
 * （`*` を先に置くと `**太字**` が斜体として食われる）。
 *
 * `***` は Markdown と同じく「太字＋斜体」の 1 記号として扱う。`**` と `*` の入れ子
 * （`**太字*斜体*太字**`）でも同じ結果は書けるが、`***太字斜体***` と書いたときに
 * 内側の `*` が閉じられず崩れるため、専用の記号として先頭に置く。
 */
const DELIMITERS: ReadonlyArray<{ token: string; marks: RichTextMark[] }> = [
  { token: "***", marks: ["bold", "italic"] },
  { token: "**", marks: ["bold"] },
  { token: "==", marks: ["red"] },
  { token: "__", marks: ["underline"] },
  { token: "*", marks: ["italic"] },
];

/** className の生成順を安定させるための正規順序（marks 配列の並びに依存させない）。 */
const MARK_ORDER: ReadonlyArray<RichTextMark> = ["bold", "italic", "red", "underline"];

function sortMarks(marks: RichTextMark[]): RichTextMark[] {
  return MARK_ORDER.filter((m) => marks.includes(m));
}

function parseInto(text: string, marks: RichTextMark[], out: RichTextSegment[]): void {
  let buffer = "";
  let i = 0;
  const flush = () => {
    if (buffer.length > 0) {
      out.push({ text: buffer, marks: sortMarks(marks) });
      buffer = "";
    }
  };

  while (i < text.length) {
    // 既に効いている装飾の入れ子（`**a**b**`）は開けない。閉じ記号を先に見つけさせて素直に閉じる。
    const delimiter = DELIMITERS.find(
      (d) => text.startsWith(d.token, i) && d.marks.every((m) => !marks.includes(m)),
    );
    if (delimiter) {
      const contentStart = i + delimiter.token.length;
      const close = text.indexOf(delimiter.token, contentStart);
      // 閉じ記号が無い（-1）／中身が空（`****`）のときは装飾にせず、記号を文字として残す。
      if (close > contentStart) {
        flush();
        parseInto(text.slice(contentStart, close), [...marks, ...delimiter.marks], out);
        i = close + delimiter.token.length;
        continue;
      }
    }
    buffer += text[i];
    i += 1;
  }
  flush();
}

/** 装飾記法を含むテキストをセグメント列へ分解する。装飾が無ければ 1 セグメントを返す。 */
export function parseRichText(text: string): RichTextSegment[] {
  const out: RichTextSegment[] = [];
  parseInto(text, [], out);
  return out;
}

/** 装飾が 1 つも含まれないか（描画側で span を作らず素通しするための判定）。 */
export function hasRichTextMarkup(text: string): boolean {
  return parseRichText(text).some((s) => s.marks.length > 0);
}

/**
 * 装飾記号を取り除いた素のテキスト。装飾を描画しない用途
 * （選択肢の重複排除キー・読み上げ・比較）で使う。
 */
export function stripRichTextMarkup(text: string): string {
  return parseRichText(text)
    .map((s) => s.text)
    .join("");
}
