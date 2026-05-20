import { describe, expect, test } from "vitest";

import { SYSTEM_USER_ID } from "@/lib/system-user";
import { upsertMeanings } from "@/lib/words/handlers/meaning-handler";

import { asTx, makeTxMock } from "../../../../tests/setup/tx-mock";

const editor = { userId: "u1", isSystem: false };

describe("upsertMeanings", () => {
  test("pass-through: system row gets a sortOrder-only update and editor text is appended", async () => {
    const tx = makeTxMock();
    await upsertMeanings(
      asTx(tx),
      editor,
      [
        {
          id: "m1",
          ownerId: SYSTEM_USER_ID,
          partOfSpeech: "n",
          pronunciation: "p",
          note: "note",
          texts: [
            { id: "t1", ownerId: SYSTEM_USER_ID, text: "共通" },
            { text: "自分の追記" },
          ],
        },
      ],
      { wordId: "w1" },
    );

    expect(tx.meaning.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { sortOrder: 0 },
      select: { id: true },
    });
    expect(tx.meaning.create).not.toHaveBeenCalled();
    expect(tx.meaningText.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { sortOrder: 0 },
      select: { id: true },
    });
    expect(tx.meaningText.create).toHaveBeenCalledWith({
      data: { meaningId: "m1", ownerId: "u1", text: "自分の追記", sortOrder: 1 },
      select: { id: true },
    });
  });

  test("own row: meta is updated and texts are recreated via createMany", async () => {
    const tx = makeTxMock();
    await upsertMeanings(
      asTx(tx),
      editor,
      [
        {
          id: "m1",
          ownerId: "u1",
          partOfSpeech: "adj",
          pronunciation: "",
          note: "",
          texts: [{ text: "意味" }],
        },
      ],
      { wordId: "w1" },
    );

    expect(tx.meaning.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "m1" },
        data: expect.objectContaining({ partOfSpeech: "adj", sortOrder: 0 }),
      }),
    );
    expect(tx.meaningText.createMany).toHaveBeenCalledWith({
      data: [{ meaningId: "m1", ownerId: "u1", text: "意味", sortOrder: 0 }],
    });
    expect(tx.meaning.create).not.toHaveBeenCalled();
  });

  test("new row: meaning is created for the editor with nested texts", async () => {
    const tx = makeTxMock();
    await upsertMeanings(
      asTx(tx),
      editor,
      [{ ownerId: "", partOfSpeech: "", pronunciation: "", note: "", texts: [{ text: "新規" }] }],
      { wordId: "w1" },
    );

    expect(tx.meaning.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ wordId: "w1", ownerId: "u1" }),
      }),
    );
    expect(tx.meaning.update).not.toHaveBeenCalled();
  });
});
