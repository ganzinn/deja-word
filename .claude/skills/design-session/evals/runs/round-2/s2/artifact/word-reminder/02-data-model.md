# 02. データモデル

状態: **確定**（2026-07-08）

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- リマインダーは登録済み単語への本人専用の復習予定日設定（01 確定）。
- リマインダーは「単語 1 件に対する 1 つの復習予定日」で、本人が設定・変更できる（01 確定）。ライフサイクル状態（reviewed/done/dismissed/snooze/繰り返し）を持たせないことは本トピックの決定 6 で確定。
- MVP の通知はアプリ内表示（一覧上のバッジ等）のみ（01 確定）。

## 検討事項リスト

- [x] リマインダーの多重度: 1 単語につき 1 件か、複数件を持てるか → 決定 2
- [x] 期日の粒度: 日付のみか、日時（時刻まで）か → 決定 3
- [x] 単語削除時のリマインダーの扱い → 決定 5

## 議論・決定

### 決定 1: リマインダーは独立テーブル `Reminder` にする（Word へのカラム追加にしない）

登録済み単語に対する本人専用の復習予定日を、Word とは別の `Reminder` テーブルとして持つ。1 単語 1 件の 1:1 に近い関係だが、Word の nullable カラム（例 `reminderDueOn`）にはしない。

- 採用理由: コンテンツ系テーブルは pass-through セマンティクスを持ち、`ownerId="system"` の共有マスタ単語を**複数ユーザーが共有して閲覧**する。リマインダーは本人専用なので、共有される Word 行のカラムには載せられない（1 行を複数ユーザーの予定日で共有できない）。ユーザーが system 単語に自分の子データを付加する既存の **Memo と同型**であり、同じ形（`ownerId` を持つ子テーブル）で表現するのが規約に沿う。
- 却下した代替案: Word に `reminderDueOn DateTime?` カラムを追加。→ system 共有単語で「誰の予定日か」を表現できず破綻する。個人単語（`ownerId=userId` の Word）に限れば成立するが、system 単語に予定日を付けられない仕様は 01 の「登録済み単語」（system 共有単語を含む）と矛盾する。

### 決定 2: 多重度は「1 ユーザー × 1 単語 = 1 件」。`@@unique([ownerId, wordId])`

1 人のユーザーが 1 つの単語に対して持てるリマインダーは 1 件までとする。DB 制約は `@@unique([ownerId, wordId])`（Word の `@@unique([ownerId, headword])` と同じ所有者内一意の形）。

- 採用理由: 事前指示（繰り返し予定・複数予定は MVP 不要）。01 で間隔反復（自動スケジューリング）を却下済みであり、単一予定に揃うのが整合的。
- ユニークキーを `wordId` 単独でなく `[ownerId, wordId]` にする理由: 同一の system 共有単語に対して、複数ユーザーがそれぞれ自分のリマインダーを持てる必要があるため。`wordId` 単独一意にすると 1 単語に 1 ユーザーしか予定を持てなくなる。
- 却下した代替案: リマインダーを複数件（繰り返し・履歴）持てる 1:N。→ MVP スコープ外。将来必要になれば `@@unique` を外し繰り返し表現用の列を足す拡張余地は残る。

### 決定 3: 期日は日付のみ。`dueOn DateTime @db.Date @map("due_on")`

復習予定日は日付粒度で保持する。Prisma には日付専用型が無いため `DateTime @db.Date`（PostgreSQL の `date` 型にマップ、Prisma 上の型は UTC 深夜の `DateTime`）で表現する。フィールド名は時刻を含まないことを示す `dueOn`（`due_on`）とする。

- 採用理由: 事前指示（時刻までの管理は用途に対して過剰）。日付のみにすることで TZ 変換に伴う「1 日ずれ」の設計面積を最小化する。
- 却下した代替案: `dueAt DateTime`（timestamp）。→ 時刻情報を扱わないのに保持すると、比較・表示で無意味な時刻成分の扱いが必要になり過剰。
- **03 への申し送り（本トピックでは決めない）**: 「期日が到来したか（本日以前か）」の判定は `dueOn` と「今日」の比較で行うが、`date` 値に対する「今日」がどの TZ 基準かはロジックの問題。03 で判定基準の TZ を明示的に定義する。

### 決定 4: 所有・可視性はコンテンツ系規約に従う（`ownerId` + read/write 非対称）

`Reminder` はコンテンツ系テーブルとして `ownerId String @map("owner_id")` と `owner User @relation(..., onDelete: Cascade)`、`@@index([ownerId])` を持つ（設定系の `userId` 主キー方式ではない）。アクセスは既存規約どおり **read は `scopedOwnerIds(userId)`（system + 本人）、write は `ownerId: userId`（本人の行のみ）** の非対称とする。

- 採用理由: リマインダーは Word を参照し「ユーザー×単語で 1 行」のコンテンツ形状で、Memo と同じ所有モデル。[security-design-checklist](../../reference/security-design-checklist.md) の「read/write 非対称の維持」に従う。ただしリマインダーに `ownerId="system"` の共有マスタ行が生まれることは無い（本人が付ける個人データのみ）ので、read で system 行が混ざる余地は実際には無いが、規約統一のため content 系の owner 形状に合わせる。
- 却下した代替案: `userId` 主キーの設定系テーブル方式。→ 設定系は「単語に紐づかない 1 ユーザー 1 行のプリファレンス」であり、単語（`wordId`）に従属する本データとは形状が異なる。

