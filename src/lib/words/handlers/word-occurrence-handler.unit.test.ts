import { describe, expect, test } from "vitest";

import { SYSTEM_USER_ID } from "@/lib/system-user";
import { upsertWordOccurrences } from "@/lib/words/handlers/word-occurrence-handler";

import { asTx, makeTxMock } from "../../../../tests/setup/tx-mock";

const editor = { userId: "u1", isSystem: false };
const sysEditor = { userId: SYSTEM_USER_ID, isSystem: true };

describe("upsertWordOccurrences", () => {
  test("pass-through: system WordOccurrence gets sortOrder-only update; editor detail is appended", async () => {
    const tx = makeTxMock();
    await upsertWordOccurrences(
      asTx(tx),
      editor,
      [
        {
          id: "wo1",
          ownerId: SYSTEM_USER_ID,
          occurrenceId: "",
          occurrenceOwnerId: "",
          location: "ターゲット1900",
          occurrenceNumber: 1,
          details: [
            { id: "d1", ownerId: SYSTEM_USER_ID, detail: "共通詳細" },
            { detail: "自分の詳細" },
          ],
        },
      ],
      { wordId: "w1", allowedPresetIds: new Set() },
    );

    expect(tx.wordOccurrence.update).toHaveBeenCalledWith({
      where: { id: "wo1" },
      data: { sortOrder: 0 },
      select: { id: true },
    });
    expect(tx.wordOccurrence.create).not.toHaveBeenCalled();
    expect(tx.occurrenceDetail.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { sortOrder: 0 },
      select: { id: true },
    });
    expect(tx.occurrenceDetail.create).toHaveBeenCalledWith({
      data: { wordOccurrenceId: "wo1", ownerId: "u1", detail: "自分の詳細", sortOrder: 1 },
      select: { id: true },
    });
  });

  test("own row + system editor: occurrenceNumber is updated and details recreated", async () => {
    const tx = makeTxMock();
    await upsertWordOccurrences(
      asTx(tx),
      sysEditor,
      [
        {
          id: "wo1",
          ownerId: SYSTEM_USER_ID,
          occurrenceId: "",
          occurrenceOwnerId: "",
          location: "ターゲット1900",
          occurrenceNumber: 99,
          details: [{ detail: "詳細" }],
        },
      ],
      { wordId: "w1", allowedPresetIds: new Set() },
    );

    expect(tx.wordOccurrence.update).toHaveBeenCalledWith({
      where: { id: "wo1" },
      data: { sortOrder: 0, occurrenceNumber: 99 },
      select: { id: true },
    });
    expect(tx.occurrenceDetail.createMany).toHaveBeenCalledWith({
      data: [{ wordOccurrenceId: "wo1", ownerId: SYSTEM_USER_ID, detail: "詳細", sortOrder: 0 }],
    });
    expect(tx.wordOccurrence.create).not.toHaveBeenCalled();
  });

  test("new inline row on an own Occurrence: keeps occurrenceNumber", async () => {
    const tx = makeTxMock();
    tx.occurrence.findFirst.mockResolvedValueOnce(null);
    tx.occurrence.create.mockResolvedValueOnce({ id: "occ1", ownerId: "u1" });

    await upsertWordOccurrences(
      asTx(tx),
      editor,
      [
        {
          ownerId: "",
          occurrenceId: "",
          occurrenceOwnerId: "",
          location: "自分の出典",
          occurrenceNumber: 5,
          details: [],
        },
      ],
      { wordId: "w1", allowedPresetIds: new Set() },
    );

    expect(tx.occurrence.create).toHaveBeenCalledWith({
      data: { ownerId: "u1", location: "自分の出典" },
      select: { id: true, ownerId: true },
    });
    expect(tx.wordOccurrence.create).toHaveBeenCalledWith({
      data: {
        wordId: "w1",
        occurrenceId: "occ1",
        ownerId: "u1",
        sortOrder: 0,
        occurrenceNumber: 5,
      },
      select: { id: true },
    });
  });

  test("preset system Occurrence: nulls occurrenceNumber for a regular user and dedups duplicate rows", async () => {
    const tx = makeTxMock();
    // both rows resolve to the same system preset occurrence
    tx.occurrence.findUniqueOrThrow.mockResolvedValue({ ownerId: SYSTEM_USER_ID });

    await upsertWordOccurrences(
      asTx(tx),
      editor,
      [
        {
          ownerId: "",
          occurrenceId: "sys-occ",
          occurrenceOwnerId: SYSTEM_USER_ID,
          location: "ターゲット1900",
          occurrenceNumber: 7,
          details: [],
        },
        {
          ownerId: "",
          occurrenceId: "sys-occ",
          occurrenceOwnerId: SYSTEM_USER_ID,
          location: "ターゲット1900",
          occurrenceNumber: 8,
          details: [],
        },
      ],
      { wordId: "w1", allowedPresetIds: new Set(["sys-occ"]) },
    );

    // dedup: only one WordOccurrence is created despite two rows pointing at the same occurrence
    expect(tx.wordOccurrence.create).toHaveBeenCalledTimes(1);
    expect(tx.wordOccurrence.create).toHaveBeenCalledWith({
      data: {
        wordId: "w1",
        occurrenceId: "sys-occ",
        ownerId: "u1",
        sortOrder: 0,
        occurrenceNumber: null,
      },
      select: { id: true },
    });
  });
});
