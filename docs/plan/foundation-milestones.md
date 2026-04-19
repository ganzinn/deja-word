# deja-word 実装計画（基盤整備フェーズ）

## Context

`deja-word` は README に記載の「一度忘れた単語との再会体験」をコンセプトとする英単語学習 Web アプリ。現時点でリポジトリは `README.md` / `LICENSE` のみで、実装は未着手。

単語アプリ自体の機能仕様（データモデル・重複検知・UI 体験など）は **全体像と今後の拡張性を踏まえて別途計画する**。本計画はその前段として、**認証・開発基盤・デプロイ周りを先に整える**ことに絞ったマイルストーンを並べたもの。各マイルストーンは独立したセッションで着手できる粒度とし、詳細設計・コード生成は各セッション内で行う。

### 前提（本セッションで確定した方針）
- **技術スタック**: Next.js (App Router) + TypeScript / Tailwind CSS / PostgreSQL / Prisma / Vercel
- **認証**: [Better Auth](https://www.better-auth.com/) を採用、初期スコープは **メール + パスワードのみ**（メール確認・パスワードリセットは後回し）
- **ローカル DB**: Docker Compose で PostgreSQL を起動
- **Prisma 構成**: Prisma 7 系（`prisma-client` generator + driver adapter 必須）。接続 URL は `prisma.config.ts` 経由、ランタイムは `@prisma/adapter-pg` で `pg.Pool` を渡す
- **DX ツール**: ESLint（Next.js 既定）＋ Prettier
- **パッケージマネージャー**: pnpm（`src/` ディレクトリ構成、import alias `@/*`）
- **ランタイム管理**: mise（`.mise.toml` に Node / pnpm を exact pin。`package.json` の `engines` / `packageManager` と 3 箇所同期）
- **スコープ外（別計画）**: 単語モデル・登録/一覧 UI・重複検知体験

### Prisma / DB 運用ルール（M2 以降のすべてのセッションで遵守）

- **Prisma 7 規約**:
  - `prisma/schema.prisma` の `datasource db` に `url` を書き戻さない（Prisma 7 で廃止、書くとバリデーションエラー）
  - 接続文字列の差し替え点は `prisma.config.ts`（CLI 用）と `src/lib/prisma.ts` の `PrismaPg`（ランタイム用）の **2 か所のみ**
  - 生成クライアントの import は `@/generated/prisma/client` 経由（`@prisma/client` から直接インポートしない）
  - `prisma.config.ts` 編集時は先頭の `import "dotenv/config";` を維持すること（消すと `migrate dev` が `DATABASE_URL` を読めなくなる）
- **マイグレーション運用**:
  - 開発中は `pnpm db:migrate`（`prisma migrate dev`）で名前付きマイグレーション＋適用
  - CI / 本番は `pnpm db:migrate:deploy`（M5 で Vercel のビルドコマンドに組み込む）
  - 一度適用したマイグレーションの SQL は **編集しない**。常に新規マイグレーションを切る

---

## マイルストーン一覧

| # | マイルストーン | 主眼 | 状態 |
|---|---|---|---|
| M1 | プロジェクト土台 | Next.js / TS / Tailwind / Prettier の初期化 | ✅ 完了（2026-04-19） |
| M2 | DB 基盤 | Docker Compose + Prisma セットアップ | ✅ 完了（2026-04-19） |
| M3 | Better Auth 導入 | メール＋パスワード認証の組込み | 未着手 |
| M4 | 認証 UI & ルート保護 | サインアップ / ログイン画面、ミドルウェア | 未着手 |
| M5 | デプロイ準備 | Vercel + 本番 DB + 環境変数 | 未着手 |

このフェーズ完了後に、別セッションで「単語アプリ機能の全体設計」を行う想定。

---

## M1: プロジェクト土台 ✅

- **目的**: これから全てのコードが載る土台を整える。
- **成果物**:
  - `create-next-app` ベースの Next.js (App Router) + TypeScript プロジェクト
  - Tailwind CSS v4（CSS ベース設定。`tailwind.config.ts` ではなく `@import "tailwindcss";` + `@theme` を `globals.css` に記述）
  - Prettier 設定（`.prettierrc.json` / `.prettierignore`）と npm script (`format` / `format:check`)
  - `.gitignore`、トップページに動作確認用の最小 UI
- **実装結果（2026-04-19）**:
  - Next.js 16.2.4 / React 19.2.4 / TypeScript 5.9.3 / Tailwind 4.2.2 / ESLint 9.39.4
  - Prettier 3.8.3 + `prettier-plugin-tailwindcss` 0.7.2 + `eslint-config-prettier` 10.1.8
  - `src/` ディレクトリ構成、import alias `@/*`
  - `.mise.toml` で Node `24.15.0` / pnpm `10.33.0` を exact pin
  - `package.json` に `engines.node` / `engines.pnpm` / `packageManager` を追記（Vercel デプロイ時の正規ルート）
  - scripts: `dev` / `build` / `start` / `lint` / `typecheck` / `format` / `format:check`
  - `create-next-app` 16 が生成する `AGENTS.md` / `CLAUDE.md` / `pnpm-workspace.yaml` をそのまま採用
- **次セッションへの引き継ぎ**:
  - 使用パッケージバージョン（上記）
  - `src/` 採用、import alias `@/*`
  - Node / pnpm は `.mise.toml` + `package.json` の `engines` + `packageManager` の 3 箇所で exact pin 同期。アップデート時は同じ PR で同時更新
  - Tailwind は v4 で CSS ベース設定（`tailwind.config.ts` 不使用）

## M2: DB 基盤 ✅

- **目的**: ローカルで再現可能な PostgreSQL 環境と Prisma の配線を整える。
- **成果物**:
  - `docker-compose.yml`（PostgreSQL 単体、開発用ボリューム）
  - `.env` / `.env.example`（`DATABASE_URL`）
  - Prisma 導入（`prisma/schema.prisma` の骨格、`prisma generate` / `migrate dev` の script）
  - `src/lib/prisma.ts` の単一インスタンス実装
- **実装結果（2026-04-19）**:
  - Prisma 7.7.0 / `@prisma/client` 7.7.0 / `@prisma/adapter-pg` 7.7.0 / `dotenv` 17.4.2 / `postgres:18-alpine`
  - `docker-compose.yml`: `postgres:18-alpine`、認証 `dejaword/dejaword/dejaword`、`5432:5432` 公開、名前付きボリューム `dejaword_pgdata`、`pg_isready` healthcheck 付
  - `.env.example` を `.gitignore` の `.env*` ブランケットから `!.env.example` で除外してコミット対象化。`.env` はローカル専用（同内容）
  - `prisma/schema.prisma`: モデル未定義。`generator client { provider = "prisma-client", output = "../src/generated/prisma" }` + `datasource db { provider = "postgresql" }`（**Prisma 7 で `datasource.url` は廃止**）
  - `prisma.config.ts`: 先頭で `import "dotenv/config";`、`defineConfig` で `schema` / `migrations.path = "prisma/migrations"` / `datasource.url = process.env["DATABASE_URL"]` を指定
  - `src/lib/prisma.ts`: `PrismaPg({ connectionString: process.env.DATABASE_URL })` を adapter として `PrismaClient` に渡す HMR 安全 singleton。dev のみ `log: ["query","error","warn"]`
  - 生成 Prisma Client は `src/generated/prisma/` 配下。`@/generated/prisma/client` から import。`.gitignore` と `.prettierignore` の双方で除外
  - `package.json` scripts に `db:generate` / `db:migrate` / `db:migrate:deploy` / `db:studio` を追加
  - pnpm 10 のビルドスクリプト承認のため `package.json` に `pnpm.onlyBuiltDependencies: ["@prisma/client", "@prisma/engines", "prisma"]` を追加
  - 計画時点（Prisma 6.x）から実装時に 7.x へ乗り、driver adapter 方式に切り替え（接続文字列がスキーマから完全分離された）
  - 初回マイグレーションは未実行。空スキーマでは無意味なため、M3 で Better Auth モデル投入と同タイミングに `--name init_auth` で切る
- **次セッションへの引き継ぎ**:
  - DB 既定値: user=`dejaword` / password=`dejaword` / db=`dejaword` / port=`5432`、接続 URL は `.env.example` の通り
  - Prisma 7 規約とマイグレーション運用は冒頭の「Prisma / DB 運用ルール」を参照（M3 以降の全セッションで遵守）

## M3: Better Auth 導入

- **目的**: メール＋パスワードで登録・ログイン・ログアウト・セッション維持を成立させる。
- **成果物**:
  - Better Auth インストール（`better-auth` + Prisma アダプタ）
  - Better Auth 用テーブル（user / session / account など）を `schema.prisma` に統合し、初回マイグレーションを `--name init_auth` で切る
  - `src/lib/auth.ts`（サーバ側インスタンス）/ `src/lib/auth-client.ts`（クライアント）
  - `app/api/auth/[...all]/route.ts`（Better Auth のハンドラ）
  - `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` 等の環境変数を `.env` / `.env.example` に反映（同期）
- **M2 から持ち越した DB 周りの仕上げ作業**（モデル登場と同時に意味が出るため M3 で実施）:
  - `src/lib/prisma.ts` 先頭に `import "server-only";` を追加（Client Component への混入を **ビルド時に静的検出**するガード。`pnpm add server-only` も併せて）
  - `package.json` に `"postinstall": "prisma generate"` を追加（生成クライアントは gitignore 対象。clone 直後の `pnpm install` だけで typecheck/build が通る状態を保つため）
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
- **検討事項（宿題として残す）**:
  - GitHub Actions での型チェック / Lint 自走
  - プレビュー環境の DB 分離方針
  - 監視・ロギング
  - 本番 PostgreSQL のメジャーバージョンとローカル 18 の整合（揃わなければ `docker-compose.yml` の image を引き下げ）
  - `PrismaPg` の接続文字列を Prisma Accelerate URL に切り替えるか、直接接続のままにするか
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

**M3: Better Auth 導入** から開始する（M2 は 2026-04-19 に完了）。本計画書を共有したうえで「M3 を実装して」と伝えれば、新しいセッションで詳細設計と実装を進められる。

基盤整備フェーズ（M1〜M5）の完了後に、**別途「単語アプリ機能の全体設計」セッション** を開き、データモデル・重複検知の仕様・拡張性（将来の機能追加）を議論したうえで実装計画を立てる。