### 決定 5: 単語削除時はカスケード削除。delete-guard の owned-descendant scan に追加する

`word Word @relation(fields: [wordId], references: [id], onDelete: Cascade)`（コンテンツ子テーブルの既定）とし、単語が消えたらリマインダーも DB カスケードで消える。あわせて、`src/lib/words-delete.ts` の「所有子孫テーブルの `ownerId` 走査」に `Reminder` を含め、pass-through 保護の対象に加える。

- 採用理由: 事前指示（リマインダーは単語に付随する情報なので一緒に削除してよい）。カスケードはコンテンツ子テーブルの house default に一致。
- **delete-guard に含める理由（[security-design-checklist](../../reference/security-design-checklist.md) の pass-through セマンティクス）**: 他ユーザー A が system 共有単語に自分のリマインダーを付けている状態で、その system 単語を（別ユーザー B / admin が）削除しようとすると、素の cascade では A の個人データまで消える。既存の `deleteWordForUser` は所有子孫の `ownerId` を走査し、単語所有者以外が所有する子データがあれば削除を block する（`assertWordDeletable`）。この保護を維持するため `Reminder` を 11 番目の被走査テーブルとして追加する。**これはスキーマではなくアプリ実装（03 / 実装フェーズ）への申し送り**。
- 却下した代替案: `onDelete: SetNull` / 削除時にリマインダーを残す。→ リマインダーは単語が無ければ意味を持たない付随情報であり、孤児化させる理由が無い。

### 決定 6: ステータス／ライフサイクル列は持たない（通知はクエリ時に導出）

`Reminder` に done / reviewed / dismissed / snoozed / seen 等の状態列やフラグは持たせない。「期日が到来した」通知（一覧上のバッジ等）は、`dueOn ≤ 今日` をクエリ時に評価して導出する。

- 採用理由: 01 で「復習予定日を設定・変更・削除できる」だけが確定しており、reviewed/done/dismissed/snooze/繰り返しはいずれも要求・スコープに無い。通知は「期日が来たことの表示」であって、既読・完了の永続状態は要求されていない（01: 通知 = 一覧上のバッジ等の表示）。列を持たなければ二重定義・状態遷移の設計面積が生じない。
- 却下した代替案: `status` enum（pending/done/dismissed）や `acknowledgedAt`。→ MVP 要求に無く、導出可能な情報を永続化すると DB と表示の食い違い（未更新の done フラグ等）を招く。将来「復習した」記録が要求化されたら追加する。

### 決定 7: タイムスタンプは `createdAt` + `updatedAt`（Word と同形）

`createdAt DateTime @default(now()) @map("created_at")` と `updatedAt DateTime @updatedAt @map("updated_at")` を持つ。

- 採用理由: リマインダーは**可変**（ユーザーが予定日を変更しうる）content 行であり、`updatedAt` を持つ Word / Drill と同じ扱いが妥当。Memo 等の「タイムスタンプ無し小 child」と違い、更新される点で `updatedAt` の保持に意味がある。
- 却下した代替案: タイムスタンプ無し（Memo に倣う）。→ Memo は本文の付箋で更新頻度の追跡価値が薄いが、リマインダーは日付変更の履歴的手がかりとして `updatedAt` を持たせておく方が運用・デバッグで有用。コストは 2 カラムのみ。

## 確定スキーマ（Prisma スケッチ）

`prisma/schema.prisma` に以下を追加する想定（生成先は `@/generated/prisma/client`）。

```prisma
model Reminder {
  id        String   @id @default(cuid())
  wordId    String   @map("word_id")
  ownerId   String   @map("owner_id")
  dueOn     DateTime @db.Date @map("due_on")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  word  Word @relation(fields: [wordId], references: [id], onDelete: Cascade)
  owner User @relation(fields: [ownerId], references: [id], onDelete: Cascade)

  @@unique([ownerId, wordId])
  @@index([wordId])
  @@index([ownerId])
  @@map("reminder")
}
```

- 併せて `Word` と `User` に逆リレーション `reminders Reminder[]` を追加する。
- ドメイン用語（`Reminder` / リマインダー / `dueOn`）の **naming-book への登録は実装フェーズで行う**（naming-book は実装済みのコード上の語を記録する台帳のため、設計段階では先行登録しない）。設計 docs 内の表記はこのファイルを正とする。

## 実装への申し送り（本トピックの決定に付随するアプリ実装タスク）

スキーマ外だが本データモデルの決定に不可分な実装事項。03 / 実装フェーズで消化する。

- `src/lib/words-delete.ts` の所有子孫テーブル走査に `Reminder` を追加（決定 5）。
- read は `scopedOwnerIds(userId)`、write は `ownerId: userId` を徹底（決定 4）。
- 「期日到来」判定の TZ 基準を定義（決定 3・03 で決める）。
