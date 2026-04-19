# deja-word

学習の中で出会った英単語を記録し、「一度忘れていた」という気づきを通じて定着を支援する英単語学習Webアプリです。

リポジトリ名は _déjà vu_ + _word_ に由来し、「再会した単語で既視感を得る」体験をコンセプトにしています。

## 特徴

- 学習中に出会った単語をその場で記録できます。
- 同じ単語を再度登録しようとすると、「〇月〇日に既に登録済みです」という警告とともに前回登録時のメモを表示します。
- 「自分はこの単語を忘れていた」という自覚を促すことで、記憶の定着を支援します。

## 技術スタック

- フロント / バックエンド: Next.js 16（App Router）+ TypeScript
- UI: Tailwind CSS v4（CSS ベース設定）
- DB: PostgreSQL（ローカルは Docker Compose）
- ORM: Prisma 7（driver adapter 方式、`@prisma/adapter-pg`）
- 認証: Better Auth（メール + パスワード）
- パッケージマネージャー: pnpm
- ランタイム管理: mise（Node / pnpm を exact pin）
- デプロイ先: Vercel

詳細な実装計画は [`docs/plan/foundation-milestones.md`](./docs/plan/foundation-milestones.md) を参照してください。

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
