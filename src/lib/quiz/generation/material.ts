// 素材型と取得行のパーティション純関数（05-architecture.md 決定 8）。
// 取得クエリ `fetchQuizSource` はチケット 04。本ファイルは DB 非依存。

import type { MeaningDisplay, QuestionBase } from "@/lib/quiz/payload";

/** `fetchQuizSource` が返す 1 行（ユーザーの可視単語。MeaningText 1 件以上が前提）。 */
export type QuizSourceRow = {
  id: string;
  headword: string;
  /** sortOrder 順。先頭が「最初の Meaning」。 */
  meanings: {
    partOfSpeech: string | null;
    pronunciationAudioUrl: string | null;
    texts: { text: string }[];
  }[];
  /** 対象 Occurrence に紐づく掲載情報（紐づきがなければ空配列）。 */
  wordOccurrences: { occurrenceNumber: number | null }[];
};

export type QuizMeaning = {
  partOfSpeech: string | null;
  pronunciationAudioUrl: string | null;
  texts: string[];
};

export type QuizWord = {
  id: string;
  headword: string;
  /** sortOrder 順。先頭が「最初の Meaning」。各単語は意味 1 件以上が入力前提。 */
  meanings: QuizMeaning[];
};

/** 掲載番号の範囲。空欄＝制限なし、片側のみ指定可。 */
export type QuizRange = { from?: number; to?: number };

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

function toQuizWord(row: QuizSourceRow): QuizWord {
  return {
    id: row.id,
    headword: row.headword,
    meanings: row.meanings.map((m) => ({
      partOfSpeech: m.partOfSpeech,
      pronunciationAudioUrl: m.pronunciationAudioUrl,
      texts: m.texts.map((t) => t.text),
    })),
  };
}

function isInRange(n: number, range: QuizRange): boolean {
  if (range.from !== undefined && n < range.from) return false;
  if (range.to !== undefined && n > range.to) return false;
  return true;
}

/** 取得行を (a) 出題対象 / (b) 同一 Occurrence プール / (c) 全登録プールに分割する。 */
export function partitionMaterial(rows: QuizSourceRow[], range: QuizRange): QuizSourceMaterial {
  const targets: QuizWord[] = [];
  const sameOccurrencePool: QuizWord[] = [];
  const allWordsPool: QuizWord[] = [];
  for (const row of rows) {
    const word = toQuizWord(row);
    const numbers = row.wordOccurrences
      .map((o) => o.occurrenceNumber)
      .filter((n): n is number => n !== null);
    if (numbers.some((n) => isInRange(n, range))) {
      targets.push(word);
    } else if (row.wordOccurrences.length > 0) {
      sameOccurrencePool.push(word);
    } else {
      allWordsPool.push(word);
    }
  }
  return { targets, sameOccurrencePool, allWordsPool };
}

/** 全 Meaning 横断の全 MeaningText（trim なしの生テキスト）。 */
export function allMeaningTexts(word: QuizWord): string[] {
  return word.meanings.flatMap((m) => m.texts);
}

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

/** 問題の共通項目。発音音源 URL は最初の Meaning のもの（未登録なら null）。 */
export function questionBaseOf(word: QuizWord): QuestionBase {
  return {
    wordId: word.id,
    headword: word.headword,
    pronunciationAudioUrl: word.meanings[0]?.pronunciationAudioUrl ?? null,
  };
}
