# コンテキストネーミングブック

このリポジトリのドメイン固有用語の対訳・定義集。AI エージェントがコード・ドキュメントを読み書きするときの命名判断の基準にする。

- 構成は 3 セクション: **本体**（確定した用語）/ **ブレ一覧**（複数の名前が併存し正規化提案が保留のもの）/ **要確認リスト**（コードから定義を確定できず人間の回答待ちのもの）。
- ブレ・要確認が解消されたら、本体へエントリを昇格させて該当項目を消す。
- 用語確認から出た「将来対応の意向」は本書に溜めず GitHub issue に起票し、本体エントリから issue 番号で参照する（運用ルールは AGENTS.md のバックログ節）。
- 出典の行番号は 2026-07-04 時点。ずれても近傍を検索すれば見つかる。

---

## 1. ネーミングブック本体

### 1-1. 単語コンテンツ系

#### Word（単語）

- 英語名: `Word`（モデル）
- 日本語名: 単語
- 定義: ドメインの中心エンティティ。見出し語（headword）を持ち、意味・例文・関連語・メモ・掲載箇所を子に持つ。`@@unique([ownerId, headword])` で所有者内一意。
- 混同注意: 単語「エンティティ」を指す。見出しの英単語文字列そのものは `headword`。
- 出典: prisma/schema.prisma:116

#### headword（見出し語）

- 英語名: `headword`（`Word.headword`）
- 日本語名: 見出し語
- 定義: 単語エンティティの見出しとなる英単語文字列。
- 混同注意: 関連語の語は `term`（`RelatedWord.term`）であり headword と呼ばない。一般編集者は system 行の headword を変更できない（`assertHeadwordChangeAllowed`）。
- 出典: prisma/schema.prisma:119, src/lib/words/policy/row-policy.ts:29

#### Meaning（意味）

- 英語名: `Meaning`（モデル）
- 日本語名: 意味
- 定義: 単語の「意味単位」。品詞（partOfSpeech）＋発音記号（pronunciation）＋発音音源（pronunciationAudioUrl）を持ち、訳語テキストは子の MeaningText が持つ。
- 混同注意: `meaning` は多義（→ブレ一覧 4）。エンティティとしての Meaning と、`Example.meaning` / `RelatedWord.meaning`（「訳」を表す String フィールド）は別物。訳語そのものは MeaningText。
- 出典: prisma/schema.prisma:138

#### MeaningText（訳語）

- 英語名: `MeaningText`（モデル）
- 日本語名: 訳語
- 定義: 意味（Meaning）に属する訳語テキスト 1 件。1 意味に複数、`sortOrder` 順。四択の選択肢・多義語選択の単位になる。
- 混同注意: 「意味未登録の単語」とは可視 MeaningText が 0 件の単語を指す（非 TG 形式の出題対象外条件）。
- 出典: prisma/schema.prisma:157, src/lib/quiz/queries/quiz-source.ts:275

#### partOfSpeech（品詞）

- 英語名: `partOfSpeech`（DB カラム `part_of_speech`）、定数は `CommonPartOfSpeech`
- 日本語名: 品詞
- 定義: 意味・関連語が持つ品詞。定数リストは noun / verb など 10 種で、`value`（英語キー）+ `label`（1 字略号「名」「動」）+ `fullLabel`（「名詞」）の 3 表記を持つ。
- 混同注意: `src/lib/mock/` 配下だがテストダブルではなく本番用定数（→ 1-9 mock）。
- 出典: prisma/schema.prisma:142, src/lib/mock/parts-of-speech.ts:7

#### pronunciation（発音記号）

- 英語名: `pronunciation`
- 日本語名: 発音記号（発音表記）
- 定義: 意味・関連語が持つ発音の文字表記（IPA 等）。
- 混同注意: 音源（音声ファイル）は `pronunciationAudioUrl`。`pronunciation` 単体は常に「表記」を指す。ただし設定フラグ `autoplayPronunciation` は「音源の自動再生」の意（→ブレ一覧 5）。
- 出典: prisma/schema.prisma:143

#### pronunciationAudioUrl（発音音源）

- 英語名: `pronunciationAudioUrl`（DB カラム `pronunciation_audio_url`）
- 日本語名: 発音音源
- 定義: 英単語（Meaning）・関連語（RelatedWord）の発音音声ファイル（mp3）の URL。dev 環境では相対 key を保存し実体は `.dev-blob/` に置く。
- 混同注意: 「意味読み上げ音源」`translation_audio_url` は 2026-06-14 に廃止済み（migration `20260614071602_remove_translation_audio_url`）。translation audio という概念は使わない。
- 出典: prisma/schema.prisma:145, prisma/schema.prisma:231

#### Example（例文）

- 英語名: `Example`（モデル）
- 日本語名: 例文
- 定義: 単語に付く例文。`kind`（ExampleKind）で種別分けされ、`meaning` フィールドに日本語訳を持つ。
- 混同注意: `Example.meaning` は「例文の訳」であり Meaning エンティティへの参照ではない（→ブレ一覧 4）。
- 出典: prisma/schema.prisma:187

#### ExampleKind（例文種別）

- 英語名: `ExampleKind`（enum: `SENTENCE` / `PHRASE` / `TARGET` / `MINIMAL`）
- 日本語名: 例文種別。UI ラベルは SENTENCE=例文 / PHRASE=成句・熟語 / TARGET=TG / MINIMAL=MP
- 定義: 例文の種別。使い分けは「完全な文なら SENTENCE、句なら PHRASE」（2026-07-04 ユーザー確認）。`TARGET`（TG）は quiz の TG 形式（形式 7〜10）の出題素材。`MINIMAL`（MP）は内容上 PHRASE と同じ「句」だが、将来テストに出題させる想定で種別を分けている（→ MP例文）。
- 混同注意: MINIMAL を「PHRASE と同じだから」と統合しない（出題対象化のための意図的な区別）。
- 出典: prisma/schema.prisma:103, src/lib/mock/example-kinds.ts:5

