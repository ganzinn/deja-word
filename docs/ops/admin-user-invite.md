# 管理者によるユーザー招待（メール登録＋本人パスワード設定）

本番では `DISABLE_SIGNUP="true"` でセルフサインアップ（`/sign-up`）を停止しているため、一般ユーザーは
**管理者がメールアドレスを登録 → 発行された設定リンクを本人に渡す → 本人がパスワードを設定** という流れで追加する。
パスワードは管理者が設定せず、本人だけが知る。

仕組みは Better Auth の正規パスワードリセット機構（`requestPasswordReset` → `resetPassword`）に乗っている。
メール送信は行わず、`sendResetPassword` コールバックで発行トークンを捕捉し、設定 URL を管理画面に表示する
（`src/lib/auth-reset-link.ts` / `src/lib/auth.ts`）。

## 前提：管理者ログイン

管理画面は **system ユーザー（`id="system"`）でログインしている場合のみ**表示される
（それ以外は `notFound()`）。事前に system ユーザーのログイン情報を用意しておく。

```sh
SYSTEM_USER_PASSWORD=... pnpm db:set-system-password
```

`system@deja-word.internal` でログインすると、`/menu` に「ユーザー管理」リンクが表示される。

## 手順

1. system ユーザーで `/sign-in` → `/menu` →「ユーザー管理」（`/admin/users`）へ。
2. 招待したい **メールアドレス**を入力して「登録 / リンク発行」。
   - 未登録の email は新規ユーザーとして作成される（`User.name` は email のローカル部を仮値とし、本人が後から `/account/edit` で変更可能）。新規ユーザーには system 掲載箇所のプリセットが付与される。
   - 既存ユーザーの email でも実行でき、設定リンクの**再発行**として使える（一覧の「設定リンク再発行」ボタンも同じ）。
3. 表示された **パスワード設定 URL（`/set-password?token=...`）をコピーして本人に渡す**。有効期限は **24 時間**。
4. 本人が URL を開き、新しいパスワードを設定すると credential アカウントが作成される。
   完了後は `/sign-in` から登録した email とパスワードでログインできる。

## 注意

- 設定 URL のトークンは `Verification` テーブル（`identifier = "reset-password:<token>"`）に保存され、
  パスワード設定時に消費される。期限切れ・消費済み・改ざんトークンは `/set-password` で無効として扱われ、
  管理者へ再発行を依頼する案内が出る。
- 有効期限は `src/lib/auth.ts` の `resetPasswordTokenExpiresIn`（既定 24h）で変更できる。
- 本番のセルフサインアップ停止（`DISABLE_SIGNUP="true"`）は維持する。本フローが本番でのユーザー追加経路になる。
