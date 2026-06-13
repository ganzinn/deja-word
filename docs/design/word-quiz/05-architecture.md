# 05. アーキテクチャ（UseCase / handler / API 構成）

状態: **確定**（2026-06-12。同日 06 の決定を受けて Action シグネチャ（format 引数の整理・`deleteDrill` 追加）を改訂）

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- 機能名は quiz（`src/lib/` 配下のモジュール命名の基準）。
- 既存の構成パターン: Server Action → UseCase（`src/lib/words-*.ts`、`prisma.$transaction` を張る）→ Handler（エンティティ別、tx 受け取り）→ Policy（認可、`src/lib/words/policy/`）。
- テストは Vitest、SUT の隣にコロケート（`*.unit.test.ts` / `*.integration.test.ts`）。
- テスト内容は開始時（カウントダウン中）に一括取得し、テスト中はサーバー通信なしのクライアント完結で進行する（01 確定）。
- 解答履歴（mode・正誤・日時・出題形式）はテスト終了時／drill ラウンド終了時に一括送信して永続化する。送信失敗時のリトライ設計は本トピックで検討（01・06 確定）。
- drill ラウンド終了時は履歴一括送信と残数（DrillWord.remaining）更新を同一トランザクションで行う（06 確定）。
- drill の生成はテスト結果画面起点（「定着モードへ」押下時。元テスト結果から DrillWord の初期残数を作る）（06 確定）。
- 中断は破棄（途中状態のサーバー保存なし。drill の確定済み残数は保持）（01・06 確定）。
- 出題形式は3形式＋将来形式4・5（日→英）。形式追加に耐える拡張点を設計すること（01 確定）。
- スキーマは QuizAnswer / Drill / DrillWord ＋ enum 3つ（02 確定。本トピックの決定により Drill へ `roundCount` を、06 の決定により `format` を加算 → 02 改訂済み）。範囲指定の対象は occurrenceNumber 付きの WordOccurrence のみ（02 確定）。意味（MeaningText）未登録の単語は出題対象から除外する（03 確定。取得クエリに効く）。
- 問題データ（選択肢構成・シャッフル済み）はサーバーで全問生成し一括返却する。採点はクライアントで行うため正解情報も payload に含む（カンニングは許容）。drill も各ラウンド開始時に同じロジックでサーバー再生成（03 確定）。
- 選択肢生成・シャッフルは RNG（`() => number`）を引数に取る純関数として実装し、unit test はシード付き PRNG を注入する（03 確定）。

## 検討事項リスト

- [x] モジュール配置（`src/lib/quiz/` を新設するか、既存 words 系と同列の `quiz-*.ts` か）→ 決定 1
- [x] テスト内容一括取得のインターフェース（Server Action か Route Handler か）→ 決定 2
- [x] 解答履歴一括送信の整合性（多重送信防止、送信失敗時のリトライ、元データ変更／削除への耐性）→ 決定 3
- [x] drill ラウンド送信の冪等性 → 決定 4
- [x] 出題対象の認可（既存 Policy の再利用範囲）→ 決定 5
- [x] 形式追加（4・5）に耐える拡張点の置き方 → 決定 6
- [x] 選択肢生成・シャッフルのモジュール配置（unit test のコロケート含む）→ 決定 7
- [x] ダミープール取得クエリの設計 → 決定 8
- [x] テスト戦略（unit / integration の切り分け）→ 決定 9
- [x] （04 から引き継ぎ）音声プリロードの取得方式 → 決定 10

## 議論・決定

### 決定 1: モジュール配置 — UseCase はフラット、支援モジュールは `src/lib/quiz/` 配下

words の実構成（UseCase は `words-*.ts` フラット、`src/lib/words/` に handlers / policy / error-map）の相似形にする。