#### TG例文（TARGET）

- 英語名: `Example.kind = TARGET`。関連定数 `TG_EXAMPLE_FORMATS`、述語 `isTgExampleFormat` / `usableTgExampleWhere`
- 日本語名: TG例文（ターゲット例文）
- 定義: quiz の TG 形式の素材となる例文。「使える TG 例文」= `kind=TARGET` かつ `meaning` が非 null・非空。出題は使える TG 例文のうち `sortOrder` 最小の 1 件・1 単語 1 問。A / B / do / doing / 〜 / 括弧のプレースホルダをハイライト描画する（英文=`tg-text` 青太字、和訳=`tg-meaning` 赤）。
- 混同注意: TG 形式では単語自身の意味（MeaningText）の有無を問わない（meaning 非依存）。TG は enum 値 `TARGET` の UI 略記。
- 出典: src/lib/quiz/queries/quiz-source.ts:41, src/components/tg-example-text.tsx

#### MP例文（MINIMAL / ミニマルフレーズ）

- 英語名: `Example.kind = MINIMAL`（UI ラベル「MP」）
- 日本語名: ミニマルフレーズ
- 定義: 英単語を長い例文ごと覚えるのではなく、その単語の使い方が分かる 2〜5 語程度の「最小限（minimal）」の短いフレーズ。「システム英単語」のミニマルフレーズを想定した種別（2026-07-04 ユーザー確認）。
- 混同注意: 内容上は PHRASE（句）と同じだが、将来テスト出題の素材にする想定で分けている。現時点で MP を素材にする出題形式は未実装（対応予定: issue #96）。
- 出典: prisma/schema.prisma:103, src/lib/mock/example-kinds.ts:9

#### RelatedWord（関連語）

- 英語名: `RelatedWord`（モデル）。語そのものは `term`、他単語への参照は `linkedWordId` / `linkedWord`
- 日本語名: 関連語
- 定義: 単語に付く類義・対義・派生語。`term`（語）・`kind`（RelatedKind）・`meaning`（訳）・発音記号・発音音源を持ち、`linkedWordId` で同じ掲載箇所内の別 Word へリンクできる（削除時 SetNull）。
- 混同注意: `term` を headword と呼ばない。リレーション名は本体側 `RelatedWordOnWord`、リンク先側 `RelatedWordLinkedWord`。
- 出典: prisma/schema.prisma:220

#### RelatedKind（関連語種別）

- 英語名: `RelatedKind`（enum: `SYNONYM` / `ANTONYM` / `DERIVATIVE`）
- 日本語名: SYNONYM=同意語 / ANTONYM=反意語 / DERIVATIVE=派生語
- 定義: 関連語の種別。CSV インポートでは `≒`=SYNONYM、`⇔`=ANTONYM に対応する。
- 混同注意: UI ラベルは「類義語・対義語」ではなく「同意語・反意語」（src/lib/mock/related-word-kinds.ts のラベルに従う）。
- 出典: prisma/schema.prisma:110, src/lib/mock/related-word-kinds.ts:5, src/lib/meaning-text-parser.ts:14

#### note（注記）

- 英語名: `MeaningNote` / `ExampleNote` / `RelatedWordNote`（各モデルの `text`）
- 日本語名: 注記（補足説明）
- 定義: 意味・例文・関連語それぞれに複数行つけられる補足。2026-06-14 に各テーブル直持ちの単一 `note` カラムから子テーブル方式へ移行（migration `20260614100000_add_note_child_tables`）。
- 混同注意: 単語全体につくのは Memo（別概念）。旧 `note` カラムはもう存在しない。
- 出典: prisma/schema.prisma:172, prisma/schema.prisma:205, prisma/schema.prisma:244

#### Memo（メモ）

- 英語名: `Memo`（モデル）
- 日本語名: メモ
- 定義: 単語（Word）に直接つく自由記述。
- 混同注意: 意味・例文・関連語の補足は note（`*Note` 子テーブル）。単語直下だけが Memo。
- 出典: prisma/schema.prisma:259

#### Bookmark（ブックマーク）

- 英語名: `Bookmark`（モデル）
- 日本語名: ブックマーク
- 定義: ユーザー × 単語の中間テーブル。行があるとその単語をブックマーク中（ON）。苦手単語を quiz・単語一覧で絞り込むためのマーク。共有マスタ単語にも本人のブックマークを付けられる（設計: docs/design/bookmark/）。
- 混同注意: 「お気に入り」「スター」「フラグ」は使わない。quiz の定着マイルストーンは「定着」（→ 1-4）で、ブックマークとは無関係。
- 出典: prisma/schema.prisma:483

### 1-2. 掲載箇所系

#### Occurrence（掲載箇所）

- 英語名: `Occurrence`（モデル）
- 日本語名: 掲載箇所
- 定義: 単語をどこで見たか・出会ったかの記録単位。実運用では単語帳・教材名（例: ターゲット1900）が入る。`@@unique([ownerId, location])`。quiz の出題範囲の選択単位でもある。
- 混同注意: ユーザー向けメッセージの一部に「出典」表記が残る（→ブレ一覧 1）。「source」という英語名はこの概念には使わない（`sourceRange` は別概念 → 1-3 range）。
- 出典: prisma/schema.prisma:274

#### location（掲載箇所名）

- 英語名: `location`（`Occurrence.location`）
- 日本語名: 掲載箇所名
- 定義: 掲載箇所の表示名。UI・フォームでは「掲載箇所名」ラベル。
- 混同注意: 英語名 `location` は「（単語と）出会った場所」という広い意図の命名で、単語帳・教材名もそれに含まれる（2026-07-04 ユーザー確認）。実用上はテスト切り出し・まとめて確認する単位であり、より適した名前の検討余地がある（検討: issue #97）。
- 出典: prisma/schema.prisma:277, src/lib/schema/word-form.ts:88

