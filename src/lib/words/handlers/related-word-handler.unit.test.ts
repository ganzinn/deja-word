import { describe, expect, test } from "vitest";

import { SYSTEM_USER_ID } from "@/lib/system-user";
import { upsertRelatedWords } from "@/lib/words/handlers/related-word-handler";

import { asTx, makeTxMock } from "../../../../tests/setup/tx-mock";

const editor = { userId: "u1", isSystem: false };

describe("upsertRelatedWords", () => {
  test("pass-through: system row gets a sortOrder-only update", async () => {
    const tx = makeTxMock();
    await upsertRelatedWords(
      asTx(tx),
      editor,
      [
        {
          id: "r1",
          ownerId: SYSTEM_USER_ID,
          kind: "SYNONYM",
          term: "syn",
          partOfSpeech: "",
          pronunciation: "",
          meaning: "",
          note: "",
        },
      ],
      { wordId: "w1", allowedLinkedIds: new Set() },
    );

    expect(tx.relatedWord.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { sortOrder: 0 },
      select: { id: true },
    });
    expect(tx.relatedWord.create).not.toHaveBeenCalled();
  });

  test("own row: body is updated and an in-scope linkedWordId is kept", async () => {
    const tx = makeTxMock();
    await upsertRelatedWords(
      asTx(tx),
      editor,
      [
        {
          id: "r1",
          ownerId: "u1",
          kind: "ANTONYM",
          term: " ant ",
          partOfSpeech: "",
          pronunciation: "",
          meaning: "",
          note: "",
          linkedWordId: "lw1",
        },
      ],
      { wordId: "w1", allowedLinkedIds: new Set(["lw1"]) },
    );

    expect(tx.relatedWord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: expect.objectContaining({ term: "ant", sortOrder: 0, linkedWordId: "lw1" }),
      }),
    );
    expect(tx.relatedWord.create).not.toHaveBeenCalled();
  });

  test("new row: created with out-of-scope linkedWordId nulled", async () => {
    const tx = makeTxMock();
    await upsertRelatedWords(
      asTx(tx),
      editor,
      [
        {
          ownerId: "",
          term: "ghost",
          partOfSpeech: "",
          pronunciation: "",
          meaning: "",
          note: "",
          linkedWordId: "lw-out",
        },
      ],
      { wordId: "w1", allowedLinkedIds: new Set() },
    );

    expect(tx.relatedWord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ wordId: "w1", ownerId: "u1", term: "ghost", linkedWordId: null }),
      }),
    );
    expect(tx.relatedWord.update).not.toHaveBeenCalled();
  });
});