```
src/lib/
  quiz-preview.ts            # getQuizPreviewForUser（開始画面プレビュー）
  quiz-generate.ts           # generateQuizForUser（テスト問題一括生成）
  quiz-answers-submit.ts     # submitQuizAnswersForUser（mode=TEST 履歴一括保存）
  drill-create.ts            # createDrillForUser（結果画面起点の drill 生成）
  drill-round-generate.ts    # generateDrillRoundForUser（ラウンド問題再生成）
  drill-round-submit.ts      # submitDrillRoundForUser（履歴＋残数を同一 tx）
  drill-list.ts              # listActiveDrillsForUser（開始画面の進行中一覧）
  drill-delete.ts            # deleteDrillForUser（進行中一覧からの削除。06 決定 7 起因の加算）
  quiz/
    payload.ts               # 問題データの discriminated union（クライアントから import 可。server-only を付けない）
    error-map.ts             # mapQuizErrorToResult（words/error-map.ts と同形）
    generation/              # RNG 注入の純関数群（決定 6・7）
    queries/quiz-source.ts   # 素材取得クエリ（決定 8）
    handlers/
      quiz-answer-handler.ts #   insertQuizAnswers(tx, ...)
      drill-round-handler.ts #   applyDrillRound(tx, ...)
      shared.ts              #   Tx 型（words/handlers/shared.ts と同定義。words への依存を作らない）
```

app 側（04 確定の「`/quiz` 内クライアント状態遷移」に対応、ページは 1 枚）:

```
src/app/quiz/
  page.tsx                   # server component: Occurrence 一覧＋進行中 drill 一覧を取得して渡す
  actions.ts                 # 本機能の Server Action 集約（ページが 1 枚のため 1 ファイル）
  _components/
    quiz-flow.tsx            # クライアント状態機械（start → countdown → play → result。drill ラウンドも mode 違いで再利用）
    start-form.tsx / countdown.tsx / result-list.tsx / word-detail-dialog.tsx
    question-choice.tsx / question-self-judge.tsx / question-multi-meaning.tsx
src/components/word-detail-view.tsx   # /words/[id] の表示部を抽出した共有コンポーネント
```

- 採用理由: `grep words-` と同様にフラット直下で UseCase を探せる既存の発見性を維持しつつ、純関数＋unit test の大量ファイルはディレクトリに逃がす（words が handlers をディレクトリ化した判断と同じ）。
- 却下案A（UseCase も `src/lib/quiz/` にネスト）: UseCase の置き場が words と非対称になり発見性が崩れる。
- 却下案B（支援関数も全部フラットの `quiz-*.ts`）: 純関数＋unit test が 10 ファイル超 lib 直下に並ぶ。

### 決定 2: インターフェースは全部 Server Action（Route Handler 追加なし）

Server Action はクライアントコンポーネントから直接呼べる（カウントダウン中の取得も単なる関数呼び出し）。既存の Route Handler は検索（GET・URL クエリ）と dev-blob のみで、新規にクエリ文字列の手動 parse・型なし fetch を持ち込む理由がない。音声は payload 内 URL を `<audio>` が直接取得するため API 不要（決定 10）。

戻り値は既存の Result 型 `{ ok: true, ... } | { ok: false, error: ErrorCode, message: string }`。zod スキーマは `src/lib/schema/quiz.ts` に新設。

| 用途 | Action（`src/app/quiz/actions.ts`） | 入出力 |
| --- | --- | --- |
| プレビュー | `getQuizPreview` | `QuizRangeInput` → 対象件数・除外内訳（番号なし◯語・意味未登録◯語）・形式ごとの成立可否 |
| テスト開始 | `startQuiz` | `QuizRangeInput & { format: QuizFormat, timeoutSeconds: number \| null }` → `{ quiz: QuizPayload }`（timeoutSeconds は payload にエコーバック。2026-06-13 加算） |
| テスト履歴送信 | `submitQuizAnswers` | `{ format: QuizFormat, answers: AnswerInput[] }` → `{ savedCount, skippedWordIds }` |
| drill 生成 | `startDrill` | `{ occurrenceId, format: QuizFormat, timeoutSeconds: number \| null, results: { wordId, correct }[] }` → `{ drillId }`（format / timeoutSeconds は `Drill` に保存。timeoutSeconds は 2026-06-13 加算） |
| drill ラウンド生成 | `startDrillRound` | `{ drillId }` → `{ quiz: QuizPayload, roundCount }`（初回・再開とも同一経路。形式・制限時間は `Drill` から導出） |
| drill ラウンド送信 | `submitDrillRound` | `{ drillId, expectedRoundCount, answers }` → `{ remaining: { wordId, remaining }[], completed, alreadyApplied }`（QuizAnswer.format は `Drill.format` から付与） |
| drill 削除 | `deleteDrill` | `{ drillId }` → 成功のみ（追加 payload なし。進行中一覧の削除ボタン。06 決定 7 起因の加算） |
| 単語詳細ダイアログ | `getWordDetailForDialog` | `wordId` → 既存 `getWordDetailForUser` の結果（薄いラッパ） |

