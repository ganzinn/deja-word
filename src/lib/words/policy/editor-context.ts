import { SYSTEM_USER_ID } from "@/lib/system-user";

/**
 * 書き込みを行う編集者の文脈。`isSystem` は編集者自身が system ユーザーかどうか
 * （= 旧 `editorIsSystem`）。ここでは「誰が書いているか」だけを表し、行ごとの
 * 所有権判定（pass-through 等）は {@link ./row-policy} に分離する。
 */
export type EditorContext = {
  userId: string;
  isSystem: boolean;
};

export function editorContextFor(userId: string): EditorContext {
  return { userId, isSystem: userId === SYSTEM_USER_ID };
}
