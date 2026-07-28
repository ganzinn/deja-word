# ADR-0072: 掲載番号順出題（出題順の決定を buildQuiz に集約）

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-28

## 背景

quiz の出題順は常にランダム（Fisher–Yates、[ADR-0028](0028-rng-injected-pure-generation.md)）だった。一方で「教材の掲載順にひととおり通す」使い方（記憶がまだ薄い範囲を教材と同じ順序でなぞる、教材を見ながら答え合わせする）ができない。掲載番号（`WordOccurrence.occurrenceNumber`、[ADR-0011](0011-occurrence-concept-many-to-many.md)）は既に範囲指定の基盤（[ADR-0022](0022-quiz-source-occurrence-range.md)）として存在するため、これを出題順のキーにもできる。

実装上の論点は 3 つあった。

1. **どこで順序を決めるか**: 出題順は 10 個の形式ビルダー（`generation/*.ts`）がそれぞれ `fisherYatesShuffle(material.targets, rng)` で決めていた。設定をビルダーへ引き回すと 10 箇所の分岐になり、しかも設定によって RNG の消費列が変わって [ADR-0028](0028-rng-injected-pure-generation.md) のシード付きテストの前提が崩れる。
2. **掲載番号を持たないモードの扱い**: ブックマーク全件モード（[ADR-0070](0070-bookmark-all-scope-quiz.md)）は掲載箇所を指定しないため、並べ替えキーが存在しない。
3. **定着モード（drill）との整合**: [ADR-0039](0039-drill-reshuffle-each-round.md) は「位置記憶の防止」を理由にラウンドごとの再シャッフルを決めている。

## 決定内容

**掲載番号の昇順で出題する設定 `orderByOccurrenceNumber`** を追加する。既定は OFF（＝従来どおりランダム）。

- **出題順の決定は `buildQuiz`（`generation/build-quiz.ts`）に集約する**。各形式ビルダーは従来どおり常に Fisher–Yates で組み立て、`buildQuiz` が **生成後の問題配列を掲載番号の昇順へ並べ替える**（`generation/order.ts` の `orderQuestionsByOccurrenceNumber`）。問題は出題対象 1 語につき 1 問で互いに独立なため、「対象を並べてから作る」と「作ってから並べる」は同値。
  - この形にしたことで、ビルダー 10 個と既存 unit テストは無変更のまま、**RNG の消費列が出題順設定に依存しない**（同じシードなら設定によらず同じ問題データが得られ、順序だけが変わる）。
  - **選択肢（ダミー）の並びは掲載番号順でもランダムのまま**。固定するのは出題順だけ。
- 並べ替えキーは `fetchQuizSource` の出題対象行に対象 Occurrence への紐付き（`wordOccurrences`）の掲載番号を含めて取得する（`@@unique([wordId, occurrenceId])` により該当行は高々 1 件）。追加クエリは発行しない（[ADR-0030](0030-dummy-pool-bounded-fetch.md) の有界フェッチを維持）。
- **掲載箇所を指定したときのみ有効**。全件モード（掲載箇所未指定、ADR-0070）は掲載番号を持たないため設定を無視してランダムのままとし、UI 側でもトグルを disabled にする。掲載番号を持たない出題対象（drill 救済経路の例外、[ADR-0067](0067-drill-unaskable-members.md)）は末尾へ寄せ、見出し語の辞書順で安定させる。
- **定着モード（drill）にも引き継ぐ**。`Drill.orderByOccurrenceNumber` に元テストの指定を保存し、全ラウンド・再テスト・「同じ問題で再テスト」で同じ昇順にする（形式・制限時間と同じ流儀。[ADR-0038](0038-drill-inherits-format-timeout.md)）。これは [ADR-0039](0039-drill-reshuffle-each-round.md) の**明示的な例外**（下記「影響」）。
- 設定の持ち方は「ブックマークのみ」（ADR-0070）と同型: 開始画面のトグル ＋ `QuizDefaultSetting.orderByOccurrenceNumber`（null = アプリ既定 OFF）＋ 設定画面。開始画面の「この設定をデフォルト設定とする」で保存される。

