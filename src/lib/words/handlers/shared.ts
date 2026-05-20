import { SYSTEM_USER_ID } from "@/lib/system-user";

import type { Prisma } from "@/generated/prisma/client";

export type Tx = Prisma.TransactionClient;

/**
 * 書き込みを行う編集者の文脈。`isSystem` は編集者自身が system ユーザーかどうか
 * （= 旧 `editorIsSystem`）。行ごとの所有権判定（pass-through 等）は別概念で、
 * フェーズ 4 で policy/ に集約予定。ここでは「誰が書いているか」だけを表す。
 */
export type EditorContext = {
  userId: string;
  isSystem: boolean;
};

export function editorContextFor(userId: string): EditorContext {
  return { userId, isSystem: userId === SYSTEM_USER_ID };
}

/** 空文字 / 空白のみは null に正規化する。 */
export function nullable(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function uniqueStrings(values: ReadonlyArray<string | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => typeof v === "string")));
}