#### WordOccurrence（単語の掲載）

- 英語名: `WordOccurrence`（モデル）
- 日本語名: 単語の掲載（単語と掲載箇所の紐付け）
- 定義: Word と Occurrence の中間テーブル。掲載番号（occurrenceNumber）を持つ。`@@unique([occurrenceId, occurrenceNumber])`。
- 混同注意: 初期実装では Occurrence が直接 `word_id` を持っていたが 2026-05-14 に本構造へ再編済み（migration `restructure_occurrence_with_word_link`）。
- 出典: prisma/schema.prisma:306

#### occurrenceNumber（掲載番号）

- 英語名: `occurrenceNumber`（DB カラム `occurrence_number`）。関連: `Occurrence.autoNumbering`（自動採番）
- 日本語名: 掲載番号
- 定義: 掲載箇所内での単語の番号（null 可）。quiz の範囲指定（rangeFrom/rangeTo）の対象で、番号なしの単語は出題対象外。`autoNumbering` が true の掲載箇所では自動採番される。
- 混同注意: 掲載箇所内で一意。関連語インポートの `⇒ N` リンクはこの番号で解決する。
- 出典: prisma/schema.prisma:312, prisma/schema.prisma:279

#### OccurrenceDetail（掲載詳細）

- 英語名: `OccurrenceDetail`（モデル、本文フィールドは `detail`）
- 日本語名: 掲載箇所内の単語の詳細
- 定義: WordOccurrence に従属する詳細テキスト（複数行）。掲載番号が無い単語の所在や、詳細な掲載場所をメモしておく欄（2026-07-04 ユーザー確認）。
- 混同注意: Memo（単語全体につくメモ）とは別。掲載箇所との関係に紐づく情報だけをここに置く。
- 出典: prisma/schema.prisma:327

#### OccurrencePresetSetting（掲載箇所プリセット）

- 英語名: `OccurrencePresetSetting`（モデル）
- 日本語名: プリセット（単語登録フォームに既定表示する掲載箇所）
- 定義: ユーザー × 掲載箇所の中間テーブル。行があると単語登録フォームにその掲載箇所が既定表示される。設定画面は `/settings/occurrences`。
- 混同注意: system 所有の「共通の掲載箇所」プリセットは 2026-06-25 にデフォルト OFF 化済み（migration `clear_system_occurrence_presets`）。
- 出典: prisma/schema.prisma:293

### 1-3. quiz 系

#### quiz（単語テスト）

- 英語名: `quiz`（ディレクトリ・コード命名の基準）
- 日本語名: 単語テスト（UI 表示）
- 定義: 単語のテスト機能全般。設計 README の命名基準:「機能名は quiz。『テスト』はソフトウェアテストと紛らわしいため、ディレクトリ名・コード上の命名は quiz を基準とする」。UI の日本語は「単語テスト」「定着モード」を使う。
- 混同注意: コード・ファイル名に `test` を使わない（`*.test.ts` はソフトウェアテスト専用）。
- 出典: docs/adr/0020-feature-named-quiz.md

#### QuizFormat（出題形式）

- 英語名: `QuizFormat`（enum、全 10 値）
- 日本語名: 出題形式。「形式 N」の番号で呼ぶ慣習（設計ドキュメント・schema コメント共通）
- 定義: enum 値 ⇔ 形式番号 ⇔ UI ラベルの対応は次のとおり。
  - `CHOICE` = 形式1 = 英語→日本語・四択
  - `SELF_JUDGE` = 形式2 = 英語→日本語・自己判定
  - `MULTI_MEANING` = 形式3 = 英語→日本語・多義語選択
  - `CHOICE_JA_EN` = 形式4 = 日本語→英語・四択
  - `SELF_JUDGE_JA_EN` = 形式5 = 日本語→英語・自己判定
  - `SPELLING` = 形式6 = 日本語→英語・スペル確認
  - `CHOICE_TG` = 形式7 = 英語→日本語・TG四択
  - `CHOICE_TG_JA_EN` = 形式8 = 日本語→英語・TG四択
  - `SELF_JUDGE_TG` = 形式9 = 英語→日本語・TG自己判定
  - `SELF_JUDGE_TG_JA_EN` = 形式10 = 日本語→英語・TG自己判定
- 混同注意: 形式 7・8 の旧称「例文四択」は「TG四択」へ改名済み（→ブレ一覧 2）。形式追加時は `src/lib/quiz/CLAUDE.md` のチェックリストに従い、既存ユーザーへの制限時間 backfill migration を伴う。
- 出典: prisma/schema.prisma:342, src/lib/quiz/format-options.ts:8

#### QuizMode（出題モード）

- 英語名: `QuizMode`（enum: `TEST` / `DRILL` / `DRILL_RETRY`）
- 日本語名: TEST=通常テスト / DRILL=定着モード / DRILL_RETRY=同じ問題で再テスト
- 定義: 解答履歴（QuizAnswer）に記録される実行モード。`DRILL_RETRY` は drill の残数（remaining）に影響しない練習。
- 混同注意: mode（いつ・どの文脈で解いたか）と format（問題の形）は直交する軸。
- 出典: prisma/schema.prisma:363

#### QuizResult（解答結果）

