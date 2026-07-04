# ADR-0012: note 単一カラム → *Note 子テーブル化

- ステータス: 提案
- 確信度: 中
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

Meaning / Example / RelatedWord はそれぞれ単一の `note` カラムを持っていたが、1 行では足りず複数のノートを付けたい要求が生じた。

## 決定内容

単一 `note` カラムを廃止し、**MeaningNote / ExampleNote / RelatedWordNote の子テーブル**（1 ノート = 1 行）に置き換える。

## 採らなかった代替案

- `note` カラムを text にして改行区切りで複数行を持つ —（推定）行単位の編集・並び順管理がしにくいため子テーブル化したと考えられる。比較検討の記録は無い
- 配列カラム（text[]）—（推定）Prisma / フォーム連携の扱いやすさで子テーブルに劣る。記録は無い

## 影響

- side table 加算方針（[ADR-0008](0008-side-table-addition.md)）の適用例になっている（既存テーブルへのカラム変更ではなく子テーブル追加 + 旧カラム削除）
- 単語書き込み handler に note 系の子エンティティ処理が加わっている（`src/lib/words/handlers/note-children.ts`）

## 根拠（コード・コミット・文書参照）

- `prisma/migrations/20260614100000_add_note_child_tables/`
- `prisma/schema.prisma` — MeaningNote / ExampleNote / RelatedWordNote モデル
- `src/lib/words/handlers/note-children.ts`
