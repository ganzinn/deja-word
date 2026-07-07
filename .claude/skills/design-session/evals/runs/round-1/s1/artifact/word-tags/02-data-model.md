# 02. データモデル（Tag / WordTag）

状態: **未着手**

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

（依存する決定が確定したら、ここに 1 行ずつ再掲する。特に 01 の「タグの所有単位」「タグ付け対象（本人単語のみか system 共有語も含むか）」「改名・削除の要否」がスキーマ形状を左右する。）

参考: 既存スキーマの手本は Word（`ownerId` 所有・`@@unique([ownerId, headword])`）と、語×掲載箇所の多対多を表す中間テーブル `WordOccurrence`（`@@unique([wordId, occurrenceId])`）。所有・カスケードの規約は `prisma/CLAUDE.md`。

## 検討事項リスト

- [ ] `Tag` モデル: フィールド（`id` / `ownerId`（`userId` 所有）/ `name` / タイムスタンプ）。ユーザー内一意 `@@unique([ownerId, name])`・`@@index([ownerId])`
- [ ] `WordTag` 中間テーブル（語×タグの多対多）: `wordId` / `tagId`・`@@unique([wordId, tagId])`。非正規化 `ownerId` を持たせるか（Word 子テーブルの規約に合わせるか）
- [ ] User / Word とのリレーション追加（`User.tags` / `Word.wordTags` 等）
- [ ] カスケード削除: 単語削除時（`WordTag` を落とす）・タグ削除時（`WordTag` を落とす）・ユーザー削除時（`onDelete: Cascade`）の各方向
- [ ] `name` の一意スコープと正規化の関係（大小文字を区別するか。正規化ルール本体は 03、ここでは一意制約が何に効くかを確定）
- [ ] system 共有単語にタグ付けする場合（01 の結論次第）の `WordTag.ownerId` の意味と一意制約への影響
- [ ] マイグレーションは加算 1 回で済むか（既存テーブルはリレーションフィールド追加のみで無変更か）
- [ ] Prisma 型 / enum の import 元規約（`@/generated/prisma/client` 等、`src/CLAUDE.md`）への準拠

## 議論・決定

（未着手。採用理由と却下した代替案もここに残す。見出しは「決定 N: タイトル」形式で番号を振る。）
