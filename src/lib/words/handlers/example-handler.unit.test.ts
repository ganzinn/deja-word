import { describe, expect, test } from "vitest";

import { SYSTEM_USER_ID } from "@/lib/system-user";
import { upsertExamples } from "@/lib/words/handlers/example-handler";

import { asTx, makeTxMock } from "../../../../tests/setup/tx-mock";

const editor = { userId: "u1", isSystem: false };

describe("upsertExamples", () => {
  test("pass-through: system row gets a sortOrder-only update", async () => {
    const tx = makeTxMock();
    await upsertExamples(
      asTx(tx),
      editor,
      [
        {
          id: "e1",
          ownerId: SYSTEM_USER_ID,
          kind: "SENTENCE",
          text: "It is.",
          meaning: "",
          note: "",
        },
      ],
      { wordId: "w1" },
    );

    expect(tx.example.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { sortOrder: 0 },
      select: { id: true },
    });
    expect(tx.example.create).not.toHaveBeenCalled();
  });

  test("own row: body fields are updated (text trimmed)", async () => {
    const tx = makeTxMock();
    await upsertExamples(
      asTx(tx),
      editor,
      [{ id: "e1", ownerId: "u1", kind: "PHRASE", text: " hi ", meaning: "x", note: "" }],
      { wordId: "w1" },
    );

    expect(tx.example.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "e1" },
        data: expect.objectContaining({ kind: "PHRASE", text: "hi", meaning: "x", sortOrder: 0 }),
      }),
    );
    expect(tx.example.create).not.toHaveBeenCalled();
  });

  test("new row: example is created for the editor", async () => {
    const tx = makeTxMock();
    await upsertExamples(
      asTx(tx),
      editor,
      [{ kind: "SENTENCE", text: "new", meaning: "", note: "" }],
      { wordId: "w1" },
    );

    expect(tx.example.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ wordId: "w1", ownerId: "u1", text: "new" }),
      }),
    );
    expect(tx.example.update).not.toHaveBeenCalled();
  });
});