共通型: `QuizRangeInput = { occurrenceId: string; rangeFrom?: number; rangeTo?: number }`、`AnswerInput = { wordId: string; result: QuizResult }`。mode と ownerId はサーバー側（経路とセッション）で決まり、クライアント入力には含めない。**format はクライアントが TEST 履歴送信（`submitQuizAnswers`）と drill 生成（`startDrill`）のトップレベルで 1 回だけ送る**（zod の enum で検証。解答ごとの format 指定は許さない）。テストセッションの状態を持たない設計のため、この 2 経路ではサーバー側に format の導出手段がないことによる。drill のラウンド系 Action は `Drill.format` から導出するため format を受け取らない（06 決定 4 起因の改訂）。

- drill 生成の入力はクライアントから結果（`{ wordId, correct }[]`）を送る。QuizAnswer にはテストセッション ID がなく、サーバー側で「今回のテストの結果」を特定する確実な手段がないため（createdAt の時間窓は複数タブ・連続テストで誤集計し得る）。改ざんは可能だがカンニング許容の方針（03）と整合。
- `startDrill` に範囲（rangeFrom / rangeTo）は含めない。Drill の rangeFrom / rangeTo は results の単語の occurrenceNumber から実効範囲（min / max）をサーバーで計算して保存する（02 の注記どおり）。ユーザー指定の範囲を受け取ると実効値との二重定義になるため。
- drill 生成を「生成＋ラウンド1返却」の 1 Action にしない理由: ラウンド生成を初回／再開で単一経路（`startDrillRound`）にし、結果画面→カウントダウンの画面フロー（04）と一致させるため。
- **制限時間は payload に一本化する**（2026-06-13 加算）: `QuizPayload` に `timeoutSeconds: number | null` を持たせ、TEST は `startQuiz` 入力のエコーバック、DRILL は `Drill.timeoutSeconds` から導出して載せる。play フェーズ（quiz-flow）はモードを区別せず payload の値だけを見る（「TEST と DRILL は同じ状態機械を再利用」の 06 決定 8 と整合）。drill への引き継ぎは `startDrill` 入力 →`Drill.timeoutSeconds` 保存 → ラウンド生成時にサーバーが payload へ載せる（サーバーが権威）。値の検証は zod（1〜60 秒・整数・nullable。定数は `src/lib/quiz/timeout-options.ts` で UI と共有）。
- 実装メモ: debounce プレビューは応答順逆転に備え、クライアント側でリクエストトークンを比較し古い応答を捨てる。
- 却下案（問題生成・プレビューを GET Route Handler）: キャッシュも URL 共有も不要（毎回ランダム生成）。Action の型推論・既存 actions テストパターンを失うだけ。

### 決定 3: 解答履歴一括送信の整合性 — single-flight ＋ 存在確認フィルタ

- 多重送信防止（TEST）: クライアント single-flight（送信中はボタン無効、再送ボタンは失敗確定後のみ表示）。タイムアウト等「成否不明」後の再送で履歴行が重複し得るが、**MVP の許容事項とする**。TEST は残数更新がなく実害は履歴行の重複のみ（drill 側は決定 4 で防御）。
- 単語削除耐性: `submitQuizAnswersForUser` は tx 内で `tx.word.findMany({ where: { id: { in: wordIds }, ownerId: { in: scopedOwnerIds(userId) } } })` で存在確認し、実在分のみ `tx.quizAnswer.createMany`。FK 違反で全件失敗させない。`skippedWordIds` を返し、結果画面は該当行に「削除済み」注記を表示する（04 の結果一覧への実装メモ）。
- 却下案（クライアント生成 idempotency key で重複検知）: key の保存先（列 or テーブル）が必要で「append-only・セッションテーブルなし」の 02 確定に反する。TEST の重複害が小さいのに対しコストが大きい。
- 却下案（1 行ずつ insert ＋ FK 違反を握りつぶし）: N 回往復・tx 長期化。事前フィルタで足りる。

### 決定 4: drill ラウンド送信の冪等性 — `Drill.roundCount` の compare-and-swap

Drill に `roundCount Int @default(0)` を加算する（**02 改訂済み**）。`submitDrillRoundForUser` のフロー（全体が 1 tx）:

1. `tx.drill.updateMany({ where: { id: drillId, ownerId: userId, roundCount: expectedRoundCount }, data: { roundCount: { increment: 1 } } })`
2. `count === 1`（通常経路）: `insertQuizAnswers`（mode=DRILL）→ 残数更新（純関数 `nextRemaining(current, result)`: 正解 −1、誤答／GAVE_UP／TIMEOUT は 3 にリセット）→ 全 remaining=0 なら `completedAt` 設定 → 確定残数を返す。単語削除耐性は決定 3 と同じ存在確認フィルタを適用し、ラウンド中に削除された単語は履歴 insert・残数更新とも skip する（DrillWord は Cascade で削除済み。完了判定は残っている DrillWord 行だけで行う）。
3. `count === 0`: drill を再読込。`roundCount === expectedRoundCount + 1` なら適用済みと判断し、現在の DrillWord を読み直して `alreadyApplied: true` で成功応答する。自分の再送だけでなく、**別タブが同一ラウンドを先行送信した場合もここに含まれる**（同一ラウンドは一度だけ適用され、後着には確定残数を返す。残数バッジは 04 確定どおりこの確定値を表示）。roundCount がそれ以外の値（2 ラウンド以上進んでいる古いタブ等）は `DrillRoundConflictError`。

`expectedRoundCount` は `startDrillRound` の応答でクライアントへ渡す。二重クリックは single-flight が一次防御、CAS が最終防御。`roundCount` は「何周したか」の表示にも将来使える。

- 却下案（updatedAt 楽観ロック、スキーマ加算なし）: `@updatedAt` は残数更新でも動き、DateTime の JSON 往復・ミリ秒精度比較が壊れやすい。さらに「適用済みの再送」と「競合」を区別できず、冪等成功応答が作れない。
- 却下案（idempotency key テーブル）: key 保存テーブルの加算＋掃除が必要で、roundCount 1 列より重い。

### 決定 5: 認可 — `scopedOwnerIds` の where 句注入。EditorContext / row-policy は使わない

- Occurrence: 各 UseCase 冒頭で `findFirst({ where: { id, ownerId: { in: scopedOwnerIds(userId) } } })`、不在は NotFound 系エラー（存在を漏らさない）。
- 素材クエリ: Word / Meaning / MeaningText / WordOccurrence の全階層に `ownerId: { in: allowed }` を適用（既存 `getWordDetailForUser` と同形）。**「全登録単語」の定義は scopedOwnerIds 範囲（system＋自分）**。
- Drill / DrillWord / QuizAnswer: 常にユーザー単独所有（system 行が存在しない）ため `ownerId: userId` で照合。`ownerId` は常にセッションから採り、クライアント入力に含めない。
- `editorContextFor` / `assert*Allowed` は「system 共有行への書き込み権限」の仕組みであり、quiz は共有行に書かないため不適用。handler シグネチャは `(tx: Tx, userId: string, ...)` とし EditorContext を取らない（words との意図的な相違）。

### 決定 6: 形式追加への拡張点 — 形式別生成器＋exhaustive switch、payload は discriminated union

拡張点は 4 箇所に閉じる: (1) Prisma enum へ値追加、(2) `src/lib/quiz/generation/<format>.ts` の生成器追加、(3) `payload.ts` の union メンバ追加、(4) `_components/question-<format>.tsx` 追加。ディスパッチャ `buildQuiz(format, material, rng)` と成立判定 `checkFormatAvailability(format, material)` を exhaustive switch（`never` チェック）にしておけば、enum 追加時に (2)(3) の漏れがコンパイルエラーで露見する。`checkFormatAvailability` は 1 形式分の判定（成立可否＋不成立理由）を返し、プレビューでは全形式分を呼んで形式ごとの可否を組み立てる。

