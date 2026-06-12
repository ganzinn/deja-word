# 01. word-detail-view

状態: **完了（2026-06-13）**　PR: https://github.com/ganzinn/deja-word/pull/13

## 目的

`/words/[id]`（単語詳細画面）の表示部を共有コンポーネント `src/components/word-detail-view.tsx` に抽出する。quiz の結果一覧から開く単語詳細ダイアログ（チケット 08）が同じ表示を再利用するための先行リファクタ。表示・挙動は一切変えない。

スコープ外:

- ダイアログ側（`word-detail-dialog.tsx`）の実装はチケット 08
- 表示内容・スタイルの変更（純粋な抽出のみ）

## 依存チケット

なし（並行着手可）

## 前提（設計決定の再掲）

- 結果一覧の単語タップで単語詳細をフルスクリーンダイアログ表示する。ダイアログは表示専用で編集導線は置かず、閉じると結果画面に戻る。詳細表示部は `/words/[id]` と共有コンポーネント化する（[04-ui.md](../../design/word-quiz/04-ui.md) 「結果一覧画面（テスト）」）
- 抽出先は `src/components/word-detail-view.tsx`（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 1）

## 実装内容

### 作成: `src/components/word-detail-view.tsx`

`src/app/words/[id]/page.tsx` の表示部を移動する。対象は main 部の JSX（意味・例文・関連語・メモ・掲載箇所の各 Section）と内部ヘルパー（`Section` / `Field` / `MeaningCard` / `ExampleCard` / `RelatedWordCard` / `OccurrenceCard` / `nonEmpty`、現行の 135 行目以降 約 150 行）。

- props は既存 UseCase `getWordDetailForUser`（`src/lib/words-detail.ts`）の戻り型（単語詳細データ）を受け取る表示専用コンポーネントとする
- ヘッダー（戻るボタン・編集/削除ボタン）と権限判定は含めない（ページ側に残す。ダイアログは表示専用のため）
- 既存の `AudioPlayButton` 利用（MeaningCard 内の音源再生）はそのまま移動する

### 変更: `src/app/words/[id]/page.tsx`

データ取得・ヘッダー・権限判定を残し、表示部を `<WordDetailView ... />` の呼び出しに置き換える。レンダリング結果（DOM 構造・表示内容）は変えない。

## 完了条件（Definition of Done）

- [ ] 既存テストがすべて通る（このチケットは表示専用の抽出のため新規テストは追加しない。設計のテスト戦略（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 9）でも UI コンポーネントは対象外）
- [ ] `pnpm lint` / `pnpm typecheck` が通る
- [ ] `/words/[id]` を手動確認し、抽出前と表示・音源再生挙動が変わらないこと

## 競合注意

- `src/components/word-detail-view.tsx`: チケット 08 が import する（08 は本チケットのマージ後に着手すること）

## 実装メモ

- 抽出対象の列挙（意味・例文・関連語・メモ・掲載箇所の各 Section）に加え、同じコンテンツ div 内の見出し `<h2>`（headword 表示）も `WordDetailView` に含めて移動した。DOM 構造不変を満たす最小の切り出し単位がこの div 全体であり、08 のダイアログでも headword 表示が必要なため。
- `WordDetailView` のルート div はページ由来の `px-4 pt-6` パディングを保持。08 のダイアログでレイアウトが合わない場合はラッパー側で調整するか、その時点で padding を props 化する（本チケットでは表示不変のため現状維持）。
- `word-detail-view.tsx` は `"use client"` なしの共有コンポーネント。props の `WordDetail` は type-only import のため `server-only` な `words-detail.ts` を実行時に引き込まない（08 のクライアント側ダイアログから import 可能）。
- 手動確認（`/words/[id]` の表示・音源再生の不変確認）は未実施。
