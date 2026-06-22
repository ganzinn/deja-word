import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

// Better Auth の `emailAndPassword.sendResetPassword` は `requestPasswordReset` と
// 同一の async コンテキスト内で await される（`advanced.backgroundTasks.handler` 未設定時）。
// メール送信の代わりに、その呼び出しスコープへ受け皿を渡して reset トークンを同期的に捕捉する。
// 用途は管理者によるユーザー招待（設定 URL を画面表示）であり、メール基盤は使わない。

const sink = new AsyncLocalStorage<{ token?: string }>();

/** `sendResetPassword` コールバックから呼ぶ。捕捉スコープがあればトークンを記録する。 */
export function recordResetToken(token: string): void {
  const store = sink.getStore();
  if (store) store.token = token;
}

/**
 * `fn`（内部で `auth.api.requestPasswordReset` を呼ぶ）を捕捉スコープで実行し、
 * `recordResetToken` 経由で記録された reset トークンを返す。記録が無ければ undefined。
 */
export async function captureResetToken(fn: () => Promise<void>): Promise<string | undefined> {
  const store: { token?: string } = {};
  await sink.run(store, fn);
  return store.token;
}
