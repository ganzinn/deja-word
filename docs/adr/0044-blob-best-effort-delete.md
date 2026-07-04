# ADR-0044: 音源更新は put → update → del の順、削除はベストエフォート（DB が真実源）

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

Blob（音源ファイル）は DB の `onDelete: Cascade` の外にあり、DB と Blob の 2 システム間で原子的な更新ができない。更新・削除の途中で失敗した場合にどちらへ倒すかを決める必要があった。

## 決定内容

- **DB を真実源とする**。不整合は「DB から参照されない孤児 Blob が残る」方向にのみ倒し、「DB が消えた Blob を指す」状態を作らない
- 音源差し替えは **put（新規保存）→ update（DB 更新）→ del（旧削除）** の順序とする
- Blob 削除は**ベストエフォート**（`bestEffortDeleteAudioUrls`）。失敗しても処理は成功扱いとし、孤児は ops の purge で回収する（`pnpm db:purge-blobs` / `db:purge-occurrence`）
- 本番 DB リセットでは **Blob 削除 → TRUNCATE の順序を固定**する。逆順だと参照が消えて孤児 Blob を特定できなくなる（ops 文書に「手順 2 → 3 の順序は固定」と明記）

## 採らなかった代替案

- Blob 側を真実源にする / 2 相コミット的な整合 —（推定）参照切れ（404）はユーザー影響が直接あるのに対し孤児はストレージコストだけであり、単純な順序規約で十分と判断されたと考えられる。明示的な比較記録は無いが、順序と真実源の規約自体は文書化されている

## 影響

- 音源を扱うすべての書き込み（登録・差し替え・削除、単語削除の後始末）がこの順序規約に従う必要がある
- 孤児 Blob は定期的な purge 運用の前提になっている（`migrate reset` 前の `db:purge-blobs` 実行など）

## 根拠（コード・コミット・文書参照）

- `docs/reference/naming-book.md` — AudioTarget 更新順序（put → update → old-del）の記載
- `docs/ops/reset-prod-db.md` — 「Blob 削除 → TRUNCATE」の順序固定と理由
- `docs/ops/purge-occurrence.md` — 「Blob は cascade 外のため手動削除（ベストエフォート）」
- `src/lib/blob-client-impl.ts` — `del` が他 driver 由来 URL を無視する実装
