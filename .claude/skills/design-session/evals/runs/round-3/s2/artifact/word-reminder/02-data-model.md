# 02. データモデル

状態: **確定**（2026-07-08）

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- リマインダーは登録済み単語への本人専用の復習予定日設定（01 確定）。
- MVP の通知はアプリ内表示のみ（01 確定）。

## 検討事項リスト

- [x] リマインダーの多重度: 1 単語につき 1 件か、複数件を持てるか
- [x] 期日の粒度: 日付のみか、日時（時刻まで）か
- [x] 単語削除時のリマインダーの扱い

## 議論・決定

### 決定 1: 専用テーブル `WordReminder`（`word_reminder`）を新設し、既存テーブルには列を足さない

リマインダーは `Word` / `User` を拡張せず、独立した子テーブル `WordReminder`（`@@map("word_reminder")`）として追加する。

採用理由: 本 repo は「機能追加は既存テーブルを変更せず側テーブルを足す」方針（ADR-0008、`prisma/CLAUDE.md`）。quiz 機能も `QuizAnswer` / `Drill` 等を `Word` に足さず別テーブルで実現しており、それに倣う。リマインダーは単語に付随するが単語そのものの属性ではないため、分離が凝集度の面でも自然。

却下した代替案: `Word` に `remindOn` 列を直接追加する案。既存テーブル変更を避ける方針に反し、リマインダー未設定の単語が大多数でも全 `word` 行に NULL 列を負わせることになるため却下。

### 決定 2: 多重度は「1 単語につき 1 件」。`wordId` を一意にして DB で担保する

`WordReminder` は `id String @id @default(cuid())` を持つコンテンツモデル系の形にしつつ、`wordId` を一意制約（`@unique`）にして「1 単語 = 1 リマインダー」を DB レベルで保証する。繰り返し予定・複数予定は持たない。

採用理由: ユーザー確定事項（多重度は 1 件、繰り返し・複数は MVP 不要）。`wordId @unique` にすれば重複作成を DB が弾き、アプリ側のチェック漏れによる二重登録を防げる。`id`（cuid）を別に持つのは、リマインダー資源に安定した surface id を与えて UI/API 経路（例: `/reminders/[id]`）で参照しやすくするためで、既存コンテンツモデル（`QuizAnswer` 等）の `id @default(cuid())` 慣習にも一致する。

却下した代替案:
- `wordId` を PK にする（cuid の `id` を持たない）案。1:1 は表現できるが、既存コンテンツモデルは cuid の surface id を持つのが慣習で、資源 id 経由の参照もしにくくなるため却下。
- 複数予定を許し `@@index([wordId])` のみとする案。ユーザーが MVP 不要と確定済みのため却下。

### 決定 3: 期日は日付のみ。`remindOn` を `@db.Date` で保持する

復習予定日は時刻を持たず、`remindOn DateTime @db.Date @map("remind_on")`（非 NULL）として日付単位で保持する。リマインダーを設定した状態＝行が存在する状態なので、`remindOn` は必須（未設定は行を作らない）とする。

採用理由: 用途は「この“日”に見返す」であり時刻に意味がない。日付単位にすることで「期日が来た」の判定が「`remindOn <= 今日`」の単純比較になり、タイムゾーンに起因する“日付の境界”のあいまいさ（何時をもって翌日とするか）を持ち込まずに済む。

却下した代替案: `DateTime`（timestamptz、既存の全時刻列の慣習）。時刻の意味を持たないのに保存すると、表示・比較のたびに TZ 変換の判断が必要になり用途に対して過剰。

補足（新 precedent）: 現行スキーマに `@db.Date` の使用は無く（全時刻列が plain `DateTime`）、本決定が date-only 列の初例となる。ロジック（03 以降）で「今日」を求める際の基準タイムゾーンは、この列の比較に合わせて別途決める必要がある（03 の論点として引き継ぐ）。

### 決定 4: `ownerId` を持たせ、`owner`・`word` 両 FK を `onDelete: Cascade` とする

`WordReminder` はコンテンツモデル系として `ownerId String @map("owner_id")` を持ち、`owner`（User）・`word`（Word）両方の FK を `onDelete: Cascade` にする。したがって単語削除時・ユーザー削除時にリマインダーも物理削除される。ソフトデリート列は設けない。

