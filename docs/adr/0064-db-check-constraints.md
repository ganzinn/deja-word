# ADR-0064: 数値不変条件を DB CHECK 制約でも強制する（raw SQL migration の規約化）

- ステータス: 提案
- 確信度: 低
- 起票日: 2026-07-04

> **注意**: 本 ADR は 2026-07-04 実施のコード監査からの**改善提案**であり、実装済みの決定の事後推定ではない。
> レビューを経て決定し、ステータスを更新すること。

## 背景

制限時間（1..60 秒）・drill 残数（1..9）・`occurrenceNumber >= 1` などの数値不変条件は、`prisma/schema.prisma` のコメントと `src/lib/schema/` の zod でのみ表明されており、migration 全 36 件に CHECK 制約は無い。

一方このリポジトリには **zod を通らない書き込み経路が公式に存在する**（`scripts/*.ts` の ops ツール群、migration 内の backfill SQL）。ops スクリプトや backfill のバグで範囲外値が入っても DB は受理し、drill の残数遷移や quiz タイマーの誤動作として初めて表面化する。不変条件の真実源がコメントになっている。

## 決定内容

（提案）次を規約化する:

- 数値不変条件のうち壊れると実行時誤動作に直結するもの（`timeoutSeconds` 1..60、`remaining` 0..9、`resetRemaining` / `vagueRemaining` / `initialCorrectRemaining` 1..9、`occurrenceNumber >= 1`、`rangeFrom <= rangeTo` 等）へ CHECK 制約を追加する
- Prisma が表現できない制約は `prisma migrate dev --create-only` で raw ALTER TABLE を手書きする（raw SQL migration の前例: `20260704025822_backfill_tg_format_default_timeouts`）
- 適用前に既存データの違反有無を SELECT で確認する

## 採らなかった代替案

- **zod のみ（現状維持）** — zod を通らない経路が公式に存在する以上、防御になっていない
- **ops コアに共有アサーション関数を追加** — 経路ごとの呼び忘れが残り、backfill SQL には効かない

## 影響

- migration が増え、以後のスキーマ変更で CHECK との整合を意識する必要がある
- `prisma migrate diff` / drift 検出と手書き制約の相性（worktree 運用の drift 対応手順への影響）を確認する必要がある

## 根拠（コード・コミット・文書参照）

- `prisma/schema.prisma:421,446,467`（コメントのみの範囲表明）
- `src/lib/schema/quiz.ts:29`（zod 側の範囲強制）
- `src/lib/CLAUDE.md` ops コア節・ADR-0052（zod を通らない書き込み経路の存在）

## 人間への確認質問

- Prisma 非対応の制約を raw migration で持つ運用（drift 検出との折り合い）を許容するか？
- 対象カラムはどこまで広げるか（上記列挙で過不足ないか）？