## 採らなかった代替案

- **各形式ビルダーに設定を引き回して分岐する** — 10 箇所の変更に加え、設定によって RNG の消費列が変わり ADR-0028 のシード付きテストが設定ごとに二重化する。生成後の並べ替えなら 1 箇所で済み、既存テストの前提も保てるため却下。
- **SQL の `ORDER BY` で並べる** — 掲載番号は `Word` の列ではなく多対多の中間テーブル（`WordOccurrence`）にあるため、`prisma.word.findMany` の `orderBy` では表現できない。また出題順の決定がクエリ層へ漏れ、drill の救済経路（範囲外メンバーを別述語で取得）と整合させにくい。
- **並べ替え用に専用クエリを 1 本足す** — 設定 ON のときだけとはいえ往復が 1 回増える。既存の出題対象クエリに列を足すだけで足りるため却下。
- **昇順/降順を選べるようにする** — 教材をなぞる用途に降順の需要が無く、設定列が boolean から enum になり `Drill` 側にも波及する。必要になったら拡張する（2026-07-28 ユーザー確認）。
- **全件モードで見出し語順にフォールバックする** — 「掲載番号順」という名前と実挙動が乖離する。設定を無効化して理由を UI に明示する方が誤解が無い（2026-07-28 ユーザー確認）。
- **テスト（quiz）だけに適用し drill はランダムのまま** — 元テストを掲載順で通した直後の定着モードだけ順序が変わるのは一貫しない。ADR-0039 の趣旨（位置記憶の防止）はユーザーが明示的に選んだ場合には劣後させる（2026-07-28 ユーザー確認）。

## 影響

- **[ADR-0039](0039-drill-reshuffle-each-round.md) の例外**: 掲載番号順を選んだ drill はラウンドごとに再シャッフルされず、毎回同じ昇順になる。位置・順番で覚えてしまうリスクはユーザーが明示的に選んだ場合に限り受け入れる（既定は従来どおり再シャッフル）。ADR-0039 側にも本 ADR への参照を補記する。
- `fetchQuizSource` の戻り値のうち**出題対象行だけ**が `wordOccurrences`（掲載番号）を持つ。ダミー候補プールの行は持たない（並べ替えるのは出題対象だけのため）。全件モードでは常に空配列になる。
- `buildQuiz` は discriminated union（`QuizQuestionsPayload`）を組み直すため、並べ替え後の再構築に 1 箇所だけ型アサーションを使う。並べ替えは `QuestionBase` の `wordId` / `headword` しか参照せず要素の実体を変えないため安全。
- 出題形式の追加時に増える手当てはない（出題順は形式非依存。`src/lib/quiz/CLAUDE.md` のチェックリストは変更不要）。

## 根拠（設計・コード・文書参照）

- 仕様の分岐点 4 点（適用範囲＝テスト＋定着 / 全件モードは無効化 / 開始画面トグル＋デフォルト保存 / 昇順のみ）は 2026-07-28 にユーザーが選択
- `src/lib/quiz/generation/order.ts`（並べ替えの純関数）/ `src/lib/quiz/generation/build-quiz.ts`（出題順の集約点）
- `src/lib/quiz/queries/quiz-source.ts`（出題対象行の掲載番号取得）/ `src/lib/quiz-generate.ts` / `src/lib/drill-round-generate.ts` / `src/lib/drill-retry-generate.ts`
- `prisma/migrations/20260728125829_add_quiz_order_by_occurrence_number`
- 前提 ADR: [0011](0011-occurrence-concept-many-to-many.md)（掲載番号）/ [0022](0022-quiz-source-occurrence-range.md)（掲載箇所＋範囲）/ [0028](0028-rng-injected-pure-generation.md)（RNG 注入）/ [0030](0030-dummy-pool-bounded-fetch.md)（有界フェッチ）/ [0038](0038-drill-inherits-format-timeout.md)（drill の設定引き継ぎ）/ [0039](0039-drill-reshuffle-each-round.md)（本 ADR が例外を立てる対象）/ [0070](0070-bookmark-all-scope-quiz.md)（全件モード）