- 英語名: `QuizResult`（enum: `CORRECT` / `INCORRECT` / `VAGUE` / `GAVE_UP` / `TIMEOUT`）
- 日本語名: 正解 / 不正解 / うろ覚え / わからない / 時間切れ
- 定義: 1 解答の結果。`VAGUE`（うろ覚え）は正解と不正解の中間で、drill には drillIncludeCorrect 非依存で必ず投入される。`GAVE_UP` は四択・多義語選択の回答前「わからない」。`TIMEOUT` は制限時間切れ。GAVE_UP と TIMEOUT は drill の残数計算上 INCORRECT と同じ扱い。
- 混同注意: 自己判定の選択肢は「うろ覚え（VAGUE）」を含む 3 段階であり、旧選択肢「思い浮かばなかった（GAVE_UP）」は廃止済み（→ブレ一覧 3）。
- 出典: prisma/schema.prisma:355

#### QuizAnswer（解答履歴）

- 英語名: `QuizAnswer`（モデル）
- 日本語名: 解答履歴
- 定義: 1 解答 = 1 行。通常テストも drill も同形で保存する。mode / format / result を持つ。
- 混同注意: drill を削除しても解答履歴は残る。
- 出典: prisma/schema.prisma:370

#### 自己判定（SELF_JUDGE）

- 英語名: `SELF_JUDGE`（系 4 形式）。述語 `isSelfJudgeFormat`
- 日本語名: 自己判定
- 定義: 「解答を表示」した後、ユーザー自身が「合っていた / うろ覚え / 間違っていた」の 3 段階で正誤判定する形式。ダミー選択肢が不要。タイマーは解答表示まで適用。
- 混同注意: 選択肢に旧「思い浮かばなかった」は無い（「うろ覚え」へ置換済み →ブレ一覧 3）。E2E 自動化に最も向く形式。
- 出典: src/app/quiz/_components/self-judge-panel.tsx:129, src/lib/quiz/format-options.ts:110

#### 多義語選択（MULTI_MEANING）

- 英語名: `MULTI_MEANING`（形式3）
- 日本語名: 多義語選択
- 定義: 正しい意味を「すべて」選ぶ形式。選択肢の単位は MeaningText。
- 出典: prisma/schema.prisma:345, src/lib/quiz/format-options.ts

#### スペル確認（SPELLING）

- 英語名: `SPELLING`（形式6）。採点は `normalizeSpelling` / `isSpellingCorrect`
- 日本語名: スペル確認
- 定義: 日本語の意味から英単語のスペルを入力する形式。自動採点は前後空白と大文字小文字を無視。
- 混同注意: `src/lib/quiz/spelling.ts`（採点）と `src/lib/quiz/generation/spelling.ts`（出題生成）は同名別ファイル。
- 出典: src/lib/quiz/spelling.ts:5, src/lib/quiz/CLAUDE.md

#### range（出題範囲）と sourceRange（元テストの範囲）

- 英語名: `rangeFrom` / `rangeTo` と `sourceRangeFrom` / `sourceRangeTo`
- 日本語名: 出題範囲（実効範囲）と元テストの範囲
- 定義: `rangeFrom/To` は掲載番号による実効的な出題範囲。`sourceRangeFrom/To` は Drill 生成元テストで申告された範囲（null = 範囲指定なし = Occurrence 全体）で、「同じ範囲でもう一度テストする」に使う。
- 混同注意: 似た名前だが別概念。source は「出典・掲載元」の意ではない。
- 出典: prisma/schema.prisma:436, prisma/schema.prisma:440, src/lib/schema/quiz.ts:139

#### QuizDefaultSetting（テスト開始画面デフォルト）

- 英語名: `QuizDefaultSetting`（モデル）
- 日本語名: テスト開始画面のデフォルト設定
- 定義: ユーザーごと 1 行、全項目任意（部分的デフォルトを許す）。掲載箇所・範囲・形式・表示/音声フラグ（showCountdown / autoplayPronunciation / enableAnswerSound / autoplayAnswerAudioJaEn / choiceFirstMeaningTextOnly / drillIncludeCorrect / saveOnStart 等）を持つ。設定画面は `/settings/quiz-defaults`。
- 混同注意: `src/lib/quiz/default-settings.ts`（client-safe 定数）と `src/lib/quiz-default-settings.ts`（server-only UseCase）は同名系の別ファイル。
- 出典: prisma/schema.prisma:388, src/lib/quiz/CLAUDE.md

#### QuizDefaultTimeout（形式別デフォルト制限時間）

- 英語名: `QuizDefaultTimeout`（モデル、`timeoutSeconds`）
- 日本語名: 出題形式ごとのデフォルト制限時間
- 定義: ユーザー × 形式で 1 行。行が無い形式 = 制限なし。QuizFormat の enum 値追加時は既存ユーザーへ推奨デフォルトを backfill する migration を伴う（規約）。
- 出典: prisma/schema.prisma:418, prisma/CLAUDE.md

#### QuizSource（出題素材）/ target / dummy

- 英語名: `fetchQuizSource` / `countQuizTargets` / `countQuizSourceExclusions` / `DUMMY_POOL_SIZE`
- 日本語名: 出題素材 / 出題対象 / ダミー（誤答選択肢）
- 定義: `target` は出題対象の単語（掲載番号が範囲内・形式ごとの適格条件を満たす）。`dummy` は四択の誤答選択肢で、同一 Occurrence（範囲外）→ 他 Occurrence の優先順で最大 50 件（`DUMMY_POOL_SIZE`）のプールから選ぶ。プレビューは件数のみの軽量経路（`countQuizTargets` / `countQuizSourceExclusions`、除外内訳は 番号なし / 意味未登録 / TG例文なし）。
- 混同注意: 出題生成（`buildQuiz`、`generation/` 配下）は RNG を引数注入する純関数で、シードは永続しない。
- 出典: src/lib/quiz/queries/quiz-source.ts:31, src/lib/quiz/queries/quiz-source.ts:67, src/lib/quiz/payload.ts:70

#### countdown（カウントダウン）

