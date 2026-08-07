# quiz E2E リファレンス（セレクタ・出題形式・データ事情）

skill `e2e-verify` の補助資料。**quiz 機能をブラウザ自動化で検証するとき**のセレクタと dev データの事情をまとめる。現時点で quiz 用の E2E スクリプトは未実装（`scripts/e2e/verify-*.ts` に無い）。これは**それを書くときの下敷き**であり、UI が変わったら**コードを一次情報**として更新すること（各節末に参照ファイルを挙げる）。

前提（起動・ログイン・ハーネス）は [SKILL.md](../SKILL.md) を参照。一般ユーザーは `test1@example.com` を使い回す。出題データの用意は下の「データ事情」を必ず読む（seed では出題できない）。

## 開始画面のセレクタ（`src/app/quiz/_components/start-form.tsx`）

| 項目 | セレクタ | 備考 |
|---|---|---|
| 掲載箇所 | `#quiz-occurrence`（Select） | Label「掲載箇所」。まず選ぶ。 |
| 範囲 from | `#quiz-range-from`（`getByLabel("掲載番号（から）")`） | セクション Label は「掲載番号範囲」。 |
| 範囲 to | **id 無し** → `getByLabel("掲載番号（まで）")` | to には id が無いので aria-label で取る。 |
| ブックマークのみ | Checkbox「ブックマークのみ」 | 全件ブックマークモードの入口。 |
| 出題数 | `#quiz-question-count`（Input） | 空欄 = 全問出題。対象からランダムに選ぶ。 |
| 出題形式 | `#quiz-format`（Select） | カテゴリ別グループ（`英語→日本語` / `日本語→英語`）。 |
| 掲載番号順トグル | Checkbox「掲載番号順に出題する」 | 掲載箇所未選択時は disabled。 |
| 制限時間トグル | Checkbox「1 問ごとに制限時間を設定する」 | 下記の自動入力に注意。 |
| 制限時間（秒） | `getByLabel("制限時間（秒）")` | トグル ON のときだけ出現する numeric 入力。 |
| 開始 | ボタン「開始」 | `disabled` 条件は下記。 |
| 対象語数 | テキスト `対象 N語`（id 無し） | プレビュー結果。0 語だと開始不可。 |

その他のチェックボックス: 「選択肢に最初の訳語だけを表示する」（形式が `CHOICE` のときだけ表示）、「この設定をデフォルト設定とする」。**data-testid は無い**ので上記の id / role+ラベル文言 / aria-label / ボタン文言で取る。

### 落とし穴
- **Checkbox は id セレクタで操作しない**（id は不可視の hidden input に付き click がタイムアウトする）。`getByRole("checkbox", { name: "<ラベル文言>" })` で取り、`aria-checked` が目的状態と違うときだけ click する。Input / Select の id は従来どおり使える。
- **`input[inputmode="numeric"]` の nth(0)/nth(1) で範囲を取らない**。制限時間トグルが ON になると 3 つ目の numeric 入力（制限時間（秒））が増え、nth のインデックスがずれる。範囲は `#quiz-range-from` と `getByLabel("掲載番号（まで）")` で取る。
- **形式を選ぶと制限時間が自動入力される**。`#quiz-format` を選ぶと、その形式の**保存済み推奨秒**が入り制限時間トグルが ON になることがある（未保存ユーザーでもトグル操作で `DEFAULT_TIMEOUT_SECONDS` が入る）。自動化を単純化したいなら**選択後に制限時間トグルを明示的に OFF** にする。
- **「開始」ボタンの disabled は 0 語だけが理由ではない**。`掲載箇所 未選択` / `形式 未選択` / `プレビュー ロード中` / `制限時間 ON なのに秒が空` でも disabled。開始できないときはこれらを疑う。

## 出題形式（`src/lib/quiz/format-options.ts`、全 10 形式）

- **英語→日本語**: `CHOICE`（四択）, `SELF_JUDGE`（自己判定）, `MULTI_MEANING`（多義語選択）, `CHOICE_TG`（TG四択）, `SELF_JUDGE_TG`（TG自己判定）
- **日本語→英語**: `CHOICE_JA_EN`（四択）, `SELF_JUDGE_JA_EN`（自己判定）, `SPELLING`（スペル確認）, `CHOICE_TG_JA_EN`（TG四択）, `SELF_JUDGE_TG_JA_EN`（TG自己判定）

