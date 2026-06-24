# 02. データモデル

状態: **確定**（2026-06-12。同日 05 の決定を受けて `Drill.roundCount` を、06 の決定を受けて `Drill.format` を加算改訂。2026-06-13 開始画面デフォルト設定機能の `QuizDefaultSetting` を加算改訂。同日カウントダウン表示設定の `showCountdown` を加算改訂。後続改訂でデフォルト制限時間を形式別の子テーブル `QuizDefaultTimeout` に分離し `QuizDefaultSetting.timeoutSeconds` を廃止。2026-06-20 開始画面設定のデフォルト保存メタ設定 `saveOnStart` を加算改訂）

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
  TIMEOUT // 制限時間切れ（2026-06-13 加算改訂）。drill の残数計算上は INCORRECT と同じ扱い
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
  timeoutSeconds Int?    @map("timeout_seconds") // 元テストの制限時間（秒）。全ラウンドで引き継ぐ。null = 制限なし（2026-06-13 加算改訂）
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
  remaining Int      // 卒業までの残連続正解数 (0..3)。初期値: 元テスト誤答=3 / 正答=1（正答は「正解も出題する」ON 時のみ投入。06 決定 9）
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
- **Drill.format（06 起因の加算改訂）**。drill は元テストの出題形式を全ラウンドで引き継ぐ（[06](06-drill-mode.md) の決定 4）。drill 生成時にクライアントから 1 回だけ受け取って保存し、以降のラウンド生成・QuizAnswer.format の付与はサーバーがこの列から導出する。全 drill が生成時に形式を持つため非 null。QuizAnswer.format は重複して見えるが、QuizAnswer は Drill への FK を持たず Drill 削除後も履歴単独で形式が分かる必要があるため両方持つ。
- **範囲指定の対象は occurrenceNumber が付与された WordOccurrence のみ**。既存スキーマで `occurrenceNumber` は nullable（`@@unique([occurrenceId, occurrenceNumber])`）であり、既存テーブルは変更しない方針のため、番号なしの単語は quiz の対象外となる。ユーザーへの見せ方は 04、取得クエリの扱いは 05 に引き継ぐ。

### 開始画面デフォルト設定（2026-06-13 加算改訂）

開始画面の設定 3 項目（掲載箇所・掲載番号範囲・出題形式）をユーザーごとのデフォルトとして保存する（設定画面は [04](04-ui.md)）。

```prisma
// テスト開始画面のデフォルト設定: ユーザーごと 1 行。全項目任意（部分的なデフォルトを許す）
model QuizDefaultSetting {
  userId       String      @id @map("user_id")
  occurrenceId String?     @map("occurrence_id")
  rangeFrom    Int?        @map("range_from")
  rangeTo      Int?        @map("range_to")
  format       QuizFormat?
  showCountdown  Boolean?  @map("show_countdown") // 開始時カウントダウン演出の表示。null = 非表示（2026-06-13 加算改訂）
  saveOnStart  Boolean?    @map("save_on_start") // 開始画面「この設定をデフォルト設定とする」トグルの初期状態。null = OFF（2026-06-20 加算改訂）
  updatedAt    DateTime    @updatedAt @map("updated_at")

  user       User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  occurrence Occurrence? @relation(fields: [occurrenceId], references: [id], onDelete: SetNull)

  @@index([occurrenceId])
  @@map("quiz_default_setting")
}

// 出題形式ごとのデフォルト制限時間: ユーザー × 形式で 1 行。行が無い形式 = 制限なし（2026-06-13 改訂で形式別化）
model QuizDefaultTimeout {
  userId         String     @map("user_id")
  format         QuizFormat
  timeoutSeconds Int        @map("timeout_seconds") // 1問あたりの制限時間（秒）。1..60
  updatedAt      DateTime   @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, format])
  @@index([userId])
  @@map("quiz_default_timeout")
}
```

- **ユーザーごと 1 行（userId が PK）**。デフォルトは 1 セットで十分なため。複数プリセットの要求が出たら別途検討。
- **occurrence の onDelete は SetNull**（既存規約の Cascade からの意図的な逸脱）。Occurrence 削除時は掲載箇所だけ未設定へ戻し、range / format のデフォルトは道連れにしない。`OccurrencePresetSetting` は「occurrence に従属する設定」なので Cascade が正しいが、本モデルは「ユーザーの設定の一部が occurrence を参照」する構図で従属関係が逆。
- **全項目 nullable（部分的なデフォルトを許す）**。SetNull により「format だけ残る」状態が DB 上必ず生じるため、その状態をフォームでも表現・再保存できるように揃える。「出題形式だけいつも四択」のような使い方も自然。
- **未保存ユーザーの初期表示には推奨デフォルトを使う（2026-06-22 加算）**。レコードを一度も保存していないユーザーは `getQuizDefaultsForUser` が `null` を返す（設定行も `QuizDefaultTimeout` 行も無い状態のみ）。この `null` のときに限り、UI 側（`/quiz`・`/settings/quiz-defaults` の page.tsx）が `DEFAULT_QUIZ_SETTINGS`（`src/lib/quiz/default-settings.ts`）を初期値として反映する。**フォールバックはレコード丸ごと `null` の場合のみ**で、フィールド単位のマージはしない（保存後に明示的に未設定へ戻した状態は非 null で返るため尊重される）。ユーザー作成時の seed は行わない（occurrence preset と異なり作成コストをかけない）。`getQuizDefaultsForUser` 自体の戻り値契約（未保存＝`null`）は変えない。

