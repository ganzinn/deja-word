# ADR-0068: コンテンツ系入力テキスト・配列に zod 上限（.max）を設ける

- ステータス: 承認
- 確信度: 高
- 起票日: 2026-07-11
- 決定日: 2026-07-11

## 背景

コンテンツ系スキーマ（`src/lib/schema/word-form.ts` / `occurrence-form.ts`）の全テキストフィールドは `.min(1)` のみで `.max()` が無く、各配列にも件数上限が無かった。DB カラムは全て無制限 TEXT のため、`next.config.ts` の `bodySizeLimit "4.5mb"` まで任意サイズを保存できた（issue #107、2026-07-04 コード監査）。

- 巨大テキストの誤ペースト（正常系で起きる）でも一覧・詳細・quiz 生成ペイロード（正答同梱で全文クライアント送信）が肥大し、画面が実質使用不能になる
- `src/app/words/new/ai-draft-action.ts` は headword を空チェックのみで zod を通さず LLM プロンプトへ直埋めしており、任意長文字列が AI Gateway の入力課金に直結していた
- 解答送信系（`src/lib/schema/quiz.ts` の answers / results 配列）も `.min(1)` のみで、巨大 IN 句・createMany による資源枯渇が可能だった（ADR-0025 が許容するのは自己申告スコア改竄であり、資源枯渇は許容範囲外）
- `accountProfileSchema` の `.max(50)` / `MAX_PASSWORD_LENGTH` と対照的に、コンテンツ系だけ上限規約の適用漏れだった

## 決定内容

### 上限ティア（`src/lib/schema/content-limits.ts`）

| 定数 | 値 | 対象 |
|---|---|---|
| `SHORT_TEXT_MAX_LENGTH` | 100 | 1 行もの: 見出し語・関連語 term・発音（意味/関連語）・掲載箇所名（word-form / occurrence-form 共通） |
| `LONG_TEXT_MAX_LENGTH` | 2000 | 文章もの: 意味テキスト・補足説明(note)・例文・例文の意味・関連語の意味・メモ・掲載箇所の詳細 |
| `CONTENT_ITEMS_MAX_COUNT` | 50 | word-form 内の全配列（トップレベル meanings / examples / relatedWords / memos / occurrences、ネスト texts / notes / details 共通） |

値の根拠（2026-07-11 本番 Neon 実測）: テキスト最大は意味テキスト 48 文字（見出し語 15・掲載箇所名 17）、配列最大は意味テキスト 5 件。実測の 2〜40 倍の余裕を確保しつつ、段落丸ごとの誤ペーストを弾く水準とした。ティアはトップレベル / ネストで分けない（実測上の必要が無く、定数追加は API 面積を増やすだけ）。

エラーメッセージは `account-profile.ts` の前例に合わせ、各フィールドにインラインのテンプレートリテラルで「…は N 文字以内で入力してください」「…は N 件以内で入力してください」を付ける（メッセージヘルパは作らない。凝集優先）。

`headwordSchema` を `word-form.ts` から export し、フォーム（`wordFormSchema.headword`）と AI 下書き action（`ai-draft-action.ts` の safeParse）で単一定義を共用する。

### quiz 系上限（`src/lib/schema/quiz.ts` 内に定義）

| 定数 | 値 | 対象 |
|---|---|---|
| `QUIZ_ANSWERS_MAX_COUNT` | 5000 | answers（テスト送信・drill ラウンド・再テスト）・results（drill 開始）・wordIds（再テスト開始）の 5 配列 |
| `INPUT_ID_MAX_LENGTH` | 64 | quiz.ts 内の全 id 入力（`idInputSchema = z.string().min(1).max(64)` に集約。cuid は 25 文字） |

issue の例示値 1000 は**却下**した: 仕様は「範囲内全出題」で問題数に上限が無く（`src/lib/quiz/queries/quiz-source.ts`）、本番実測で掲載箇所あたり最大 1900 語（ターゲット1900）が既に存在するため、1000 では正常な全範囲テストの送信が拒否される。5000 は現実的最大の約 2.6 倍で、5000 件のペイロードは数百 KB と `bodySizeLimit 4.5MB` に収まる。quiz 系メッセージは付けない（server-action 専用入力で、action 層が汎用「入力内容を確認してください。」に畳むため。既存 `.min(1)` と対称）。

quiz 定数を `content-limits.ts` に置かないのは変更理由が異なるため（`WORD_AI_LIMITS` が `word-ai-draft.ts` 内に住む前例に倣う）。

### 対象外（意図的な除外）

- **partOfSpeech**: `isCommonPartOfSpeech` の refine で値集合が有界のため `.max()` 不要（`word-form.ts` にコメントで明示）
- **pronunciationAudioUrl / id / ownerId / linkedWordId**: コンテンツ入力ではない（読み取り専用・cuid 形式検証済み・サーバ側で検証）

## 採らなかった代替案

- **quiz answers 上限 1000（issue 例示値）** — 上記のとおり本番実データと矛盾
- **HTML `maxLength` 属性の併設** — zod スキーマを単一の真実源とし、diff を最小に保つ。UX 上必要になれば別途
- **トップレベル / ネストで配列ティアを分ける** — 実測上の必要が無い

## 影響

- 既存データは全て新上限内であることを本番 Neon への読み取りクエリで確認済み（2026-07-11）。編集フォームの再送信が拒否される既存行は無い
- クライアントは既存の zodResolver 配線でフィールド単位の日本語エラーが表示される（UI 変更なし）。サーバ action は従来どおり汎用メッセージで拒否（direct POST への防御）
- zod を通らない書き込み経路（`scripts/*.ts` の ops ツール、migration backfill）には効かない。DB CHECK 制約による多層防御は ADR-0064 の提案のまま（本 ADR は web 入力経路のみを閉じる）