- 英語名: `countdown`（quiz-flow の状態名）、`showCountdown`（設定フラグ）
- 日本語名: 開始時カウントダウン演出
- 定義: quiz のクライアント状態機械 `start → countdown → play → result`（URL 遷移しない）の第 2 状態。`showCountdown` で演出の有無を切り替える。形式の成立可否エラーはこの画面で表示する。
- 出典: src/app/quiz/_components/quiz-flow.tsx:80, prisma/schema.prisma:394

### 1-4. drill 系

#### drill（定着モード）

- 英語名: `Drill`（モデル）、`QuizMode.DRILL`
- 日本語名: 定着モード
- 定義: 「定着待ちプール」。元テスト 1 回から生成され、複数並存できる。間違えた（＋設定により正解した）単語をラウンド反復で出題し、全単語定着で完了（`completedAt` 設定。進行中一覧は `completedAt IS NULL`）。
- 混同注意: UI 日本語は「定着モード」。「ドリル」表記はコード外では使わない。再開導線は quiz 開始画面の一覧（メニューには置かない）。
- 出典: prisma/schema.prisma:432, docs/adr/0036-drill-remaining-count-model.md

#### remaining（残数）

- 英語名: `DrillWord.remaining`。遷移関数 `initialRemaining` / `nextRemaining`
- 日本語名: 残数（定着までの残連続正解数）
- 定義: drill 内の単語ごとのカウントダウン値（0..max）。正解で −1、うろ覚え / 誤答でリセット値に戻り、0 で定着。
- 混同注意: 「スコア加算」ではなく「残数カウントダウン」モデル。DRILL_RETRY は remaining に影響しない。
- 出典: prisma/schema.prisma:467, src/lib/quiz/generation/next-remaining.ts:35

#### 残数設定（DrillRemainingConfig）

- 英語名: `resetRemaining` / `vagueRemaining` / `initialCorrectRemaining`（型 `DrillRemainingConfig`）
- 日本語名: 誤答リセット残数（既定 3）/ うろ覚え残数（既定 2）/ 正答初期残数（既定 1）
- 定義: 残数の初期値・リセット値の 3 点セット（各 1..9）。誤答は resetRemaining、うろ覚えは vagueRemaining、正答は initialCorrectRemaining から開始する。
- 出典: src/lib/quiz/generation/next-remaining.ts:13, prisma/schema.prisma:446-448

#### 定着（単語単位）

- 英語名: `retained`（テスト名・コメント上の記述語。専用のコード識別子は無く `remaining === 0` の状態）
- 日本語名: 定着（単語単位）
- 定義: drill 内で単語の残数が 0 になり、以降のラウンドに出題されない状態。
- 混同注意: 「完了」は drill 全体（全単語定着・`completedAt` 設定）／「定着（単語単位）」は単語ごと／「定着モード」はモード名。文脈で書き分ける。**旧称「卒業」は使わない（2026-07-12 定着に統一）**。
- 出典: docs/adr/0036-drill-remaining-count-model.md, src/lib/quiz/generation/next-remaining.ts:35

#### ラウンド

- 英語名: `round`（`startDrillRound` / `submitDrillRound` / `roundCount`）
- 日本語名: ラウンド
- 定義: drill 内の 1 周（未定着の単語をすべて出題し、結果画面で区切る単位）。設計上の明文:「ユーザー説明上の『セッション』だが、テストセッション・ブラウザセッションとの混同を避けるためドキュメント・コードでは『ラウンド』と呼ぶ」。
- 混同注意: **「セッション」と呼ばない**（認証 Session・ブラウザセッションと衝突するため）。
- 出典: src/lib/schema/quiz.ts:156

#### roundCount と CAS 冪等化

- 英語名: `Drill.roundCount`、`expectedRoundCount`、`DrillRoundConflictError`
- 日本語名: 完了ラウンド数（compare-and-swap による冪等化）
- 定義: ラウンド送信の二重実行を防ぐ仕組み。クライアントが期待値（expectedRoundCount）を送り、サーバは一致時のみ +1 して確定する。不一致は `DrillRoundConflictError`（code `conflict`）。
- 出典: prisma/schema.prisma:449, src/lib/quiz/handlers/drill-round-handler.ts:19

#### drill retry（同じ問題で再テスト）

- 英語名: `QuizMode.DRILL_RETRY`、`startDrillRetry` / `submitDrillRetry`
- 日本語名: 同じ問題で再テスト
- 定義: 直前ラウンドと同じ問題を残数に影響させず解き直す練習モード。
- 混同注意: 「同じ範囲でもう一度テストする」（sourceRange を使った新規テスト）とは別機能。
- 出典: prisma/schema.prisma:366, src/lib/schema/quiz.ts:180

### 1-5. 認可・owner 系

#### system user（システムユーザー）

- 英語名: `SYSTEM_USER_ID = "system"`
- 日本語名: システムユーザー（表示名は「共通」）
- 定義: 共有マスタの所有者となる特殊ユーザー。seed で `id="system"` / `email="system@deja-word.internal"` / `name="共通"` を upsert する。管理者判定も `session.user.id === SYSTEM_USER_ID` で行う（role カラムや admin フラグは存在しない）。
- 混同注意: 「admin」「管理者ユーザー」という別エンティティは無い。system ユーザー = 共有マスタ所有者 = 管理者。
- 出典: src/lib/system-user.ts:1, prisma/seed.ts, src/app/CLAUDE.md

#### 共有マスタ

- 英語名: （`ownerId = "system"` の行。判定は `isSystemOwned`）
- 日本語名: 共有マスタ
- 定義: コンテンツ系テーブルの `ownerId="system"` 行。全ユーザーに読み取り共有される。
- 混同注意: 一般編集者は system 行を「無変更で通す」ことしかできない（→ pass-through）。
- 出典: prisma/CLAUDE.md, src/lib/words/policy/row-policy.ts:16

