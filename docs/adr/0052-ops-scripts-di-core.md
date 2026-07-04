# ADR-0052: Ops スクリプトは tsx + DI コア（server-only 非依存）+ dry-run 既定 + DIRECT_URL 優先

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

DB 操作の運用ツール（インポート・purge・リセット等）を Next.js アプリの外から実行したい。しかし tsx 実行では `import "server-only"` と `@/` の runtime import が解決できず、アプリのサービス関数や `@/lib/prisma` をそのまま再利用できない。

## 決定内容

- 運用ツールは `scripts/*.ts` に置き、**tsx 経由で `pnpm db:*`** として実行する
- コアロジックは `src/lib/` に **DI 対応モジュール**（server-only なし、prisma / blob を引数注入、`@/` は `import type` のみ）として置き、スクリプトから相対 import する。スクリプト本体は CSV 読み込み・引数解釈・対話・レポート整形だけを持つ
- スクリプトは `PrismaClient` を `../src/generated/prisma/client` + `@prisma/adapter-pg` から組み立てて注入する。接続文字列は **`DIRECT_URL → DATABASE_URL_UNPOOLED → DATABASE_URL`** の順で解決（`$transaction` のため direct 接続優先。pooled の PgBouncer transaction モードではインタラクティブ Tx に問題が出ることがある、と文書化）
- **dry-run が既定で、書き込みは `--execute` 指定時のみ**。引数なしのときは `node:readline/promises` の対話モード（`stdin.isTTY` で分岐）

## 採らなかった代替案

- アプリのサービス関数（UseCase）をスクリプトから直接 import — tsx で `server-only` / `@/` runtime import が解決できないため不可（規約に理由明記）
- 管理用の Web UI / API を作る —（推定）対象が管理者 1 人の運用作業であり、CLI + dry-run の方が安全・低コストのため。比較の記録は無い

## 影響

- `occurrence-purge.ts` / `bulk-word-import.ts` 等の「ops コア」モジュールが `src/lib/` に増える。これらは server-only を付けられないため、誤ってクライアントから import しない注意が要る
- `src/lib/prisma-errors.ts` は `@/generated` を runtime import しているため ops コアからは使えない（既知の制約として規約に記載）
- 破壊的操作（purge / reset）が dry-run 既定で守られている

## 根拠（コード・コミット・文書参照）

- `scripts/CLAUDE.md` — 本規約の明文化
- `src/lib/CLAUDE.md` — ops コアモジュール節
- commit `b341b6a` "feat(ops): 掲載箇所＋単語＋意味を CSV から一括登録する import-words を追加"（PR #54、DI コア方針の初出）
- `scripts/purge-occurrence.ts` — 模範実装
- `docs/ops/purge-occurrence.md` — 接続・dry-run の運用記録
