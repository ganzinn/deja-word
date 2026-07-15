# 03. quiz-source

状態: **実装中**　PR: （未作成）

## 目的

quiz の出題クエリ（`src/lib/quiz/queries/quiz-source.ts` の 3 関数）にブックマーク絞り込みと「ブックマーク全件モード」を、**後方互換のシグネチャ拡張**（既存の呼び出し箇所は無変更で成立）として組み込む。あわせて ADR「ブックマーク全件モード」を起票する。

スコープ外:

- `src/lib/schema/quiz.ts` の入力スキーマ変更・Drill / QuizDefaultSetting のスキーマ変更・quiz-generate / drill-create の配線（すべて 04）
- 開始フォーム・プレビュー UI の対応（09。本チケットで start-form.tsx に触るのは下記の型ガード 1 行のみ）

## 依存チケット

- 01: 出題述語 `bookmarks: { some: { userId } }` が参照する Bookmark テーブルを使う

## 前提（設計決定の再掲）

- `bookmarkedOnly: boolean` は**省略時 false の default 付き引数**として 3 関数（`fetchQuizSource` / `countQuizTargets` / `countQuizSourceExclusions`）へ追加し、既存の呼び出し箇所は無変更で成立させる。true のとき出題対象の Word 述語に `bookmarks: { some: { userId } }` を AND で追加する。絞り込み条件はセッションの userId とこのフラグのみから組み立て、クライアントが対象 wordId 集合を指定する経路は作らない（[03-quiz-scope.md](../../design/bookmark/03-quiz-scope.md) 決定 1）
- 適用箇所（[03-quiz-scope.md](../../design/bookmark/03-quiz-scope.md) 決定 1）:
  - `fetchQuizSource` の targetRows 述語（`eligibleWord` ∧ `inRangeWordOccurrence` に AND）
  - `countQuizTargets` の count 述語（同型を維持）
  - `countQuizSourceExclusions` の 3 内訳（`noNumber` / `noMeaning` / `noTgExample`）すべて。除外内訳もブックマーク済み単語にスコープする（例: `noNumber` は「ブックマーク済みだが掲載番号なしで対象外」の件数になる）
- ダミー候補（誤答選択肢）には適用しない: `sameOccurrenceRows` / `fallbackRows` は現行のまま（scoped 可視の全単語が候補）。ADR-0030 の有界フェッチ（`DUMMY_POOL_SIZE` 不足分補充）も無変更で成立する（[03-quiz-scope.md](../../design/bookmark/03-quiz-scope.md) 決定 2）
- ブックマーク全件モード（`occurrenceId` 未指定）（[03-quiz-scope.md](../../design/bookmark/03-quiz-scope.md) 決定 3）:
  - 3 関数の `occurrenceId` 引数を未指定（null/undefined）許容に広げる
  - 対象述語は `bookmarks: { some: { userId } }` ∧ 適格性（可視な意味 or 使える TG 例文）のみ。掲載箇所・掲載番号の条件は付けない（**掲載番号なし・掲載箇所未紐付けの単語も出題対象になる** — ADR-0022 の明示的例外）
  - `assertOccurrenceVisible` は `occurrenceId` があるときのみ呼ぶ
  - 除外内訳: `noNumber` は掲載箇所の概念がないため `null`（noMeaning / noTgExample の形式排他 null と同じ流儀）。noMeaning / noTgExample はブックマーク済み全体にスコープして count する
  - ダミー供給: `sameOccurrenceRows` は常に空。primaryPool = targets のみ、fallbackPool = 全単語プール（`fallbackRows`、ブックマーク外含む）。`selectDummies` のロジックは無変更
  - `ensureTargetWordIds`（drill ラウンド・再挑戦用）の追加条件は、掲載箇所指定時の「番号付き」（`numberedWordOccurrence`）に代えて適格性のみとする
  - 履歴: QuizAnswer は範囲情報を持たないため無変更
- ADR は 2 本構成の 2 本目「ブックマーク全件モード（掲載箇所なし出題）」を本チケットで起票する。ADR-0022（出題対象は掲載箇所＋番号範囲）への明示的例外として独立した見出しで立て、ADR-0022 側にも相互リンクの補記を入れる（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 6、[03-quiz-scope.md](../../design/bookmark/03-quiz-scope.md) 決定 3）

## 実装内容

### 変更: `src/lib/quiz/queries/quiz-source.ts`

前提のとおり 3 関数を拡張する。`bookmarkedOnly` は default `false`、`occurrenceId` は未指定許容（未指定の分岐は全件モード仕様に従う）。`countQuizSourceExclusions` の戻り値は `noNumber: number | null` になる。

マージ時点の呼び出し元（quiz-generate / drill-round-generate / drill-retry-generate / quiz-preview）はすべて実行時挙動を変えない（後述の型のみの追随を除き無変更）。**唯一の意図的な挙動変更**は `ensureTargetWordIds` の条件（番号付き → 適格性のみ。番号なしへ移動した単語も drill ラウンド・再挑戦の救済対象に含まれるようになる）。

### 変更: `src/lib/quiz-preview.ts`（型の追随のみ）

`countQuizSourceExclusions` の戻り値を格納する `QuizPreview.excluded.noNumber` を `number | null` に広げる（値は pass-through のままで挙動不変。既存の noMeaning / noTgExample の null 許容と同型）。入力の optional 化・bookmarkedOnly の受け渡し・`assertOccurrenceVisible` の条件化は 04 で行い、本チケットでは触らない。

### 変更: `src/app/quiz/_components/start-form.tsx`（型ガード 1 行のみ）

`noNumber` の null 許容化に伴い、`ExcludedNote` の `if (excluded.noNumber > 0)` を `if (excluded.noNumber !== null && excluded.noNumber > 0)` にする（null のとき項目を出さない表示仕様は [04-ui.md](../../design/bookmark/04-ui.md) 決定 6 と一致。既存の noMeaning / noTgExample の null 省略と同型）。これ以外は触らない（本対応は 09）。

### 作成: `docs/adr/`（新規 ADR 1 本）＋ 変更: `docs/adr/0022-*.md`

「ブックマーク全件モード（掲載箇所なし出題）」を起票し、ADR-0022 に相互リンクの補記を入れる。

### 変更: `src/lib/quiz/queries/quiz-source.integration.test.ts`（拡張）

## 完了条件（Definition of Done）

- [ ] integration（quiz-source 拡張）: `bookmarkedOnly=true` で対象がブックマーク済みに絞られる・他ユーザーのブックマークが混ざらない（テナント分離）・ダミー候補には適用されない・全件モードで掲載番号なし単語が含まれる・除外内訳のブックマークスコープ（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 5）
- [ ] 既存の quiz-source / quiz-generate / drill 系テストが無変更で通る（後方互換の確認。ensureTargetWordIds の条件変更で既存テストの期待が変わる場合は設計どおりの変更として期待値を更新し、実装メモに残す）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` / `pnpm test:integration` が通る
- [ ] ADR「ブックマーク全件モード」起票＋ ADR-0022 補記

## 競合注意

- `src/app/quiz/_components/start-form.tsx`: 本チケットは上記の型ガード 1 行のみ。本対応は 09（09 は 03 に依存するため直列になる）
- `src/lib/quiz-preview.ts`: 本チケットは上記の型の追随のみ。本対応は 04（04 は 03 に依存するため直列になる）

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
