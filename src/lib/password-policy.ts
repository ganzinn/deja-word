// パスワード長ポリシーの単一の出どころ。
// Better Auth の既定（minPasswordLength=8 / maxPasswordLength=128）に合わせており、
// auth.ts でこの値を明示設定してサーバー側ポリシーとクライアント検証を一致させる。
// server-only / @/ を含まない素の定数なので、アプリ（@/lib/...）からも
// ops スクリプト（../src/lib/...）からも安全に import できる。

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
