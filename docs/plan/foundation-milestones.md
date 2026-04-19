# deja-word 実装計画（基盤整備フェーズ）

## Context

`deja-word` は README に記載の「一度忘れた単語との再会体験」をコンセプトとする英単語学習 Web アプリ。現時点でリポジトリは `README.md` / `LICENSE` のみで、実装は未着手。

単語アプリ自体の機能仕様（データモデル・重複検知・UI 体験など）は **全体像と今後の拡張性を踏まえて別途計画する**。本計画はその前段として、**認証・開発基盤・デプロイ周りを先に整える**ことに絞ったマイルストーンを並べたもの。各マイルストーンは独立したセッションで着手できる粒度とし、詳細設計・コード生成は各セッション内で行う。

### 前提（本セッションで確定した方針）
- **技術スタック**: Next.js (App Router) + TypeScript / Tailwind CSS / PostgreSQL / Prisma / Vercel
- **認証**: [Better Auth](https://www.better-auth.com/) を採用、初期スコープは **メール + パスワードのみ**（メール確認・パスワードリセットは後回し）
- **ローカル DB**: Docker Compose で PostgreSQL を起動
- **DX ツール**: ESLint（Next.js 既定）＋ Prettier
- **スコープ外（別計画）**: 単語モデル・登録/一覧 UI・重複検知体験

---

## マイルストーン一覧

| # | マイルストーン | 主眼 |
|---|---|---|
| M1 | プロジェクト土台 | Next.js / TS / Tailwind / Prettier の初期化 |
| M2 | DB 基盤 | Docker Compose + Prisma セットアップ |
| M3 | Better Auth 導入 | メール＋パスワード認証の組込み |
| M4 | 認証 UI & ルート保護 | サインアップ / ログイン画面、ミドルウェア |
| M5 | デプロイ準備 | Vercel + 本番 DB + 環境変数 |

このフェーズ完了後に、別セッションで「単語アプリ機能の全体設計」を行う想定。

---

## M1: プロジェクト土台

- **目的**: これから全てのコードが載る土台を整える。
- **成果物**:
  - `create-next-app` ベースの Next.js (App Router) + TypeScript プロジェクト
  - Tailwind CSS 設定（`tailwind.config.ts` / グローバル CSS）
  - Prettier 設定（`.prettierrc` / `.prettierignore`）と npm script (`format` / `format:check`)
  - `.gitignore`、トップページに動作確認用の最小 UI
- **次セッションへの引き継ぎ**: 使用したパッケージバージョン、ディレクトリ構成方針（`src/` 利用有無、alias 設定）。

## M2: DB 基盤

- **目的**: ローカルで再現可能な PostgreSQL 環境と Prisma の配線を整える。
- **成果物**:
  - `docker-compose.yml`（PostgreSQL 単体、開発用ボリューム）
  - `.env` / `.env.example`（`DATABASE_URL`）
  - Prisma 導入（`prisma/schema.prisma` の骨格、`prisma generate` / `migrate dev` の script）
  - `src/lib/prisma.ts` の単一インスタンス実装
- **次セッションへの引き継ぎ**: DB 名・認証情報の既定値、マイグレーション運用方針。

## M3: Better Auth 導入

- **目的**: メール＋パスワードで登録・ログイン・ログアウト・セッション維持を成立させる。
- **成果物**:
  - Better Auth インストール（`better-auth` + Prisma アダプタ）
  - Better Auth 用テーブル（user / session / account など）を `schema.prisma` に統合しマイグレーション
  - `src/lib/auth.ts`（サーバ側インスタンス）/ `src/lib/auth-client.ts`（クライアント）
  - `app/api/auth/[...all]/route.ts`（Better Auth のハンドラ）
  - `BETTER_AUTH_SECRET` 等の環境変数を `.env.example` に反映
- **参考**: Better Auth 公式ドキュメントの Next.js + Prisma セクション。
- **次セッションへの引き継ぎ**: 採用した cookie / session 設定、UI からの呼び出し方（`signUp.email` / `signIn.email` / `signOut`）。

## M4: 認証 UI & ルート保護

- **目的**: ユーザーが画面から登録・ログインでき、未ログイン時に保護領域へアクセスできない状態を作る。
- **成果物**:
  - `/sign-up`・`/sign-in` のフォーム（Tailwind、バリデーション最小）
  - ヘッダー等にログイン状態表示 & ログアウトボタン
  - `middleware.ts` もしくは Server Component でのセッションチェック
  - ログイン済みユーザー用の `/dashboard`（空で可、単語機能は別計画）
- **次セッションへの引き継ぎ**: セッション取得の共通ヘルパー、保護されたルートの一覧。

## M5: デプロイ準備

- **目的**: Vercel にデプロイし、本番環境で「サインアップ → ログイン → 保護ページ閲覧」まで通す。
- **成果物**:
  - 本番用 PostgreSQL（Neon / Supabase など）を選定し `DATABASE_URL` 発行
  - Vercel プロジェクト作成と環境変数投入（`DATABASE_URL` / `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` 等）
  - ビルドコマンドに `prisma migrate deploy` を組み込み
  - `main` ブランチ push → 自動デプロイの確認
  - 本番環境での認証フロー動作確認
- **検討事項（宿題として残す）**: GitHub Actions での型チェック / Lint 自走、プレビュー環境の DB 分離方針、監視・ロギング。
- **次セッションへの引き継ぎ**: 本番の認証 cookie 設定（`secure` / `sameSite`）、採用した本番 DB プロバイダ。

---

## 全体の検証方針

各マイルストーン完了時点で、以下のうち対応済みの範囲のみ実機で確認する:

1. `docker compose up -d` で DB 起動（M2 以降）
2. `npm run dev` 起動、トップページ表示（M1 以降）
3. `/sign-up` → `/sign-in` → `/sign-out` の往復（M4 以降）
4. `/dashboard` への未ログインアクセスがサインイン画面にリダイレクト（M4 以降）
5. 本番 URL で 3, 4 が通る（M5）

型検査・Lint は `npm run lint` / `tsc --noEmit` を各セッション終盤で必ず通す。

---

## 次に着手するセッション

**M1: プロジェクト土台** から開始する。本計画書を共有したうえで「M1 を実装して」と伝えれば、新しいセッションで詳細設計と実装を進められる。

基盤整備フェーズ（M1〜M5）の完了後に、**別途「単語アプリ機能の全体設計」セッション** を開き、データモデル・重複検知の仕様・拡張性（将来の機能追加）を議論したうえで実装計画を立てる。
