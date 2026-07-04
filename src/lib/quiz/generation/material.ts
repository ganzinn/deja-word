// 問題生成・drill ラウンド生成が使う素材型と取得行のパーティション純関数
// （05-architecture.md 決定 8。プレビューはこの分割を使わず件数のみ取得する＝決定 8 改訂）。
// 取得クエリ `fetchQuizSource` はチケット 04。本ファイルは DB 非依存。

import type { MeaningDisplay, QuestionBase } from "@/lib/quiz/payload";

/**
 * `fetchQuizSource` が返す 1 行（ユーザーの可視単語）。
 * 非 TG 形式は MeaningText 1 件以上が前提だが、TG 例文形式では meaning 空の単語（meanings=[]）も
 * 「使える TG 例文を持つ」なら出題対象になりうる。表示は tgExample と headword で完結する。
 */
export type QuizSourceRow = {
  id: string;
  headword: string;
  /** sortOrder 順。先頭が「最初の Meaning」。 */
  meanings: {
    partOfSpeech: string | null;
    pronunciationAudioUrl: string | null;
    texts: { text: string }[];
  }[];
};

export type QuizMeaning = {
  partOfSpeech: string | null;
  pronunciationAudioUrl: string | null;
  texts: string[];
};

/**
 * 使える TG 例文の取得行（単語ごとに sortOrder 最小の 1 件へ選抜済み。`fetchQuizSource` の
 * `tgExampleRows`）。text = 英文、meaning = 意味（非 null・非空へ取得側で選抜済み）。
 */
export type TgExampleRow = { wordId: string; text: string; meaning: string };

export type QuizWord = {
  id: string;
  headword: string;
  /**
   * sortOrder 順。先頭が「最初の Meaning」。非 TG 形式は意味 1 件以上が前提だが、
   * TG 例文形式の対象・ダミーでは空配列でありうる（tgExample だけで成立するため）。
   */
  meanings: QuizMeaning[];
  /** 使える TG 例文（sortOrder 最小の 1 件）。TG 例文形式以外の生成時・未登録の単語は null。 */
  tgExample: { text: string; meaning: string } | null;
};

/**
 * 出題素材。(a)(b)(c) は互いに素な分割。
 * ある問題のダミー候補は (a)∪(b) から出題中の単語自身を除いたもの。(c) は不足時の補完用。
 */
export type QuizSourceMaterial = {
  /** (a) 出題対象（occurrenceNumber が範囲内）。 */
  targets: QuizWord[];
  /** (b) 同一 Occurrence プール（紐づきはあるが範囲外・番号なしの単語）。 */
  sameOccurrencePool: QuizWord[];
  /** (c) 全登録プール（対象 Occurrence に紐づかない残りの単語）。 */
  allWordsPool: QuizWord[];
};

function toQuizWord(row: QuizSourceRow, tgExampleByWordId: Map<string, TgExampleRow>): QuizWord {
  const tgExample = tgExampleByWordId.get(row.id);
  return {
    id: row.id,
    headword: row.headword,
    meanings: row.meanings.map((m) => ({
      partOfSpeech: m.partOfSpeech,
      pronunciationAudioUrl: m.pronunciationAudioUrl,
      texts: m.texts.map((t) => t.text),
    })),
    tgExample: tgExample ? { text: tgExample.text, meaning: tgExample.meaning } : null,
  };
}

/**
 * 取得済みの 3 つの行集合を素材 (a)(b)(c) に対応づける純マッパ。
 *
 * 範囲（range）判定・Occurrence 紐付き判定・目標件数までの不足分取得は取得側（`fetchQuizSource`）が
 * SQL で済ませているため、ここでは `QuizWord` への変換のみを行う:
 * `targetRows`→(a) 出題対象、`sameOccurrenceRows`→(b) 同一 Occurrence プール、
 * `fallbackRows`→(c) 全登録プール。
 * `tgExampleRows`（TG 例文形式のみ取得される）は wordId で各 `QuizWord.tgExample` に対応づける。
 */
