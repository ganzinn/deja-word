import type { Prisma } from "@/generated/prisma/client";

export type Tx = Prisma.TransactionClient;

// EditorContext / editorContextFor は policy/ に集約。handler 側の import パスは
// 温存するためここで型を再公開する。
export type { EditorContext } from "@/lib/words/policy/editor-context";

/** 空文字 / 空白のみは null に正規化する。 */
export function nullable(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function uniqueStrings(values: ReadonlyArray<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => typeof v === "string")));
}
