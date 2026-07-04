# ADR-0056: テストは拡張子で unit / integration を分割し、専用 DB で truncate + reseed

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

DB を使うテストと使わないテストは、速度・環境要件（Postgres・env）・実行場面（CI か否か）が大きく異なる。両者を同じ設定で走らせると、速いテストまで DB 起動に引きずられる。

## 決定内容

- テストは Vitest で **SUT の隣にコロケート**し、**拡張子で種類を分ける**:
  - `*.unit.test.ts` — DB なし。`pnpm test:unit`（高速・env 非依存）
  - `*.integration.test.ts` — docker-compose Postgres 上の**専用 DB `dejaword_test`** を使う。`pnpm test:integration`
- include は `.ts` のみで、`.test.tsx` を作っても実行されない（規約として明記）
- integration は `fileParallelism: false` で直列実行。global setup が `DATABASE_URL` に `dejaword_test` が含まれることを検証してから `prisma migrate deploy` を 1 回実行（本体 DB の誤破壊を防ぐガード）
- **各テストの前に全テーブルを `TRUNCATE ... CASCADE` し、system user / system 掲載箇所を再 seed** する（テスト間の独立性を DB リセットで担保）
- `server-only` モジュールは `vi.mock("server-only")`（unit / integration 両 setup）で unit テスト可能にする

## 採らなかった代替案

- ディレクトリ分割（`tests/unit/` 等）による分類 —（推定）SUT との距離が離れるためコロケーション + 拡張子分類を選んだと考えられる。比較の記録は無い
- トランザクションロールバック方式のテスト分離 —（推定）`$transaction` を使う SUT と入れ子になるため truncate 方式を選んだと考えられる。記録は無い

## 影響

- テストの追加先はファイル名だけで決まり、実行環境（CI 可否含む、[ADR-0057](0057-integration-tests-not-in-ci.md)）も拡張子から自明
- `.tsx` のテストは黙って実行されないため、コンポーネントテストを導入する場合は include の変更が必要

## 根拠（コード・コミット・文書参照）

- `AGENTS.md` Testing 節 — 拡張子分割・専用 DB・truncate/reseed の規約
- `vitest.config.mts` — unit / integration の 2 プロジェクト定義
- `tests/setup/integration.global-setup.ts` — dejaword_test ガードと migrate deploy
- `tests/setup/integration.setup.ts` / `tests/setup/db.ts` / `tests/setup/fixtures.ts`
