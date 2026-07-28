// 掲載番号順出題（docs/adr/0072-quiz-order-by-occurrence-number.md）の並べ替え。
// 出題順の決定はここに集約し、各形式ビルダー（generation/*.ts）は従来どおり
// Fisher–Yates で組み立てたままにする（RNG の消費列を変えないための設計）。DB 非依存。

import type { QuestionBase } from "@/lib/quiz/payload";

/** wordId → 対象 Occurrence での掲載番号。番号なし・掲載箇所外の単語はキーを持たない。 */
export type OccurrenceNumberByWordId = ReadonlyMap<string, number>;

/**
 * 取得行（`fetchQuizSource` の `targetRows`）から wordId → 掲載番号の対応を作る。
 * 全件モード（掲載箇所未指定）では `wordOccurrences` が常に空配列のため空 Map になり、
 * 並べ替えは実質無効になる（掲載番号順は掲載箇所指定モードの機能。ADR-0022 と一貫）。
 */
export function occurrenceNumbersOf(
  rows: readonly { id: string; wordOccurrences: readonly { occurrenceNumber: number | null }[] }[],
): OccurrenceNumberByWordId {
  const numbers = new Map<string, number>();
  for (const row of rows) {
    const number = row.wordOccurrences[0]?.occurrenceNumber;
    if (number !== undefined && number !== null) numbers.set(row.id, number);
  }
  return numbers;
}

/**
 * 問題配列を掲載番号の昇順へ並べ替える（生成済みの問題を並べ替えるだけの純関数）。
 *
 * 番号を持たない問題は末尾へ寄せ、同順位（番号なし同士）は headword の辞書順で安定させる
 * （番号なしが出題対象に混じるのは drill の救済経路など例外的な状況のみ。ADR-0067）。
 */
export function orderQuestionsByOccurrenceNumber<T extends QuestionBase>(
  questions: readonly T[],
  numbers: OccurrenceNumberByWordId,
): T[] {
  return [...questions].sort((a, b) => {
    const numberA = numbers.get(a.wordId);
    const numberB = numbers.get(b.wordId);
    if (numberA === undefined || numberB === undefined) {
      if (numberA === numberB) return a.headword.localeCompare(b.headword);
      return numberA === undefined ? 1 : -1;
    }
    return numberA - numberB;
  });
}
