# ADR-0018: 読み取り認可は scopedOwnerIds の where 注入

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

コンテンツ系テーブル（[ADR-0006](0006-owner-vs-user-table-families.md)）では、ユーザーは「自分の行 + system 共有行」の両方が見えるべきで、他ユーザーの行は見えてはならない。この読み取りスコープをどの仕組みで強制するかが問題になる。

## 決定内容

読み取りクエリの where 句に **`scopedOwnerIds(userId)`（= `["system", userId]`）を注入**する方式で統一する。`ownerId: userId` 単独で書くと共有マスタが欠けるため誤りである（規約に明記）。

## 採らなかった代替案

- **Postgres RLS（行レベルセキュリティ）** — word-registration リファクタの却下案表で却下（[ADR-0008](0008-side-table-addition.md) と同表）
- **テーブル分離による物理的スコープ** — 同表で却下（検索 UNION 化・コピー陳腐化）

## 影響

- クエリを書くすべての箇所がこの規約に依存する。書き忘れは「他ユーザーのデータが見える」ではなく「共有マスタが見えない」方向に倒れる（`ownerId: userId` 単独の場合）
- 単語登録時の同名重複チェックや system 掲載箇所への自動リンクも scopedOwnerIds 越しに行われる（commit `1d4e0a8`）
- quiz の読み書きもこの方式のみで認可され、row-policy は使わない（[ADR-0019](0019-two-layer-write-authorization.md)）

## 根拠（コード・コミット・文書参照）

- `src/lib/CLAUDE.md` — 「`ownerId: userId` 単独では共有マスタが欠ける」
- where 注入方式の採用（元 design ドキュメントは実装完了に伴い削除）
- `src/lib/system-user.ts` — `scopedOwnerIds` 実装
- RLS 却下の記録（元 refactor ドキュメントは実装完了に伴い削除）