**自動化が最易なのは自己判定（自己申告）形式**＝ `SELF_JUDGE` / `SELF_JUDGE_JA_EN` / `SELF_JUDGE_TG` / `SELF_JUDGE_TG_JA_EN` の 4 つ。選択肢の正解判定やスペル入力が不要で、「解答を表示」→ 3 判定ボタンを押すだけ。手軽さで選ぶなら英→日の **`SELF_JUDGE`**。**`*_TG` 系は TG 例文データが前提**（下記「データ事情」）。

## 進行中：自己判定パネル（`src/app/quiz/_components/self-judge-panel.tsx`）

4 つの自己判定形式が共通で使うパネル。

1. 「**解答を表示**」ボタン（`getByRole("button", { name: "解答を表示" })`）を押す。
2. 表示後に 3 つの判定ボタン: 「**合っていた**」（内部 `CORRECT`）/「**うろ覚え**」（`VAGUE`）/「**間違っていた**」（`INCORRECT`）。押すと次の問題へ。
3. **制限時間切れで自動表示された場合**は 3 判定ボタンが出ず「**次へ**」1 つに置き換わる（正誤は時間切れとして確定済み）。制限時間 OFF ならこのケースは起きない → 自動化が単純になる。

## 結果画面（`src/app/quiz/_components/result-list.tsx`、`mode === "TEST"` のときのみ）

テスト結果からドリル（復習）へ進む前に「定着までの回数」を設定できる。ラウンド数を制御したいときに使う。

| 入力 | セレクタ | 可視ラベル | 出現条件 |
|---|---|---|---|
| 間違えた問題の残数 | `#result-remaining-reset` | **「間違えた問題」** | 常時 |
| うろ覚えの残数 | `#result-remaining-vague` | 「うろ覚えの問題」 | 常時 |
| 正解の残数 | `#result-remaining-correct` | 「定着までの回数」 | 「正解した問題も定着モードで出題する」トグル ON 時のみ |

- 値を**小さくするとドリルのラウンド数が減る**（1..9）。
- **`getByLabel("定着までの回数")` は曖昧**（セクション見出しと `#result-remaining-correct` の両方に一致）。id で取ること。`#result-remaining-reset` の可視ラベルは「間違えた問題」であって「定着までの回数」ではない点に注意。
- 「間違えた問題だけ表示」「正解した問題も定着モードで出題する」は Checkbox（上記落とし穴のとおりラベル文言で取る）。

## データ事情（⚠ seed から再現不可・各自の dev DB 依存 → 毎回ライブ確認）

**出題データは seed では入らない。** `prisma/seed.ts` は system ユーザー行だけを作る（掲載箇所・語・例文は作らない）。したがって:

- **掲載箇所と語**（例:「英単語ターゲット1900」相当）は**手動 `pnpm db:import-words`** で投入する（CSV ヘッダは `headword,part_of_speech,meaning_text`。email 無し＝ system 所有の共有マスタ。CSV はリポジトリ未コミット）。→ どの掲載箇所・何番まであるかは**各自の dev DB による**。
- **TG 例文**（`Example.kind=TARGET`。`*_TG` 形式が必要とする）は**どの committed スクリプトも作らない**。単語編集 UI で手入力した ad-hoc データ（過去の dev DB では例として mean・decide 等の少数のみ TG 例文あり）。→ **TG 形式の検証範囲は実データを見て決める**。開始フォームは「TG例文なしの単語 N語…対象外」と表示するので、それを見て範囲を絞る。

**結論**: quiz の自動化を書くときは、掲載箇所名・範囲・どの形式に十分な対象語があるかを**その環境で必ずライブ確認**してから範囲・形式を決める。ここに固定の番号を書いても環境差で外れる。

## セレクタの一次情報（UI 変更時はこちらを正とする）

- 開始画面: `src/app/quiz/_components/start-form.tsx`
- 自己判定パネル / 各問題: `src/app/quiz/_components/self-judge-panel.tsx`, `question-self-judge.tsx`, フロー分岐は `quiz-flow.tsx`
- 結果画面: `src/app/quiz/_components/result-list.tsx`
- 形式の定義・グループ・自己判定/TG 判定: `src/lib/quiz/format-options.ts`
- 出題データの由来: `prisma/seed.ts`（system ユーザーのみ）, `scripts/import-words.ts`（`db:import-words`）
