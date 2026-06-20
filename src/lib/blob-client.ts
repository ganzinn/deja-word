import "server-only";

// 実装は `blob-client-impl.ts`（server-only なし）に置き、ここはクライアント束への
// 誤 import を弾く server-only 境界としてそのまま再エクスポートする。アプリ側は
// 従来どおり `@/lib/blob-client` から型・値を import できる。
export * from "./blob-client-impl";
