import { describe, expect, test } from "vitest";

import type { QuizResult } from "@/generated/prisma/enums";

import { computeBulkBookmarkTargetIds } from "./bulk-bookmark-targets";
import type { ResultRow } from "./result-list";

/** 対象算出は wordId と result しか見ないため、その 2 つだけの最小 fixture で足りる。 */
function row(wordId: string, result: QuizResult): ResultRow {
  return { wordId, result } as unknown as ResultRow;
}

describe("computeBulkBookmarkTargetIds", () => {
  test("誤答（CORRECT 以外）だけを対象にする", () => {
    const rows = [
      row("a", "CORRECT"),
      row("b", "INCORRECT"),
      row("c", "VAGUE"),
      row("d", "GAVE_UP"),
      row("e", "TIMEOUT"),
    ];
    expect(computeBulkBookmarkTargetIds(rows, { status: "success", skippedWordIds: [] })).toEqual([
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  test("TEST / DRILL_RETRY（success）は skippedWordIds の単語を除外する", () => {
    const rows = [row("a", "INCORRECT"), row("b", "VAGUE"), row("c", "TIMEOUT")];
    expect(
      computeBulkBookmarkTargetIds(rows, { status: "success", skippedWordIds: ["b"] }),
    ).toEqual(["a", "c"]);
  });

  test("DRILL（drill-success）は確定残数に行が無い単語を除外する", () => {
    const rows = [row("a", "INCORRECT"), row("b", "VAGUE"), row("c", "CORRECT")];
    expect(
      computeBulkBookmarkTargetIds(rows, {
        status: "drill-success",
        // b は残数一覧に無い＝ラウンド中に削除された単語
        remaining: [
          { wordId: "a", remaining: 2 },
          { wordId: "c", remaining: 0 },
        ],
      }),
    ).toEqual(["a"]);
  });

  test("全行が削除済みなら空配列（対象 0 件）", () => {
    const rows = [row("a", "INCORRECT"), row("b", "TIMEOUT")];
    expect(
      computeBulkBookmarkTargetIds(rows, { status: "success", skippedWordIds: ["a", "b"] }),
    ).toEqual([]);
  });

  test("sending は削除済み判定なしで誤答全行", () => {
    const rows = [row("a", "INCORRECT"), row("b", "CORRECT"), row("c", "VAGUE")];
    expect(computeBulkBookmarkTargetIds(rows, { status: "sending" })).toEqual(["a", "c"]);
  });

  test("error も削除済み判定なしで誤答全行", () => {
    const rows = [row("a", "INCORRECT"), row("b", "CORRECT"), row("c", "GAVE_UP")];
    expect(computeBulkBookmarkTargetIds(rows, { status: "error", message: "失敗" })).toEqual([
      "a",
      "c",
    ]);
  });

  test("誤答が無ければ空配列", () => {
    const rows = [row("a", "CORRECT"), row("b", "CORRECT")];
    expect(computeBulkBookmarkTargetIds(rows, { status: "success", skippedWordIds: [] })).toEqual(
      [],
    );
  });
});
