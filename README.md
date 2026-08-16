# DejaWord

学習の中で出会った英単語を記録し、「一度忘れていた」という気づきを通じて定着を支援する英単語学習Webアプリです。

リポジトリ名は _déjà vu_ + _word_ に由来し、「再会した単語で既視感を得る」体験をコンセプトにしています。

## 特徴

- **出会った単語をその場で記録** — 必須は単語（見出し語）だけ。意味・訳語・例文・関連語・メモ・掲載箇所（単語帳や教材）は必要な分だけ足せます。
- **重複登録の警告で「忘れていた」に気づく** — すでに登録済みの単語を入力すると警告と既存の単語への「詳細」リンクが出ます。登録自体は妨げないので、前回の記録を開いて追記することも、別の掲載箇所として登録することもできます。
- **掲載箇所と掲載番号で範囲を決める単語テスト** — 英語→日本語・日本語→英語の 10 種類の出題形式から選び、出題数や 1 問ごとの制限時間も指定できます。
- **定着モードで覚え直す** — テストで間違えた単語を、決めた回数だけ連続正解して「定着」するまでラウンド形式で繰り返し出題します。
- **ブックマークで苦手をまとめる** — 苦手な単語に印を付け、単語一覧や単語テストで「ブックマークのみ」に絞り込めます。
- **発音を聞ける** — 意味・関連語・例文に発音音源（mp3）を登録して再生できます。未登録の単語も、設定で端末内蔵の自動音声（TTS）による代替再生を有効にできます。
- **AI による入力補助** — AI Gateway が利用できる環境では、意味・発音記号・熟語・例文の下書きを AI が生成します（空欄にのみ反映され、手入力は上書きしません）。

## 機能紹介

単語管理・単語テスト・定着モードなど、各機能の説明とスクリーンショットは
[`docs/features/`](./docs/features/README.md) を参照してください。

![ログイン後のメニュー画面](./docs/features/images/menu.png)

## 技術スタック

- フロント / バックエンド: Next.js 16（App Router）+ TypeScript
- UI: Tailwind CSS v4（CSS ベース設定）+ shadcn/ui（Base UI）
- DB: PostgreSQL（ローカルは Docker Compose）
- ORM: Prisma 7（driver adapter 方式、`@prisma/adapter-pg`）
- 認証: Better Auth（メール + パスワード）
- 発音音源の保管: Vercel Blob（ローカルはディスク driver）
- AI: AI SDK + Vercel AI Gateway（単語の下書き生成。未設定なら機能ごと非表示）
- パッケージマネージャー: pnpm
- ランタイム管理: mise（Node / pnpm を exact pin）
- デプロイ先: Vercel（production は「Create Release」ワークフローの実行で自動デプロイ。詳細は [`docs/ops/release-deploy.md`](./docs/ops/release-deploy.md)）

## セットアップ

前提として、[mise](https://mise.jdx.dev/)・Docker・pnpm が利用できる環境を想定しています。

1. `.env` を作成し、`BETTER_AUTH_SECRET` に `openssl rand -base64 32` の出力値を設定します。

   ```bash
   cp .env.example .env
   ```

2. PostgreSQL を起動します。

   ```bash
   docker compose up -d
   ```

3. Node / pnpm のバージョンを固定します（初回のみ）。

   ```bash
   mise install
   ```

4. 依存関係をインストールし、初回マイグレーションを適用します。

   ```bash
   pnpm install
   pnpm db:migrate
   ```

5. 開発サーバーを起動します。

   ```bash
   pnpm dev
   ```

   <http://localhost:3000> にアクセスして動作を確認してください。

## ライセンス

本プロジェクトは [MIT License](./LICENSE) のもとで公開しています。