```ts
// src/lib/quiz/payload.ts
export type QuestionBase = { wordId: string; headword: string; pronunciationAudioUrl: string | null };
export type ChoiceQuestion = QuestionBase & { choices: { text: string }[]; correctIndex: number };
export type MultiMeaningQuestion = QuestionBase & { options: { text: string; isCorrect: boolean }[] };
export type SelfJudgeQuestion = QuestionBase & {
  answer: { partOfSpeech: string | null; texts: string[] }[]; // 全 Meaning の表示用データ
};
export type QuizQuestionsPayload = // buildQuiz の戻り値（形式別の問題一式）
  | { format: "CHOICE"; questions: ChoiceQuestion[] }
  | { format: "SELF_JUDGE"; questions: SelfJudgeQuestion[] }
  | { format: "MULTI_MEANING"; questions: MultiMeaningQuestion[] };
// timeoutSeconds（null = 制限なし）は UseCase 側で合成する（決定 2 の「payload 一本化」。2026-06-13 加算）
export type QuizPayload = QuizQuestionsPayload & { timeoutSeconds: number | null };
```

素材型 `QuizSourceMaterial`（対象単語の headword＋全 Meaning/MeaningText＋音源 URL、ダミープール）は日→英 2 形式（綴り＝headword、日→英自己判定＝Meaning を問題文に）も既に賄えるため、クエリ・素材型は将来形式でも無変更で済む見込み。投機的フィールドは足さない。

- 却下案（生成器レジストリ `Map<QuizFormat, Generator>`）: 形式は多くて 5。switch の網羅性チェックの方が漏れ検知が強く、間接層が 1 枚減る。
- 却下案（payload を非判別の共通形）: クライアントの形式別 UI 出し分けで型の絞り込みが効かない。

### 決定 7: 生成純関数の配置 — `src/lib/quiz/generation/` にフラット＋unit test コロケート

```
src/lib/quiz/generation/
  shuffle.ts / .unit.test.ts        # type Rng = () => number、fisherYatesShuffle、pickN
  dummy-pool.ts / .unit.test.ts     # 優先順（同一 Occurrence → 全登録）・trim 重複排除・縮退判定
  choice.ts / .unit.test.ts         # buildChoiceQuestions(material, rng)
  multi-meaning.ts / .unit.test.ts  # buildMultiMeaningQuestions(material, rng)
  self-judge.ts / .unit.test.ts     # buildSelfJudgeQuestions(material, rng)
  build-quiz.ts / .unit.test.ts     # buildQuiz ＋ checkFormatAvailability（exhaustive switch）
  material.ts                       # QuizSourceMaterial 型と partitionMaterial 純関数（決定 8）
  next-remaining.ts / .unit.test.ts # drill 残数遷移 nextRemaining(current, result)
```

`server-only` import は付けない（純関数のため。呼び出し元の UseCase / クエリが server-only）。unit test はシード付き PRNG（mulberry32 等の小さなヘルパを `tests/setup/` に追加）を注入して決定的に検証する。

### 決定 8: ダミープール取得 — 1 クエリで全可視単語を取得し、純関数でパーティション

`src/lib/quiz/queries/quiz-source.ts` の `fetchQuizSource(userId, occurrenceId)` が、ユーザーの全可視単語（MeaningText 1 件以上）を一括取得する:

```ts
// prisma.word.findMany({
//   where: { ownerId: { in: allowed }, meanings: { some: { texts: { some: { ownerId: { in: allowed } } } } } },
//   select: { id, headword,
//     meanings: { where/orderBy: 既存 detail と同様, select: { partOfSpeech, pronunciationAudioUrl, texts: { text } } },
//     wordOccurrences: { where: { occurrenceId, ownerId: { in: allowed } }, select: { occurrenceNumber } } } })
```

純関数 `partitionMaterial(rows, range)` が (a) 出題対象（occurrenceNumber が範囲内）、(b) 同一 Occurrence プール（wordOccurrences 非空の他単語）、(c) 全登録プール（残り）に分割して `QuizSourceMaterial` を作る。(a)〜(c) は互いに素な分割であり、**ある問題のダミー候補は (a)∪(b) から出題中の単語自身を除いたもの**（03 の「同一 Occurrence の他単語」には他の出題対象も含む）。(c) は不足時の補完用。除外内訳（番号なし・意味未登録）のカウントだけは別途 count クエリで取る（意味未登録の単語は上記クエリに現れないため）。

**プレビュー（`quiz-preview.ts`）と問題生成（`quiz-generate.ts`）は同じ `fetchQuizSource`＋`checkFormatAvailability` を共有**する。開始ボタンの成立判定と生成時の成立判定が同一ロジックになり、「プレビューでは成立・生成でエラー」の乖離が（レース以外で）起きない。

