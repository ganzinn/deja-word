# ADR-0015: UseCase がトランザクションを所有し、handler は tx を受け取る

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

単語の書き込みは複数エンティティ（Meaning / Example / RelatedWord / Memo / WordOccurrence / Note 群）にまたがるため、原子性の境界をどの層に置くかを決める必要があった。

## 決定内容

- **UseCase が `prisma.$transaction` を張る**。トランザクション境界 = ユースケースの原子性の単位
- **handler は受け取った `tx` を使う**だけで、自分でトランザクションを開かない。handler のシグネチャは `(tx, ctx, rows, opts)`（words）/ `(tx, userId, ...)`（quiz）

## 採らなかった代替案

- handler ごとの個別トランザクション —（推定）エンティティ横断の原子性が失われるため。リファクタ Phase 3（commit `f6fcd52`）でトランザクション境界が UseCase へ移動された経緯が残るが、比較の明示的記録は無い

## 影響

- handler は tx 前提の純粋な書き込み単位になり、unit テストでは `tests/setup/tx-mock.ts` の in-memory tx モックで DB なしにテストできる
- ops スクリプトが direct 接続（`DIRECT_URL` 優先）を要するのは `$transaction` を使うため（[ADR-0052](0052-ops-scripts-di-core.md)）
- words の子エンティティ書き込み順序は旧実装と同一に保つ契約があり、「並べ替え・並列化をしない」と明記されている（`src/lib/words/CLAUDE.md`）

## 根拠（コード・コミット・文書参照）

- `src/lib/CLAUDE.md` — 「UseCase が `prisma.$transaction` を張り、handler は受け取った `tx` を使う」
- commit `f6fcd52` "words-children.ts を 5 つの entity handler に分割"（Phase 3、tx 境界の移動）
- `src/lib/words/handlers/shared.ts` — Tx 型定義
- quiz でも同じ前提を踏襲（元 design ドキュメントは実装完了に伴い削除。本 ADR が一次情報）
