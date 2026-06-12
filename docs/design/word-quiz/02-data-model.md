# 02. データモデル

状態: **確定**（2026-06-12。同日 05 の決定を受けて `Drill.roundCount` を加算改訂）

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- 機能名は quiz。
- 既存テーブル（Word / Meaning / Occurrence 等）は変更せず、side table 加算で対応する（`docs/refactor/word-registration.md` の将来方針）。
- 既存スキーマの規約: cuid() ID / snake_case `@map` / 全行 `ownerId` / FK に `@@index` / `onDelete: Cascade` / enum は大文字（`prisma/schema.prisma` で確認済み）。
- 単語ごとの解答履歴（正誤・日時・出題形式）を永続化する。通常テストは終了時、drill は各ラウンド終了時に一括送信（01・06 確定）。
- drill は日をまたいで再開可能。単語ごとの残数（卒業までの残連続正解数）を永続化する（06 確定）。
- drill の解答は mode 区分で通常テストと区別する（06 確定）。
- 復習スケジュール属性（SRS の easeFactor / nextReviewAt 等）は MVP 不要。ただし将来拡張を阻まないこと（01 確定）。
- StudySet（任意セット編成）はスコープ外（01 確定）。
- 中断したテスト／ラウンドは破棄し、解答済み分も履歴に残さない（01・06 確定）。
- 結果画面の「自分の回答」表示は直後のみで、履歴に選択内容は残さない（01 確定）。

## 検討事項リスト

- [x] 解答履歴テーブルの粒度 → 1解答=1行。テストセッションテーブルは持たない
- [x] 解答行の属性設計 → mode / format / result / createdAt。「わからない」は GAVE_UP として区別
- [x] drill 由来の解答の区別 → mode 列（TEST / DRILL）
- [x] 履歴の紐づけ先 → Word（owner は解答したユーザー）
- [x] Word 削除時の履歴の扱い → Cascade で削除
- [x] 出題形式の表現 → Prisma enum（将来形式は値追加）
- [x] マイグレーション方針 → 一括1回

## 議論・決定

### 追加スキーマ（確定 2026-06-12）

既存テーブルは無変更。以下を side table として加算する。マイグレーションは一括1回。

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
  roundCount   Int       @default(0) @map("round_count") // 完了したラウンド数。ラウンド送信の冪等化（CAS）に使う（05 確定）
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")
  completedAt  DateTime? @map("completed_at") // 全単語卒業時に設定。進行中一覧は completedAt IS NULL

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
  remaining Int      // 卒業までの残連続正解数 (0..3)。初期値: 元テスト誤答=3 / 正答=1
  updatedAt DateTime @updatedAt @map("updated_at")

  drill Drill @relation(fields: [drillId], references: [id], onDelete: Cascade)
  word  Word  @relation(fields: [wordId], references: [id], onDelete: Cascade)

  @@id([drillId, wordId])
  @@index([wordId])
  @@map("drill_word")
}
```

※ User / Word / Occurrence 側には対応するリレーションフィールド（`quizAnswers` / `drills` / `drillWords`）を追加する（リレーション定義のみで列は増えない＝「既存テーブル無変更」の方針に抵触しない）。

### 設計判断と理由

- **テストセッション（1回のテスト実施）テーブルは持たない**。過去テストの結果一覧を見る要求がないため。単語単位の履歴（いつ・何回・どの形式で・正誤）は QuizAnswer の `(ownerId, wordId)` インデックスで追える。必要になれば加算で対応。
- **履歴の紐づけ先は Word**（Meaning ではない）。出題・正誤の単位が単語のため。`ownerId` は解答したユーザー（システム共通の Word に対する解答でも履歴はユーザー自身の行）。
- **Word 削除時は履歴・DrillWord とも Cascade で削除**。単語が消えれば履歴・drill 残数も意味を失うため。drill 進行中に単語が消えた場合は出題対象が自然に減る。
- **mode 列（TEST / DRILL）で drill の解答を区別**。単語ごとの履歴で drill の繰り返し分を見分けるため。Drill 行への FK は持たない（Drill 行が消えても区別が失われないように）。
- **「わからない」は GAVE_UP として誤答と区別して記録**。情報量が増えコストはほぼゼロ。表示で使うかは 04 で判断。
- **日時はサーバー受領時刻（createdAt）**。一括送信のため1回のテスト／ラウンド内の解答は同じタイムスタンプになる（1問ごとの解答時刻は残らない）。「単語をいつテストしたか」の粒度としては十分。
- **形式・結果・mode は Prisma enum**。型安全を優先。将来形式（SPELLING 等）は enum 値追加のマイグレーションで対応。
- **Drill.roundCount（05 起因の加算改訂）**。drill ラウンド送信の冪等化のため、完了ラウンド数を持つ。送信時に「期待ラウンド数と一致したら +1」の compare-and-swap を行い、二重送信で remaining が二重に減るのを防ぐ（詳細は [05](05-architecture.md) の決定 4）。
- **rangeFrom / rangeTo は drill 生成時の実効範囲を保存する（05 で明確化）**。開始画面の範囲指定は「空欄＝制限なし」があり得るため、drill 生成時は実際に出題された単語の occurrenceNumber の min / max を保存する。列定義の変更はなし（非 null のまま）。
- **Drill に元テストの出題形式は持たせない**。「drill のラウンドが元テストの形式を引き継ぐか」が 06 の後続論点のため。引き継ぐと決まれば nullable 列を加算（追加コストは小）。
- **範囲指定の対象は occurrenceNumber が付与された WordOccurrence のみ**。既存スキーマで `occurrenceNumber` は nullable（`@@unique([occurrenceId, occurrenceNumber])`）であり、既存テーブルは変更しない方針のため、番号なしの単語は quiz の対象外となる。ユーザーへの見せ方は 04、取得クエリの扱いは 05 に引き継ぐ。
