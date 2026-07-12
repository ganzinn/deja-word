# 02. schema

状態: **完了（2026-06-13）**　PR: https://github.com/ganzinn/deja-word/pull/13

## 目的

quiz / drill の永続化スキーマ（QuizAnswer / Drill / DrillWord ＋ enum 3 つ）を side table として加算し、マイグレーションを一括 1 回で適用する。あわせてユニットテスト基盤（tx-mock）に新テーブルの delegate を追加する。

スコープ外:

- fixture 追加（チケット 04）・シード付き PRNG ヘルパ（チケット 03）
- 新テーブルを使う UseCase・クエリ（チケット 04 以降）

## 依存チケット

なし（並行着手可）

## 前提（設計決定の再掲）

- 既存テーブルは無変更。以下を side table として加算する。マイグレーションは一括 1 回（[02-data-model.md](../../design/word-quiz/02-data-model.md) 「追加スキーマ」）:

```prisma
enum QuizFormat {
  CHOICE        // 形式1: 四択
  SELF_JUDGE    // 形式2: 自己判定
  MULTI_MEANING // 形式3: 多義語選択
  // 将来: SPELLING(形式4), SELF_JUDGE_JA_EN(形式5) を値追加で対応
}

enum QuizResult {
  CORRECT
  INCORRECT
  GAVE_UP // 四択・多義語選択の「わからない」、自己判定の「思い浮かばなかった」。drill の残数計算上は INCORRECT と同じ扱い（03 で3形式に拡張）
}

enum QuizMode {
  TEST  // 通常テスト
  DRILL // 定着モード
}

// 解答履歴: 1解答=1行。通常テストも drill も同形で保存
model QuizAnswer {
  id        String     @id @default(cuid())
  ownerId   String     @map("owner_id")
  wordId    String     @map("word_id")
  mode      QuizMode
  format    QuizFormat
  result    QuizResult
  createdAt DateTime   @default(now()) @map("created_at")

  owner User @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  word  Word @relation(fields: [wordId], references: [id], onDelete: Cascade)

  @@index([ownerId, wordId])
  @@index([wordId])
  @@map("quiz_answer")
}

// 定着待ちプール: 元テスト1回から生成、複数並存可
model Drill {
  id           String    @id @default(cuid())
  ownerId      String    @map("owner_id")
  occurrenceId String    @map("occurrence_id")
  rangeFrom    Int       @map("range_from")
  rangeTo      Int       @map("range_to")
  format       QuizFormat // 元テストの出題形式。全ラウンドで引き継ぐ（06 確定）
  roundCount   Int       @default(0) @map("round_count") // 完了したラウンド数。ラウンド送信の冪等化（CAS）に使う（05 確定）
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")
  completedAt  DateTime? @map("completed_at") // 全単語定着時に設定。進行中一覧は completedAt IS NULL

  owner      User       @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  occurrence Occurrence @relation(fields: [occurrenceId], references: [id], onDelete: Cascade)
  words      DrillWord[]

  @@index([ownerId])
  @@index([occurrenceId])
  @@map("drill")
}

// drill 内の単語ごとの残数
model DrillWord {
  drillId   String   @map("drill_id")
  wordId    String   @map("word_id")
  remaining Int      // 定着までの残連続正解数 (0..3)。初期値: 元テスト誤答=3 / 正答=1
  updatedAt DateTime @updatedAt @map("updated_at")

  drill Drill @relation(fields: [drillId], references: [id], onDelete: Cascade)
  word  Word  @relation(fields: [wordId], references: [id], onDelete: Cascade)

  @@id([drillId, wordId])
  @@index([wordId])
  @@map("drill_word")
}
```

- User / Word / Occurrence 側には対応するリレーションフィールド（`quizAnswers` / `drills` / `drillWords`）を追加する。リレーション定義のみで列は増えない＝「既存テーブル無変更」の方針に抵触しない（[02-data-model.md](../../design/word-quiz/02-data-model.md) 「追加スキーマ」の注記）
- `tests/setup/tx-mock.ts` に quizAnswer / drill / drillWord の delegate を追加して quiz の handler unit test に流用する（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 9）

## 実装内容

### 変更: `prisma/schema.prisma`

上記の enum 3 つ・model 3 つをそのまま追加し、User / Word / Occurrence に `quizAnswers QuizAnswer[]`・`drills Drill[]`（User / Occurrence）・`drillWords DrillWord[]`（Word）等の対応リレーションフィールドを追加する。既存モデルの列・制約は変更しない。

### 作成: `prisma/migrations/<timestamp>_add_quiz_tables/`

`pnpm prisma migrate dev --name add_quiz_tables` で一括 1 回生成する。

### 変更: `tests/setup/tx-mock.ts`

既存 delegate（meaning / example / ...）と同じ形で `quizAnswer` / `drill` / `drillWord` の 3 delegate を追加する（`vi.fn().mockResolvedValue(...)` 初期化の既存パターンに合わせる）。

## 完了条件（Definition of Done）

- [ ] `pnpm prisma migrate dev` がローカル DB（dejaword / dejaword_test）に適用できる
- [ ] 既存の `pnpm test:unit` / `pnpm test:integration` がすべて通る（既存テーブル無変更の確認）
- [ ] `pnpm lint` / `pnpm typecheck` が通る

## 競合注意

- `tests/setup/tx-mock.ts`: 本チケットで 3 delegate を一括追加し、以降のチケットでは触らない

## 実装メモ

- マイグレーション `20260612152405_add_quiz_tables` を一括 1 回生成（CREATE TYPE / CREATE TABLE / CREATE INDEX / ADD FOREIGN KEY のみ、既存テーブルへの ALTER なし）。ローカル DB dejaword（migrate dev）・dejaword_test（migrate deploy）の両方へ適用済み。
- スキーマ定義はチケット記載どおり。チケット内コメントのチケット間参照表記（「(03 で3形式に拡張)」等）はスキーマコメントから省いた（定義内容は同一）。
- `tests/setup/tx-mock.ts` に quizAnswer / drill / drillWord の 3 delegate を既存 `delegate()` ファクトリパターンで追加。