#### scopedOwnerIds（可視スコープ）

- 英語名: `scopedOwnerIds(userId)` → `["system", userId]`
- 日本語名: ユーザー可視の所有者スコープ
- 定義: コンテンツ系の読み取りで使う owner 条件。共有マスタ＋本人の行を引く。
- 混同注意: `ownerId: userId` 単独で読むと共有マスタが欠ける（規約違反）。
- 出典: src/lib/system-user.ts:3, src/lib/CLAUDE.md

#### owner と user の使い分け

- 英語名: `ownerId` / `owner`（コンテンツ系）、`userId` / `user`（設定系）
- 日本語名: 所有者 / ユーザー
- 定義: コンテンツ系テーブル（Word 系・Occurrence・Drill 系・QuizAnswer）は全行 `ownerId` を持ち、`"system"` 行が共有マスタになれる。設定系テーブル（UserPreference・QuizDefaultSetting 等）は `userId` 主キーで system 行を持たない。
- 混同注意: 新テーブル追加時はどちらの系かをまず決める。コンテンツ系なのに `userId` と命名しない。
- 出典: prisma/CLAUDE.md

#### EditorContext（編集者文脈）

- 英語名: `EditorContext`（`{ userId, isSystem }`）、生成は `editorContextFor`
- 日本語名: 編集者文脈（誰として書くか）
- 定義: 単語書き込みの認可 2 層の第 1 層。編集者自身が system ユーザーかどうかを持つ。
- 混同注意: コメント等に旧名 `editorIsSystem` が残るが現行は `isSystem`。
- 出典: src/lib/words/policy/editor-context.ts:8

#### row-policy と pass-through

- 英語名: `row-policy.ts`（`isPassThroughSystemRow` / `assertRowsAllowed` / `assertHeadwordChangeAllowed` / `assertNoOrphanedDeletion` / `ForbiddenUpdateError`）
- 日本語名: 行ごとの書き込み可否ポリシー / パススルー
- 定義: 認可 2 層の第 2 層。pass-through は「一般編集者が system 共通行を無変更のまま通す」こと。変更しようとすると `ForbiddenUpdateError`（code `forbidden`）。認可ルールの変更は row-policy に集約する（規約）。
- 出典: src/lib/words/policy/row-policy.ts:24, src/lib/words/CLAUDE.md

### 1-6. 音源・Blob 系

#### BlobClient

- 英語名: `BlobClient` / `defaultBlobClient`
- 日本語名: 発音音源ストレージのクライアント境界
- 定義: 音源ファイル置き場の DI 境界。`src/lib/blob-client.ts` が server-only の境界で、実装は `blob-client-impl.ts`。dev はローカルディスク（`.dev-blob/`）、本番は Vercel Blob。DB には dev では相対 key、本番では URL が入る。
- 混同注意: worktree 運用では `.dev-blob/` を本体と共有する（`DEV_BLOB_ROOT`）。共有しないと DB に key はあるのに実体 404 が起きる。
- 出典: src/lib/blob-client.ts:1, AGENTS.md

#### AudioTarget

- 英語名: `AudioTarget`（`meaningTarget` / `relatedWordTarget`）
- 日本語名: 音源の保持先ディスクリプタ
- 定義: 発音音源のアップロード・削除ロジックを Meaning / RelatedWord で共通化するための「保持先だけ差し替える」記述子。
- 混同注意: 音源の更新順序は **put → update → 旧 del** の契約（DB が削除済み URL を指す瞬間を作らない）。孤児 Blob は `bestEffortDeleteAudioUrls` で回収。
- 出典: src/lib/pronunciation-audio.ts:62, src/lib/pronunciation-audio.ts:155

#### ttsFallback（TTS 代替）

- 英語名: `UserPreference.ttsFallback`
- 日本語名: TTS 代替（端末内蔵音声での代用）
- 定義: 発音音源が未登録のとき、端末内蔵の自動音声（Web Speech API）で代用する設定。
- 混同注意: TTS は「登録済み音源の再生」ではなく「未登録時のフォールバック」。
- 出典: prisma/schema.prisma:47

### 1-7. ops・インポート系

#### bulk import（単語一括登録）

- 英語名: `bulkImportWords`（`BulkImportRow` / `BulkImportReport`）、コマンド `pnpm db:import-words`
- 日本語名: 掲載箇所＋単語＋意味の CSV 一括登録
- 定義: 掲載箇所を新規作成して単語を一括登録する ops ツール。手順は docs/ops/import-words.md。
- 混同注意: 既定はドライラン、`--execute` で実書込（scripts 共通規約）。
- 出典: src/lib/bulk-word-import.ts, scripts/import-words.ts, scripts/CLAUDE.md

#### related-word import（関連語一括登録）

- 英語名: `importRelatedWords`（`RelatedImportRow` / `RelatedImportReport`）、コマンド `pnpm db:import-related-words`
- 日本語名: 関連語の CSV 一括登録
- 定義: 既存の掲載箇所へ関連語を一括登録する ops ツール。`⇒ N` の別単語リンクは掲載番号（occurrenceNumber）で解決する。複雑な元データは取り込み時に直接パースせず、レビュー可能な中間 CSV（words.csv / related.csv）へ分解してから取り込む方針。
- 出典: src/lib/related-word-import.ts:15, src/lib/meaning-text-parser.ts:14, docs/ops/import-related-words.md

#### purge（一括削除）

- 英語名: `purgeOccurrence`（掲載箇所ごと削除）/ `purgeAllAudioBlobs`（音源 Blob 全削除）
- 日本語名: 掲載箇所ごと単語一括削除 / 発音音源 Blob 全削除
- 定義: 運用向けの一括削除ツール。purgeOccurrence は掲載箇所とその配下・関連 Blob をまとめて消す。
- 出典: src/lib/occurrence-purge.ts, src/lib/blob-purge.ts, docs/ops/purge-occurrence.md