- 採用理由: 03 の補完仕様（重複排除**後**の不足分だけ全登録から補う）は問題ごとに不足量が変わるため、遅延 2 クエリ目だと不足の事前判定が原理的に正確にできない。最初から両プールを持てば純関数内で 03 をそのまま実装でき、テストも DB 不要になる。データ量は id・headword・訳語文字列のみで、個人語彙（数百〜数千語）の規模では問題にならない。
- 却下案（2 段階遅延クエリ）: 不足の事前判定が不正確で縮退仕様との整合が崩れる。コードパスも 2 本になりテスト負担増。
- 却下案（raw SQL の UNION＋優先度フラグ）: Prisma の型を捨てる早すぎる最適化。性能課題が実測されてから。

### 決定 9: テスト戦略

| 対象 | 種別 | 基盤 |
| --- | --- | --- |
| `generation/` 全純関数（縮退・重複排除・シャッフル・残数遷移） | unit | シード付き PRNG 注入 |
| `quiz/handlers/`（insertQuizAnswers、applyDrillRound） | unit | `tests/setup/tx-mock.ts` に quizAnswer / drill / drillWord delegate を追加して流用 |
| `fetchQuizSource`（可視性スコープ・意味未登録除外・番号なし除外） | integration | 実 DB＋`tests/setup/fixtures.ts` 拡張（番号付き／なし／意味なし単語の fixture） |
| `submitQuizAnswersForUser`（削除済み単語 skip）／`createDrillForUser`（初期残数 3/1）／`submitDrillRoundForUser`（残数遷移・completedAt・CAS） | integration | UseCase ごとにコロケート（words-create 等と同形） |
| `src/app/quiz/actions.ts`（認証なし・zod 不正・エラーマップ） | unit | 既存 actions の unit test と同じモックパターン |

`deleteDrillForUser`（06 決定 7）は `ownerId: userId` 照合＋物理削除のみで特殊ロジックがないため、専用の integration は設けず actions.ts の unit テストパターンでカバーする。

冪等性（決定 4）の検証は integration が本丸: 同一 `expectedRoundCount` で 2 回呼び、2 回目が `alreadyApplied: true` を返し、remaining と QuizAnswer 件数が 1 回分であることを確認する。

### 決定 10: 音声プリロード（04 引き継ぎ）— 新規 API なし、payload 内 URL をクライアントが先読み

payload の各問題に発音音源 URL を含める（03 確定済み）。クライアントは `new Audio(url)` を生成・保持して先読みする（カウントダウン中に第1問、出題・フィードバック表示中に次問。04 確定のタイミング仕様どおり）。取得失敗は無視して進行に影響させない。本番は Vercel Blob の public URL、開発は `/api/dev-blob/...` をそのまま使い、配信側の追加実装はない。

- 却下案（音源を base64 等で payload に同梱）: payload が肥大し、ブラウザの音声キャッシュ・並行取得を捨てることになる。

## 処理フロー要約（テスト 1 回）

1. `/quiz` SSR: `listActiveDrillsForUser`＋Occurrence 一覧 → start-form
2. 入力変更 → `getQuizPreview`（debounce）→ 件数・除外注記・形式成立可否
3. 開始 → countdown 表示と並行で `startQuiz` → `QuizPayload` 受領 → 第1問音声プリロード
4. 出題〜採点はクライアント完結（quiz-flow.tsx の状態機械）
5. 結果画面表示時 `submitQuizAnswers` → 失敗時アラート＋再送（single-flight）
6. 「定着モードへ」→ `startDrill` → `startDrillRound` → ラウンド終了で `submitDrillRound(expectedRoundCount)` → 確定残数で結果表示

## 06 への引き継ぎ（解決済み）

- 出題形式は元テストを引き継ぐと確定（06 決定 4）。`Drill.format` を加算（02 改訂済み）し、`startDrillRound` / `submitDrillRound` の `format` 引数を落とした（決定 2 の表に反映済み。format は `startDrill` が 1 回だけ受け取る）。
- ラウンド間の出題順序・選択肢は毎回変えると確定（06 決定 5）。本トピックの「各ラウンド開始時にサーバー再生成（シード永続化なし）」の挙動がそのまま仕様であり、追加実装はない。
- 進行中 drill の削除導線の追加（06 決定 7）に伴い `deleteDrill` Action と `drill-delete.ts` UseCase を加算した（決定 1・2 に反映済み）。
