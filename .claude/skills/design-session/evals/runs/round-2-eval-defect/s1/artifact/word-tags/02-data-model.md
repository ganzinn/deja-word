# 02. データモデル

状態: **未着手**

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

（依存する決定が確定したら、ここに 1 行ずつ再掲する。形式: 「- {依存する決定の要約}（{NN} 確定）。」）

参考（確定ではなく既存コード規約。詳細は 05 で扱う）:
- コンテンツ系テーブルは全行が `ownerId` を持ち、`ownerId == "system"` が全ユーザー共有マスタ（`src/lib/system-user.ts`）。
- 既存の子テーブル・中間テーブルの手本: `WordOccurrence`（`@@unique([wordId, occurrenceId])`）、子行は `ownerId` + `@@index([ownerId])` + `@@map` snake_case、`onDelete: Cascade` が既定（`prisma/schema.prisma`）。
- 既存テーブルは変更せず side table 加算で拡張する規約（`prisma/CLAUDE.md`）。

## 検討事項リスト

- [ ] `Tag` テーブルの構造（`id` / `ownerId` / `name` / `createdAt` / `updatedAt`）と一意制約（`@@unique([ownerId, name])` でユーザー内一意）
- [ ] 単語×タグの中間テーブル `WordTag`（`wordId` / `tagId` / `ownerId`、`@@unique([wordId, tagId])`）の形と複合主キーの要否
- [ ] system 共有マスタ単語に本人タグを付ける場合の所有構図（親 `Word` = system・`WordTag` = 本人 owner）と孤児防止（01 で「system 単語にも付与可」と決めた場合のみ）
- [ ] `onDelete` 挙動（`Word` 削除 → `WordTag` cascade、`Tag` 削除 → `WordTag` cascade、`Occurrence` は無関係）
- [ ] タグ名の格納形（正規化後の値を保存するか。正規化ルール自体は 03 の管轄）
- [ ] 既存テーブルへの影響範囲（`Word` / `User` にリレーションフィールドのみ追加、本文は無変更で済むか）

## 議論・決定

（未着手。採用理由と却下した代替案もここに残す。見出しは「決定 N: タイトル」形式で番号を振る。）