### 制限時間（タイムアウト）（2026-06-13 加算改訂。デフォルトの形式別化を後続改訂で追加）

1 問あたりの制限時間を任意設定できる（要件は [01](01-requirements.md)、UI は [04](04-ui.md)）。スキーマへの影響は次のとおり（上のスニペットに反映済み）。

- **`QuizResult` に `TIMEOUT` を値追加**。時間切れの解答を誤答と区別して記録する（GAVE_UP と同じ動機）。集計・drill の残数計算上は INCORRECT と同じ扱い（`nextRemaining` で 3 にリセット）。
- **デフォルト設定の制限時間は出題形式ごとに保持する（後続改訂）**。当初は `QuizDefaultSetting.timeoutSeconds Int?`（単一値）だったが、形式によって必要な回答時間が異なるため、形式別の子テーブル **`QuizDefaultTimeout(userId, format, timeoutSeconds)`** に置き換えた。`QuizDefaultSetting.timeoutSeconds` は廃止。
  - **PK は `(userId, format)`**（`OccurrencePresetSetting` と同じ複合 PK 様式）。**「制限なし」= 行が存在しない**で表現するため `timeoutSeconds` は非 null。`getQuizDefaultsForUser` は全形式キーを持つ `Record<QuizFormat, number | null>` に組み立てて返す（行なしの形式は null）。
  - **形式追加は `QuizFormat` の値追加だけで対応**（カラム増設・マイグレーション不要）。形式リストは `ALL_QUIZ_FORMATS`（`src/lib/quiz/format-options.ts`）を単一の出どころとする。
  - **occurrence リレーションを持たない**。制限時間は occurrence に従属しないため、`QuizDefaultSetting` の occurrence `SetNull` と完全に独立（occurrence 削除が制限時間に影響しない）。
- **`Drill.timeoutSeconds Int?`**。元テスト開始時の制限時間（選択された 1 形式分の単一値）を drill 生成時に 1 回だけ受け取って保存し、全ラウンドで引き継ぐ（`format` と同じパターン。[06](06-drill-mode.md) の決定 4 と同形）。null = 制限なし。クイズは 1 回 1 形式のため、実行時に流れる制限時間は形式別化後も単一値のまま（→ [05](05-architecture.md)）。
- 値の範囲（1〜60 秒・整数）は zod スキーマ（`src/lib/schema/quiz.ts`）で検証し、DB には制約を置かない（既存の rangeFrom / rangeTo と同方針）。デフォルト設定の保存入力は全形式キーを必須に持つ map（`quizTimeoutByFormatSchema`）。
- 保存時に occurrence の可視性（`scopedOwnerIds`）を検証し、読み出し時も可視範囲外なら occurrenceId を null に落とす（二重防御）。`QuizDefaultSetting` と `QuizDefaultTimeout` の書き込みは 1 トランザクションで同期する。
- User 側にはリレーションフィールド（`quizDefaultSetting` / `quizDefaultTimeouts`）のみ追加（列は増えない＝「既存テーブル無変更」の方針に抵触しない）。

### カウントダウン表示（2026-06-13 加算改訂）

開始時のカウントダウン演出（3・2・1）の表示有無を設定できる（UI は [04](04-ui.md)）。

- **`QuizDefaultSetting.showCountdown Boolean?`**。デフォルト設定の 5 項目目。既存の全項目 nullable 方針に従い null = 未設定。デフォルト（未設定）は非表示とする。設定画面の「クリア」（行削除）でも非表示に戻る。
- 開始フォームの「初期値」ではなくテストの「挙動設定」のため、開始画面には設定 UI を出さない（変更は設定画面のみ）。

### 開始画面設定のデフォルト保存（2026-06-20 加算改訂）

開始画面で設定した内容をその場でデフォルトに保存できる導線を追加した（UI・経緯は [04](04-ui.md)）。

- **`QuizDefaultSetting.saveOnStart Boolean?`**。デフォルト設定の項目（既存の全項目 nullable 方針に従い null = OFF）。**開始画面トグル「この設定をデフォルト設定とする」の初期状態だけを決めるメタ設定**で、上書き処理自体の挙動には影響しない。
- 上書きは**開始画面にある項目のみの部分更新**（occurrence / range / format と、選択中形式の制限時間 1 行）。他形式の `QuizDefaultTimeout` 行・カウントダウン/発音/効果音などの挙動設定・`saveOnStart` 自体は温存する（`saveStartSettingsAsDefaultsForUser` が upsert の update に開始画面の 4 項目しか渡さないため既存値が残る）。occurrence の可視性検証・1 トランザクション同期は通常の保存と同じ。
- **開始画面トグルの状態は `saveOnStart` に書き戻さない（一方向）**。メタ設定は初期状態を与えるだけで、開始画面でトグルを切り替えてもデフォルトのメタ設定は変わらない（変更は設定画面のみ）。
