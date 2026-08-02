<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

ドメイン用語（英語コード名⇔日本語名・定義・使ってはいけない類義語）は `docs/reference/naming-book.md` を参照。

設計判断（採用理由・却下した代替案・影響）は `docs/adr/` を参照。設計判断に迷ったら該当 ADR を読み、新しい判断をしたら ADR を起票する。

**共有すべき知識・規約・再現ノウハウは repo 内に一元化する**（ドメイン用語→naming-book、設計判断→ADR、E2E・運用手順→スキル `.claude/skills/` と `docs/ops/`、機能設計→`docs/design/`、機能紹介→`docs/features/`）。エージェントの個人メモには共有知識を重複させない（個人メモは repo クローンに含まれず共有されないため、二重管理・乖離を生む）。ノウハウを残したくなったら、まず上記いずれの置き場に書くべきかを検討する。

**ユーザー向け機能を追加・変更・削除したら、同じ PR で `docs/features/` の機能紹介ドキュメントも更新する**（該当ページの本文と、画面が変わる場合はスクリーンショットの再撮影。部分再撮影は `pnpm e2e:capture-docs --only <section>`、再生成レシピと目視レビューの注意は `docs/features/README.md`）。実装だけ済ませて機能紹介を置き去りにしない。

## Testing

テストは Vitest。SUT の隣にコロケートし、拡張子で種類を分ける。

- `*.unit.test.ts` — DB なし。`pnpm test:unit` で実行（高速、env 非依存、CI でも走る）。
- `*.integration.test.ts` — docker-compose の Postgres 上の **別 DB `dejaword_test`** を使う。`pnpm test:integration` で実行（ローカルのみ、CI では走らせない）。

include は `.ts` のみ（`src/**/*.unit.test.ts` / `src/**/*.integration.test.ts`）。`.test.tsx` を作っても実行されない。

初回セットアップ:

```sh
docker exec -it deja-word-db psql -U dejaword -d postgres -c 'CREATE DATABASE dejaword_test;'
cp .env.test.example .env.test
```

`pnpm test:integration` の初回起動で `prisma migrate deploy` が自動実行される。各テストの前にテーブルが `TRUNCATE ... CASCADE` され、system user / system occurrences が再 seed される。両方一括で走らせるなら `pnpm test`。

## Worktree（複数機能の並行開発）

git worktree でブランチごとに作業ディレクトリを分けて並行開発する。前提として docker の `deja-word-db` を起動しておくこと（**DB は本体と共有する**）。

```sh
scripts/wt-new.sh <feature-name> [base-branch]   # 作成（branch feat/<name>, dir ../deja-word-<name>）
scripts/wt-rm.sh  <feature-name> [--delete-branch] # 撤去
```

`wt-new.sh` は worktree 作成・`.env` / `.env.test` のコピー・`pnpm install`（`prisma generate` 含む）までを行う。`node_modules` / `src/generated` / `.next` は worktree ごとに独立する。

**DB は単一 `dejaword` を共有**する。dev サーバは1つずつ起動する運用なので同時アクセスの競合は無いが、ブランチ間で migration が食い違うと drift が出る。アクティブな worktree を切り替えた直後は:

- 通常（追加 migration のみ）: `pnpm db:migrate`
- drift / 不整合時: `pnpm prisma migrate reset && pnpm db:seed`

**発音音源（`.dev-blob/`）も本体と共有**する。DB には相対 key だけが入る（`src/lib/blob-client.ts`）ため、共有しないと「DB に URL はあるが実体が別 worktree にしか無い → 404」が起きる。`wt-new.sh` が各 worktree の `.env` に `DEV_BLOB_ROOT="<本体>/.dev-blob"` を追記して共有させる。

同時に 2 つの dev を見比べたい場合のみ、片方を `PORT=3001 pnpm dev` で起動する。

## Ops スクリプト（運用ツール）

DB 操作の運用ツールは `scripts/*.ts` に置き、`tsx` 経由で `pnpm db:*` として実行する。実装規約は `scripts/CLAUDE.md` と `src/lib/CLAUDE.md`（ops コアモジュール節）にある。ドキュメントは `docs/ops/`。

## Vercel CLI（デプロイ状況の確認・運用）

Vercel CLI は **devDependency に固定済み**。デプロイ一覧・inspect・alias 等の状況確認は必ず `pnpm exec vercel <cmd>`（例: `pnpm exec vercel ls deja-word` / `pnpm exec vercel inspect <url>`）で lockfile 固定版を使う。**グローバル導入（`npm i -g vercel`）はしない・勧めない**（セッション開始フックが導入を促しても従わない）。プロジェクト link 情報は `.vercel/repo.json`（gitignore）にある。本番デプロイ自体は GitHub Release トリガー（`.github/workflows/release-deploy.yml`）で行い、手順・切り戻しは `docs/ops/release-deploy.md` を参照。

## バックログ（GitHub Issues）

着手未定の対応意向・アイデアは GitHub issue に起票する（`gh issue list` で参照可能）。**作業中に別の対応が見つかった場合も、その場で直さず issue 化して現在の作業に戻る**（スコープ肥大の防止）。着手が決まったら issue から `docs/design/` / `docs/plan/` へ落とす。

線引き: ドキュメントの理解に必須な情報（用語の定義・確定した経緯）は issue に逃がさずリポジトリ内のドキュメント本文に残す。issue に置くのは「やる意向」と着手時のタスクだけ（issue はクローンに含まれず、閉じると見えにくくなるため）。