#### dry-run と --execute

- 英語名: `--execute`（フラグ）
- 日本語名: ドライラン既定・実行フラグ
- 定義: ops スクリプト（scripts/*.ts）は既定でドライラン。`--execute` を付けたときだけ実書込する共通規約。
- 混同注意: 接続文字列は DIRECT_URL → DATABASE_URL_UNPOOLED → DATABASE_URL の順で解決（直結優先）。
- 出典: scripts/CLAUDE.md

#### resolveImportOwner（インポート先所有者の解決）

- 英語名: `resolveImportOwner`（`SystemUserMissingError` / `UserNotFoundByEmailError`）
- 日本語名: インポート先所有者の解決
- 定義: インポートの宛先を email で指定する。**email 省略時は system（共有マスタ）宛て**。
- 出典: src/lib/import-owner.ts

### 1-8. AI 下書き系

#### AI 下書き（WordAiDraft）

- 英語名: `WordAiDraft` / `WordAiSections` / `generateWordAiDraft` / `isWordAiEnabled`
- 日本語名: AI 下書き
- 定義: 単語登録フォームで「意味・発音記号・熟語・例文の下書き」を AI が生成する機能。**フォームの空欄にのみ反映**する。生成対象セクションは meanings / phrases / sentences（上限は `WORD_AI_LIMITS`: meanings 3・textsPerMeaning 3・phrases 3・sentences 2）。既定モデルは `anthropic/claude-sonnet-5`（環境変数 `WORD_AI_MODEL` で上書き）。
- 混同注意: AI Gateway の認証手段が無い環境では `isWordAiEnabled()` が false になり機能自体が出ない。
- 出典: src/lib/word-ai-draft.ts:15, src/lib/schema/word-ai-draft.ts:5

### 1-9. 横断・アーキテクチャ語

#### UseCase（サービス層）

- 英語名: （`src/lib/*.ts` フラット配置の関数群。`words-*` / `quiz-*` / `drill-*` / `occurrences-*` の動詞接頭）
- 日本語名: UseCase（サービス層）
- 定義: Server Action から呼ばれるビジネスロジックの単位。UseCase が `$transaction` を張り、handler は `tx` を受け取る。サービス層は Error を throw し、Result 型への変換は Action の責務。
- 出典: src/lib/CLAUDE.md

#### handler（書き込みハンドラ）

- 英語名: `handler`（`src/lib/words/handlers/` / `src/lib/quiz/handlers/`）
- 日本語名: 書き込みハンドラ
- 定義: 子エンティティ単位の DB 書き込み関数。シグネチャは `(tx, userId, ...)`。単語の子エンティティ書き込みは `writeWordChildren` がオーケストレートし、順序は旧実装（createWordChildren）と同一に保つ契約がある。
- 混同注意: `writeWordChildren` の旧名 `createWordChildren` / 正規パス `createWordForUser → writeWordChildren` がコメントに残る。現行名は writeWordChildren。
- 出典: src/lib/words/handlers/index.ts:22, src/lib/words/CLAUDE.md

#### Result 型（Server Action の戻り値規約）

- 英語名: `{ ok: true } | { ok: false, error, message }`
- 日本語名: Result 型
- 定義: Server Action は throw せず Result 型を返す。サービス層のカスタム Error（`WordNotFoundError` / `DuplicateHeadwordError` / `DrillRoundConflictError` 等）は error-map（`src/lib/words/error-map.ts` / `src/lib/quiz/error-map.ts`）で code（`not_found` / `forbidden` / `duplicate` / `conflict` / `generation_failed` / `unknown` 等）へ変換する。
- 出典: src/app/CLAUDE.md, src/lib/words/error-map.ts, src/lib/quiz/error-map.ts

#### side table 加算

- 英語名: side table
- 日本語名: side table 加算（既存テーブル無変更の拡張）
- 定義: 機能拡張時に既存テーブルを変更せず、新しいテーブルを「横に足す」方針。quiz 設計（QuizAnswer / Drill / DrillWord の追加）の基本方針。判断の一次情報は ADR-0008。
- 出典: docs/adr/0008-side-table-addition.md, prisma/CLAUDE.md

#### backfill（埋め戻し）

- 英語名: backfill
- 日本語名: 既存行への埋め戻し
- 定義: enum 値や推奨デフォルトの追加時、既存ユーザーの行を migration で補充すること。QuizFormat 追加時の推奨デフォルト制限時間 backfill が定型（`ON CONFLICT DO NOTHING`、前例 `20260704025822_backfill_tg_format_default_timeouts`）。
- 出典: prisma/CLAUDE.md

#### proxy（旧 middleware）

- 英語名: `proxy`（`src/proxy.ts` の `export function proxy()`）
- 日本語名: プロキシ（リクエスト前処理）
- 定義: Next.js 16 で `middleware` は `proxy` にリネームされた。このリポジトリでは `src/proxy.ts`。
- 混同注意: 「middleware を追加して」と言われても書く場所は proxy。
- 出典: src/CLAUDE.md

#### メニュー（/menu）

- 英語名: `/menu`（`src/app/menu/page.tsx`）
- 日本語名: メニュー
- 定義: ログイン後のエントリポイント画面。「単語テスト」ボタンなど各機能への起点。
- 混同注意: 旧称「ダッシュボード」（旧 `src/app/dashboard/page.tsx`）は使わない。ログイン後のエントリは `/menu` のみ（2026-07-04 に「メニュー」が正と確定）。
- 出典: src/app/menu/page.tsx

#### mock（src/lib/mock/ — 名前と実態のズレ）

- 英語名: `src/lib/mock/`
- 日本語名: （実態は）本番用定数
- 定義: 品詞・例文種別・関連語種別の定数定義ディレクトリ。名前は "mock" だが**テストダブルではなく本番コードから参照される定数**。
- 混同注意: テスト用モックをここに置かない。逆に、ここのファイルを「テスト用だから」と削除・改変しない。
- 出典: src/lib/CLAUDE.md

---

## 2. ブレ一覧（正規化提案つき — 未確定）

同じ概念に複数の名前が使われている箇所。**提案は根拠つきの候補であり、確定は人間の判断を待つ。**

### ブレ 1: 「掲載箇所」vs「出典」（Occurrence の日本語名）

- 状況: ほぼ全域（UI ラベル・schema コメント・docs・ops）で「掲載箇所」だが、3 箇所だけ「出典」表記が残る。
  - src/lib/words/error-map.ts:35 — ユーザー向けメッセージ「同じ**出典**内で重複する掲載番号が指定されています。」
  - src/lib/words/handlers/index.ts:17 — コメント「意味 / 例文 / 関連語 / メモ / **出典**」
  - src/lib/words/handlers/word-occurrence-handler.ts:110 — コメント「複数フォーム行が同じ**出典**に解決した場合」
- 提案: **「掲載箇所」を正**とする。根拠: 出現数の圧倒的多数（60+ vs 3）、UI 正式ラベル・設計ドキュメント・ops ドキュメントすべてが「掲載箇所」。特に error-map.ts:35 はユーザーの目に触れるため優先して直す価値がある。

### ブレ 2: 「例文四択」（旧称）vs「TG四択」（形式 7・8 の日本語名）

- 状況: prisma/schema.prisma:349-350 のコメントは形式 7・8 を「例文四択」と記載。一方 UI ラベル（src/lib/quiz/format-options.ts）は「TG四択」。形式 9・10 のコメントは新称ベースの「TG自己判定」であり、7・8 だけ旧称が残る。
- 提案: **「TG四択」を正**とする。根拠: ユーザーが見る UI ラベルが TG四択。schema コメントの更新が追随漏れ。

### ブレ 3: 「思い浮かばなかった（GAVE_UP）」vs「うろ覚え（VAGUE）」（自己判定の選択肢）

- 状況: 自己判定の選択肢は「うろ覚え（VAGUE）」が正（src/app/quiz/_components/self-judge-panel.tsx:138、schema.prisma:359 に「自己判定の『思い浮かばなかった』は VAGUE へ移行し廃止」と明記）。
- 提案: **「うろ覚え（VAGUE）」を正**とする。根拠: schema コメントが VAGUE への移行と旧「思い浮かばなかった」の廃止を明文化。注意点として `GAVE_UP` 自体は廃止されておらず、「四択・多義語選択の回答前『わからない』」へ意味が変わって存続している。

### ブレ 4: `meaning` の三義（多義であり改名提案はしない）

- 状況: (a) `Meaning` モデル =「意味単位」（品詞・発音の器）、(b) `MeaningText` =「訳語」、(c) `Example.meaning` / `RelatedWord.meaning` =「例文・関連語の訳」を表す String フィールド。
- 提案: 改名は提案しない（スキーマ変更コストに見合わない）。代わりに本体エントリ（Meaning / MeaningText / Example）に区別を明記した。会話・ドキュメントでは「意味（Meaning）」「訳語（MeaningText）」「例文の訳（Example.meaning）」と言い分けること。

### ブレ 5: pronunciation vs audio（「発音」系フラグの語の揺れ）

- 状況: データ層は一貫（表記=`pronunciation`、音源=`pronunciationAudioUrl`）。しかし設定フラグでは `autoplayPronunciation`（音源の自動再生の意で "pronunciation"）と `autoplayAnswerAudioJaEn`（同じく音源再生だが "audio"）が併存する（prisma/schema.prisma:395, 397）。
- 提案: 新規命名では「音声ファイル・再生に関わるものは audio、文字表記は pronunciation」と使い分ける。既存フラグの改名は提案しない（DB カラム・設定 UI に波及するため）。歴史的経緯: かつて `translation_audio_url`（意味読み上げ音源）が存在し 2026-06-14 に廃止。「translation audio」は死語。

### ブレ 6: 旧名がコメントに残る改名済みシンボル

- 状況と提案（いずれも現行コードの名前が正）:
  - `editorIsSystem` → 現 `EditorContext.isSystem`（src/lib/words/policy/editor-context.ts:4 のコメントに旧名）
  - `createWordChildren` → 現 `writeWordChildren`（src/lib/words/handlers/index.ts:19 のコメントで順序契約の参照先として旧名に言及。これは「旧実装と同一順序を保つ」という契約の表現なので消すべきではない）
- 補足: 意図的な同名 2 系統（`src/lib/quiz/default-settings.ts` vs `src/lib/quiz-default-settings.ts`、`src/lib/quiz/spelling.ts` vs `src/lib/quiz/generation/spelling.ts`）はブレではない。本体の該当エントリに混同注意として記載済み。

---

## 3. 要確認リスト（人間への質問）

コード・ドキュメントを読んでも定義を確定できなかった用語。回答が得られたら本体へ昇格させる。

現在なし。初版の 6 問（MP の意味 / kind の使い分け / location の命名意図 / OccurrenceDetail.detail の用途 / vivid treasure の正体 / ダッシュボード→メニューの経緯）は 2026-07-04 に全回答済みで、定義は本体エントリ（ExampleKind・MP例文・location・OccurrenceDetail・メニュー）へ反映し、将来対応の意向は GitHub issue（#96 MP 出題対応 / #97 location リネーム検討 / #98 設計 docs のダッシュボード表記改訂）に起票した。「vivid treasure」は正体不明との回答によりコード内コメントから削除済み。
