import { describe, expect, test } from "vitest";

import { SYSTEM_USER_ID } from "@/lib/system-user";
import { upsertMemos } from "@/lib/words/handlers/memo-handler";

import { asTx, makeTxMock } from "../../../../tests/setup/tx-mock";

const editor = { userId: "u1", isSystem: false };

describe("upsertMemos", () => {
  test("pass-through: system row gets a sortOrder-only update", async () => {
    const tx = makeTxMock();
    await upsertMemos(asTx(tx), editor, [{ id: "m1", ownerId: SYSTEM_USER_ID, text: "共通メモ" }], {
      wordId: "w1",
    });

    expect(tx.memo.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { sortOrder: 0 },
      select: { id: true },
    });
    expect(tx.memo.create).not.toHaveBeenCalled();
  });

  test("own row: text and sortOrder are updated (text trimmed)", async () => {
    const tx = makeTxMock();
    await upsertMemos(asTx(tx), editor, [{ id: "m1", ownerId: "u1", text: " memo " }], {
      wordId: "w1",
    });

    expect(tx.memo.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { text: "memo", sortOrder: 0 },
      select: { id: true },
    });
    expect(tx.memo.create).not.toHaveBeenCalled();
  });

  test("new row: memo is created for the editor", async () => {
    const tx = makeTxMock();
    await upsertMemos(asTx(tx), editor, [{ ownerId: "", text: "新規メモ" }], { wordId: "w1" });

    expect(tx.memo.create).toHaveBeenCalledWith({
      data: { wordId: "w1", ownerId: "u1", text: "新規メモ", sortOrder: 0 },
      select: { id: true },
    });
    expect(tx.memo.update).not.toHaveBeenCalled();
  });
});
