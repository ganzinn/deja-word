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
          notes: [{ id: "n1", ownerId: SYSTEM_USER_ID, text: "共通補足" }, { text: "自分の補足" }],
          texts: [{ id: "t1", ownerId: SYSTEM_USER_ID, text: "共通" }, { text: "自分の追記" }],
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
    // 補足説明も同じ pass-through 規約: system note は並び順のみ、編集者の note は追記。
    expect(tx.meaningNote.update).toHaveBeenCalledWith({
      where: { id: "n1" },
      data: { sortOrder: 0 },
      select: { id: true },
    });
    expect(tx.meaningNote.create).toHaveBeenCalledWith({
      data: { meaningId: "m1", ownerId: "u1", text: "自分の補足", sortOrder: 1 },
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
          notes: [{ text: "補足" }],
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
    expect(tx.meaningNote.create).toHaveBeenCalledWith({
      data: { meaningId: "m1", ownerId: "u1", text: "補足", sortOrder: 0 },
      select: { id: true },
    });
    expect(tx.meaning.create).not.toHaveBeenCalled();
  });

  test("new row: meaning is created for the editor with nested texts", async () => {
    const tx = makeTxMock();
    await upsertMeanings(
      asTx(tx),
      editor,
      [
        {
          ownerId: "",
          partOfSpeech: "",
          pronunciation: "",
          notes: [{ text: "新規補足" }],
          texts: [{ text: "新規" }],
        },
      ],
      { wordId: "w1" },
    );

    expect(tx.meaning.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ wordId: "w1", ownerId: "u1" }),
      }),
    );
    // 新規 meaning は mock の create が { id: "id" } を返すため、その id に note がぶら下がる。
    expect(tx.meaningNote.create).toHaveBeenCalledWith({
      data: { meaningId: "id", ownerId: "u1", text: "新規補足", sortOrder: 0 },
      select: { id: true },
    });
    expect(tx.meaning.update).not.toHaveBeenCalled();
  });
});
