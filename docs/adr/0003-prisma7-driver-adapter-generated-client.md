# ADR-0003: Prisma 7 + driver adapter、client 生成先は src/generated

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

DB 基盤（M2）で ORM を導入する際、Prisma 7 を採用した。Prisma 7 は driver adapter が必須であり、client の生成方式も従来（`node_modules` 内生成）から変わっている。

## 決定内容

- Prisma 7 + `@prisma/adapter-pg`（driver adapter）+ `prisma.config.ts` 構成を採用する
- client は `prisma-client` provider で **`src/generated/prisma` に生成**する。型・値は `@/generated/prisma/client`、enum は `@/generated/prisma/enums` から import する（`@prisma/client` からの import は動かない）
- 接続文字列は `DIRECT_URL → DATABASE_URL_UNPOOLED → DATABASE_URL` の順で解決する（`$transaction` のため direct 接続を優先）

## 採らなかった代替案

- 従来型の `@prisma/client` 生成 — Prisma 7 では driver adapter・新 generator が前提のため選択肢にならなかった（commit `8db386d` に「Prisma 7 は driver adapter 必須のため」と明記）

## 影響

- driver adapter 構成では P2002 等のエラー meta が `target` ではなく **modelName 形式**になる。重複判定は `src/lib/prisma-errors.ts` の `isUniqueConstraintOn(e, "Model")` に集約されている（`src/lib/CLAUDE.md`）
- `prisma migrate reset` は seed を自動実行しない（`--skip-seed` も廃止）。reset 後は `pnpm db:seed` が必須（commit `458de70`、`prisma/CLAUDE.md`）
- 生成物が `src/` 配下にあるため、tsx 実行の ops スクリプトから相対 import で client を組み立てられる（[ADR-0052](0052-ops-scripts-di-core.md)）

## 根拠（コード・コミット・文書参照）

- commit `8db386d` "M2: DB 基盤を実装" — 採用理由「Prisma 7 は driver adapter 必須のため」
- `prisma/schema.prisma` — generator の output 指定
- `prisma.config.ts` — schema / migrations / seed 設定
- `src/CLAUDE.md`・`prisma/CLAUDE.md` — import 規約と reset/seed 注意
- commit `458de70` "docs(ops): reset 後に db:seed が必要な点を明記"
