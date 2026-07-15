# 09. quiz-start-ui

状態: **実装中**　PR: （未作成）

## 目的

quiz 開始フォームに「ブックマークのみ」チェックボックスと掲載箇所「指定なし」（ブックマーク全件モード）を配線し、プレビュー連動・デフォルト設定画面・drill ラベルまで対応して機能を完成させる（終端チケット）。

スコープ外: なし（本チケットで bookmark 機能の全導線が揃う）。

## 依存チケット

- 03: 除外内訳の `noNumber: number | null` 化と start-form.tsx の型ガード（先行変更）を前提とする（同ファイルの直列化）
- 04: `quizRangeInputSchema` の bookmarkedOnly / occurrenceId optional（extend 波及で action 入力に反映済み）、quiz-preview（プレビューの bookmarkedOnly / 全件モード対応）、quiz-generate / drill-create / quiz-default-settings の対応、`StartFormDefaults.bookmarkedOnly` を使う

## 前提（設計決定の再掲）

- チェックボックス「ブックマークのみ」は出題範囲ブロック内、番号範囲 Input の後（`checked` ＋ `onCheckedChange` の既存 Checkbox パターン）（[04-ui.md](../../design/bookmark/04-ui.md) 決定 6）
- 掲載箇所 Select の先頭に「指定なし」を常時表示する。「ブックマークのみ」OFF ＋「指定なし」は開始不可とし、従来の未選択と同じ扱いでプレビュー欄（aria-live）に案内を表示する。idle 文言は「掲載箇所を選択してください」から、ブックマークのみ ON なら指定なしで全件テストできる旨を含む文言に更新する（[04-ui.md](../../design/bookmark/04-ui.md) 決定 6）
- 掲載箇所が未指定の間は番号範囲 Input を disabled にし、送信時の rangeFrom / rangeTo は未指定（undefined）として送る。入力テキスト自体は保持し、掲載箇所を選び直せばそのまま復活する（「掲載箇所未選択＋範囲指定」をスキーマが拒否する組が UI から送信されないようにする）（[04-ui.md](../../design/bookmark/04-ui.md) 決定 6、クロスフィールド検証は [03-quiz-scope.md](../../design/bookmark/03-quiz-scope.md) 決定 3）
- プレビュー連動: 取得条件は「掲載箇所が指定あり、または bookmarkedOnly=true」（＝開始しうる入力のとき）。どちらでもなければ idle 案内。`getQuizPreview` の引数と debounce 用 requestKey に `bookmarkedOnly` を追加する（300ms debounce・鮮度判定の既存方式踏襲）。除外内訳表示（ExcludedNote）は `noNumber` が null のとき項目を省略する（型ガードは 03 で導入済み）。対象 0 件はプレビュー 0 件表示＋開始ボタン無効の既存流儀のまま（[04-ui.md](../../design/bookmark/04-ui.md) 決定 6、[03-quiz-scope.md](../../design/bookmark/03-quiz-scope.md) 決定 7）
- `canStart` は「(occurrenceId 指定あり または bookmarkedOnly=true) ∧ format 選択済み ∧ preview.targetCount > 0 ∧ timeout 整合」に更新する（[04-ui.md](../../design/bookmark/04-ui.md) 決定 6）
- デフォルト設定画面（quiz-defaults-form.tsx）にも「ブックマークのみ」チェックボックスを追加する。開始画面の「デフォルトとして保存」対象にも含める（保存側は 04 対応済み）。Occurrence 削除の SetNull で「occurrenceId null ＋ range 残存」のデフォルトを読み込んだ場合は、値のクリアや保存側の修正はせず「未指定時は範囲 Input disabled ＋送信から除外」でそのまま無害化する（掲載箇所を選び直せば残存 range が復活し再利用できる）（[04-ui.md](../../design/bookmark/04-ui.md) 決定 7、[03-quiz-scope.md](../../design/bookmark/03-quiz-scope.md) 決定 6）
- drill の出題条件ラベル（drill 一覧の行 ActiveDrillRow ＝実効範囲ベース、完了画面の元テストラベル sourceTestLabelOf ＝元テストの指定範囲ベース）（[04-ui.md](../../design/bookmark/04-ui.md) 決定 8）:
  - 掲載箇所なし（全件モード）の drill: 「ブックマークのみ」（範囲数値なし）
  - 掲載箇所あり＋ sourceBookmarkedOnly=true: 「{掲載箇所} No.100〜200（ブックマークのみ）」
  - 完了画面の既存「（範囲指定なし）」分岐との組み合わせ: 「{掲載箇所}（範囲指定なし・ブックマークのみ）」のように併記（drill 一覧の行は掲載箇所ありなら常に実効範囲の数値を持つため、この分岐は完了画面側のみ）
  - ブックマーク条件なしの drill は現行表記のまま
- プレビューの server 側（quiz-preview.ts の bookmarkedOnly / occurrenceId 未指定対応）は 03・04 で完了済み。action の getQuizPreview は quiz-preview.ts へ委譲しているだけのため本チケットでも変更しない。本チケットはクライアント側で `bookmarkedOnly` を入力に含めて送り、debounce 用 requestKey に加えるのみ（設計ハブ「変更対象の一覧」、[04-ui.md](../../design/bookmark/04-ui.md) 決定 6）

## 実装内容

### 変更: `src/app/quiz/_components/start-form.tsx`

前提のとおり: チェックボックス追加・「指定なし」項目・範囲 Input の disabled ＋送信除外（テキスト保持）・プレビュー取得条件と requestKey・idle 文言・canStart・「デフォルトとして保存」への bookmarkedOnly 反映・ActiveDrillRow のラベル分岐（`ActiveDrill` の nullable 化は 04 済み）。

### 変更: `src/app/quiz/_components/quiz-flow.tsx`

- `sourceTestLabelOf` のラベル分岐（前提の 3 パターン）。再テスト（sourceTest 復元）は 04 対応済み
- 完了画面の再テスト前ライブプレビュー（`getQuizPreview` 呼び出し）に sourceTest 由来の `bookmarkedOnly` / 未指定 `occurrenceId` を含める（含めないと全件モード drill で入力検証に落ち、ブックマーク条件付き drill で件数が非絞り込みになる）（設計ハブ「変更対象の一覧」、[03-quiz-scope.md](../../design/bookmark/03-quiz-scope.md) 決定 5 の帰結）

### 変更: `src/app/settings/quiz-defaults/_components/quiz-defaults-form.tsx`

「ブックマークのみ」チェックボックス追加＋「指定なし」時の範囲 Input disabled ＋送信除外（SetNull 残存の無害化を含む）。

## 完了条件（Definition of Done）

- [ ] E2E（e2e-verify スキルの手順）: quiz「ブックマークのみ」開始の 2 経路 — 掲載箇所あり＋チェック ON（範囲と AND）／掲載箇所「指定なし」＋チェック ON（全件モード、掲載番号なし単語も出題対象）。ブックマーク 0 件＋チェック ON でプレビュー 0 件・開始不可。drill 作成後のラベル表記（全件モード「ブックマークのみ」）と再テストの復元（完了画面のライブ件数がブックマーク条件を反映すること）（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 5）
- [ ] デフォルト設定に bookmarkedOnly を保存 → 開始フォーム初期値へ反映される（手動確認）
- [ ] `pnpm lint` / `pnpm typecheck` が通る（スキーマ・保存系のテストは 03・04 で担保済み）

## 競合注意

- `src/app/quiz/_components/start-form.tsx`: 03 が型ガード 1 行を先行変更している（09 は 03 に依存するため直列）

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