export function partitionMaterial(
  targetRows: QuizSourceRow[],
  sameOccurrenceRows: QuizSourceRow[],
  fallbackRows: QuizSourceRow[],
  tgExampleRows: TgExampleRow[] = [],
): QuizSourceMaterial {
  const tgExampleByWordId = new Map(tgExampleRows.map((r) => [r.wordId, r]));
  return {
    targets: targetRows.map((row) => toQuizWord(row, tgExampleByWordId)),
    sameOccurrencePool: sameOccurrenceRows.map((row) => toQuizWord(row, tgExampleByWordId)),
    allWordsPool: fallbackRows.map((row) => toQuizWord(row, tgExampleByWordId)),
  };
}

/**
 * 範囲ベースのパーティション結果を、指定 id 集合を出題対象とする素材に再分割する純関数。
 * drill ラウンド生成（未定着単語のみ）・再テスト生成（直前ラウンドの単語のみ）が使う。
 *
 * 出題対象から外れた範囲内の単語（(a) の非 target 分）はダミー候補として
 * 同一 Occurrence プール (b) 側に回す。(c) は非 target 分のみ残す。
 */
export function retargetMaterial(
  partitioned: QuizSourceMaterial,
  targetIds: Set<string>,
): QuizSourceMaterial {
  const isTarget = (w: QuizWord) => targetIds.has(w.id);
  return {
    targets: [
      ...partitioned.targets,
      ...partitioned.sameOccurrencePool,
      ...partitioned.allWordsPool,
    ].filter(isTarget),
    sameOccurrencePool: [...partitioned.targets, ...partitioned.sameOccurrencePool].filter(
      (w) => !isTarget(w),
    ),
    allWordsPool: partitioned.allWordsPool.filter((w) => !isTarget(w)),
  };
}

/** 全 Meaning 横断の全 MeaningText（trim なしの生テキスト）。 */
export function allMeaningTexts(word: QuizWord): string[] {
  return word.meanings.flatMap((m) => m.texts);
}

/** 使える TG 例文を持つことが型で保証された単語（TG 例文形式の出題対象・ダミー）。 */
export type TgQuizWord = QuizWord & { tgExample: NonNullable<QuizWord["tgExample"]> };

/** 使える TG 例文（意味つき）を持つ単語か。TG 例文形式の出題対象・ダミー候補の絞り込みに使う。 */
export function hasTgExample(word: QuizWord): word is TgQuizWord {
  return word.tgExample !== null;
}

/** TG 例文形式の出題対象（使える TG 例文を持つ target のみ）。生成と成立判定で共用する。 */
export function tgTargetsOf(material: QuizSourceMaterial): TgQuizWord[] {
  return material.targets.filter(hasTgExample);
}

/** 出題対象に使える TG 例文の単語が 1 件もないときの理由（TG 例文形式の生成・成立判定で共用）。 */
export const NO_TG_TARGET_REASON = "TG例文（意味つき）が登録された出題対象の単語がありません";

/**
 * sortOrder 順の全 Meaning の表示用データ（品詞＋テキスト）。
 * 自己判定（英語→日本語）の解答表示で使う。
 */
export function meaningDisplaysOf(word: QuizWord): MeaningDisplay[] {
  return word.meanings.map((m) => ({ partOfSpeech: m.partOfSpeech, texts: m.texts }));
}

/**
 * 最初の Meaning（sortOrder 先頭）の MeaningText を「; 」で連結。品詞は含めない。
 * 英語→日本語の四択の選択肢表示と、日本語→英語の問題文（意味の提示）で共用する。
 */
export function firstMeaningText(word: QuizWord): string {
  return (word.meanings[0]?.texts ?? []).join("; ");
}

/**
 * 最初の Meaning（sortOrder 先頭）の先頭 MeaningText（先頭の訳語）のみ。未登録なら空文字。
 * 四択（英語→日本語）で「先頭の訳語だけ表示する」設定が ON のときの選択肢表示に使う。
 */
export function firstMeaningHeadText(word: QuizWord): string {
  return word.meanings[0]?.texts[0] ?? "";
}

/** 問題の共通項目。発音音源 URL は最初の Meaning のもの（未登録なら null）。 */
export function questionBaseOf(word: QuizWord): QuestionBase {
  return {
    wordId: word.id,
    headword: word.headword,
    pronunciationAudioUrl: word.meanings[0]?.pronunciationAudioUrl ?? null,
  };
}
