import { vi } from "vitest";

import type { Tx } from "@/lib/words/handlers/shared";

/**
 * handler の unit テスト用に Prisma TransactionClient を模した spy オブジェクトを作る。
 * 各 delegate メソッドは `vi.fn()` で、既定では `{ id }` を解決する。戻り値を使う
 * occurrence 経路などは各テストで `mockResolvedValueOnce` で上書きする。
 */

type DelegateMock = {
  update: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  createMany: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findUniqueOrThrow: ReturnType<typeof vi.fn>;
};

function delegate(): DelegateMock {
  return {
    update: vi.fn().mockResolvedValue({ id: "id" }),
    create: vi.fn().mockResolvedValue({ id: "id" }),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    delete: vi.fn().mockResolvedValue({ id: "id" }),
    findFirst: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ ownerId: "system" }),
  };
}

export type TxMock = {
  meaning: DelegateMock;
  meaningText: DelegateMock;
  meaningNote: DelegateMock;
  example: DelegateMock;
  exampleNote: DelegateMock;
  relatedWord: DelegateMock;
  relatedWordNote: DelegateMock;
  memo: DelegateMock;
  occurrence: DelegateMock;
  wordOccurrence: DelegateMock;
  occurrenceDetail: DelegateMock;
  quizAnswer: DelegateMock;
  drill: DelegateMock;
  drillWord: DelegateMock;
};

export function makeTxMock(): TxMock {
  return {
    meaning: delegate(),
    meaningText: delegate(),
    meaningNote: delegate(),
    example: delegate(),
    exampleNote: delegate(),
    relatedWord: delegate(),
    relatedWordNote: delegate(),
    memo: delegate(),
    occurrence: delegate(),
    wordOccurrence: delegate(),
    occurrenceDetail: delegate(),
    quizAnswer: delegate(),
    drill: delegate(),
    drillWord: delegate(),
  };
}

/** handler に渡すための型キャスト。spy 確認はテスト側で TxMock 経由で行う。 */
export function asTx(mock: TxMock): Tx {
  return mock as unknown as Tx;
}