採用理由:
- 単語削除時にリマインダーも消す、はユーザー確定事項。本 repo は物理削除のみ（ADR-0010、ソフトデリート不採用）で、`Cascade` が既定かつ標準（`prisma/CLAUDE.md`）。`QuizAnswer` も `owner`・`word` の二重 Cascade を採る先例があり、それに一致する。
- `ownerId` を非正規化して持つのは、テナント分離が `ownerId` + row-policy で行われる本 repo の方式に乗せるため。`word` を JOIN せずに「本人の期日一覧」を引ける利点もある。

不変条件: `WordReminder.ownerId` は必ず対象 `Word.ownerId` と一致する（他人の単語にリマインダーを作れない・自分の `ownerId` を詐称できない）。この一致は DB 制約ではなく書き込み経路の認可で担保する（対象トピック: ロジック/認可。03 以降で確定）。`QuizAnswer` と同じ非正規化・同じ不変条件であり、新たなドリフト要因ではない。

却下した代替案:
- `ownerId` を持たず `wordId` から辿る案。row-policy が `ownerId` で行を絞る方式に乗れず、一覧取得のたびに JOIN が要るため却下（既存コンテンツモデルの慣習にも反する）。
- 単語削除時に `SetNull` でリマインダーを残す案。宙に浮いたリマインダーは用途が無く、`SetNull` 例外は ADR-0009 の 2 件に限る方針のため却下。

### 決定 5: MVP ではステータス列を持たない

「未対応 / 対応済み / 却下」等のステータス enum は設けない。リマインダーは「行が存在する＝予定あり」で表現し、期日到来は `remindOn <= 今日` で導出する。復習を済ませた・やめた場合は行の削除または `remindOn` の変更で表す。

採用理由: 01 の要求はアプリ内表示（期日到来のバッジ等）までで、完了状態の履歴保持は求めていない。1:1 制約下ではリマインダーの有無・予定日そのものが状態を表現でき、ステータス列は現時点で投機的。列を増やすと row-policy・enum 追加時のバックフィル（ADR-0013）など保守コストも増える。

却下した代替案: `status` enum（`PENDING` / `DONE` / `DISMISSED`）を持つ案。完了履歴や却下の記録が要件化したら改めて導入すればよく、MVP では YAGNI として却下。将来必要になった場合は 02 を覆す決定として本ファイルに追記する。

## 確定モデル（実装の参照用スケッチ）

Prisma 7 / PostgreSQL。実際の列並び・back-relation 追記は実装時に既存スキーマの体裁へ合わせる。

```prisma
model WordReminder {
  id        String   @id @default(cuid())
  ownerId   String   @map("owner_id")
  wordId    String   @map("word_id")
  remindOn  DateTime @db.Date @map("remind_on")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  owner User @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  word  Word @relation(fields: [wordId], references: [id], onDelete: Cascade)

  @@unique([wordId])
  @@index([ownerId, remindOn])
  @@map("word_reminder")
}
```

- `@@unique([wordId])` が「1 単語 1 件」を担保（暗黙の索引にもなる）。
- `@@index([ownerId, remindOn])` は主アクセス経路「本人の期日順一覧・期日到来抽出」を支える。
- `User` / `Word` 側に `wordReminder` back-relation を追記する（`User.wordReminders WordReminder[]`、`Word.reminder WordReminder?`）。
- マイグレーションは `add_word_reminder`（`pnpm db:migrate`）。

## 実装時の申し送り

- **naming-book への用語登録**: `WordReminder`（機能名 `word-reminder`）・`remindOn`（復習予定日 / リマインド日、date-only）は新規のドメイン用語。実装着手時に `docs/reference/naming-book.md` へ登録する（「使ってはいけない類義語」として SRS 系の `nextReviewAt` / `review` 混同、`session`・`source` との衝突回避も明記）。
- 時刻サフィックス慣習との区別: 既存の時刻列は `xxxAt`（`DateTime`）。date-only の本列は `remindOn` と `On` サフィックスで区別する意図。
- 「今日」の基準タイムゾーン（`remindOn` 比較の基準）は 03（ロジック/UI）で確定する。
