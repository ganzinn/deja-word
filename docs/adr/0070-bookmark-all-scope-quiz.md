# ADR-0070: ブックマーク全件モード（掲載箇所なし出題）

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-16

## 背景

ブックマーク機能（[ADR-0069](0069-bookmark-per-user-side-table-start-time-eval.md)）では、quiz の「ブックマークのみ」絞り込みを掲載箇所（Occurrence）× 掲載番号範囲と AND で効かせる。加えて、掲載箇所を指定せず「ブックマーク済みの苦手単語を範囲横断で全件復習する」導線を用意したい。

ここで [ADR-0022](0022-quiz-source-occurrence-range.md)（出題対象は掲載箇所＋掲載番号範囲、範囲内全件出題）と衝突する。ADR-0022 は「掲載番号なしの単語は出題対象外」を含み、出題対象の述語（`fetchQuizSource` / `countQuizTargets` / `countQuizSourceExclusions`）はすべて対象 Occurrence への番号付きリンクを要求している。ブックマークは掲載箇所を横断する per-user の集合であり、番号の有無で復習対象から漏らすのはユーザーの期待に反する。

## 決定内容

掲載箇所を指定しない「ブックマーク全件モード」を、ADR-0022 の**明示的な例外**として導入する。`occurrenceId` 未指定（null）＋「ブックマークのみ」を全件モードとし、出題クエリ 3 関数（`src/lib/quiz/queries/quiz-source.ts`）の `occurrenceId` 引数を null 許容に広げて次のとおり振る舞わせる。

- 対象述語は `bookmarks: { some: { userId } }` ∧ 適格性（可視な意味 or 使える TG 例文）のみ。掲載箇所・掲載番号の条件は課さない。したがって**掲載番号なし・掲載箇所未紐付けの単語も出題対象になる**（ADR-0022 の「掲載番号なしは対象外」を本モードでは適用しない）。
- 掲載箇所の可視性検証（`assertOccurrenceVisible`）は `occurrenceId` があるときのみ行う。
- 除外内訳: `noNumber` は掲載箇所の概念がないため `null`（`noMeaning` / `noTgExample` の形式排他 null と同じ流儀）。`noMeaning` / `noTgExample` はブックマーク済み全体にスコープして数える。
- ダミー供給（[ADR-0026](0026-dummy-choices-same-occurrence-first.md)）: 同一掲載箇所プール（`sameOccurrenceRows`）は概念がないため常に空、補完プール（`fallbackRows`）は全登録単語（ブックマーク外を含む）。ADR-0026 の優先順（同一掲載箇所 → 全単語）の自然な縮退で、[ADR-0030](0030-dummy-pool-bounded-fetch.md) の有界フェッチ・`selectDummies` は無変更で成立する。ダミーにブックマーク条件は課さない（ADR-0069）。
- drill ラウンド・再挑戦の救済（`ensureTargetWordIds`）は、掲載箇所指定時の「番号付きリンク」条件に代えて適格性のみを課す（番号条件を課す対象の掲載箇所がないため）。
- 履歴（QuizAnswer）は範囲情報を持たないため無変更。

入力の形としての妥当性（`occurrenceId` 未指定を許すのは「ブックマークのみ」かつ範囲未指定のときだけ）は quiz 入力スキーマのクロスフィールド検証で担保する（配線は bookmark 実装チケット 04）。

## 採らなかった代替案

- **全件モードでも掲載番号あり単語に限定する** — ブックマークは掲載箇所横断の集合であり、番号の有無で復習対象から漏れるのはユーザーの期待に反するため却下。
- **`occurrenceId` 必須を維持し全件モードを別エンドポイントに分ける** — プレビュー・開始・デフォルト設定の全経路が二重になり、出題述語の契約（count 系と fetch 系の一致、ADR-0030）も二重管理になるため却下。3 関数の `occurrenceId` null 許容化で足りる。

## 影響

- ADR-0022 の「掲載番号なしは対象外」「出題対象は掲載箇所＋番号範囲」は**掲載箇所指定モードの規則**であり、全件モードはその明示的例外であることを ADR-0022 側にも補記する。
- 出題述語 3 関数は掲載箇所指定モードと全件モードの二系統を持つが、いずれも「count 系＝fetch 系」の一致契約（ADR-0030）を保つ。
- Drill を掲載箇所なしに対応させるスキーマ変更（`occurrenceId` / `rangeFrom` / `rangeTo` の nullable 化・`sourceBookmarkedOnly` 追加）と入力スキーマのクロスフィールド検証は bookmark 実装チケット 04 の範囲。本 ADR は出題クエリ側の例外を確定する。

## 根拠（設計・コード・文書参照）

- docs/design/bookmark/03-quiz-scope.md 決定 3（全件モードの仕様）・決定 2（ダミー非適用）
- docs/design/bookmark/05-architecture.md 決定 4（実装配置）・決定 6（本 ADR の起票方針）
- `src/lib/quiz/queries/quiz-source.ts`（`fetchQuizSource` / `countQuizTargets` / `countQuizSourceExclusions` の `occurrenceId: string | null` ＋ `bookmarkedOnly`）
- 前提 ADR: [0022](0022-quiz-source-occurrence-range.md)（本 ADR が例外を立てる対象）/ [0026](0026-dummy-choices-same-occurrence-first.md)（ダミー優先順）/ [0030](0030-dummy-pool-bounded-fetch.md)（有界フェッチ・count/fetch 一致）/ [0069](0069-bookmark-per-user-side-table-start-time-eval.md)（ブックマーク基盤）
