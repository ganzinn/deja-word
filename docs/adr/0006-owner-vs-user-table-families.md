# ADR-0006: コンテンツ系 ownerId / 設定系 userId のテーブル2ファミリー

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

このアプリでは、system ユーザーが所有する共有マスタ（ターゲット1900 等の単語データ）と、各ユーザーが自分で登録するデータが同じテーブルに同居する。一方、ユーザーごとの設定にはこの共有の概念が無い。両者を同じ設計で扱うと所有・共有のセマンティクスが混乱する。

## 決定内容

テーブルを 2 つのファミリーに分け、新規テーブルはまずどちらに属するかを決める:

- **コンテンツ系**（Word ファミリー、Occurrence、Drill ファミリー、QuizAnswer 等）: `ownerId` を持ち、`"system"` 行が全ユーザー共有のマスタになる
- **設定系**（UserPreference、QuizDefaultSetting、QuizDefaultTimeout、OccurrencePresetSetting 等）: `userId` をキーにし、`ownerId` は持たない（共有の概念が無い）

## 採らなかった代替案

- 全テーブルを単一の所有者カラムで統一する —（推定）設定系に「system 行 = 共有」のセマンティクスを持ち込むと誤って共有スコープで読まれる危険があるため分離したと考えられる。明示的な比較記録は無いが、命名規約として naming-book に確定記載がある

## 影響

- 読み取りスコープの規約が分かれる: コンテンツ系は `scopedOwnerIds(userId)`（[ADR-0018](0018-scoped-owner-ids-read-scope.md)）、設定系は `userId` 単独
- 新規テーブル追加時の最初の設計判断が「どちらのファミリーか」になる（`prisma/CLAUDE.md`）

## 根拠（コード・コミット・文書参照）

- `prisma/CLAUDE.md` — owner モデルの規約（コンテンツ系 `ownerId` + system 行 / 設定系 `userId`）
- `docs/reference/naming-book.md` — owner vs user の命名区別（確定事項）
- `prisma/schema.prisma` — 各モデルの実態（コンテンツ系は `ownerId` FK、設定系は `userId`）
