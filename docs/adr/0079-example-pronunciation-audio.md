# ADR-0079: 例文にも発音音源を持たせ、TG 形式の発音ボタンは TG例文を鳴らす

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-08-04

## 背景

意味（`Meaning`）と関連語（`RelatedWord`）には発音音源（mp3）を登録でき、未登録のときだけ自動音声で代用する（[ADR-0046](0046-tts-fallback.md)）。一方、**例文（`Example`）には音源の置き場が無く、読み上げ手段も無かった**。単語を「見て覚える」だけでなく例文の音でも定着させたい（issue #170）。

同時に、単語テストの TG 形式（形式 7〜10）は TG例文の英文を出題するのに、発音ボタンが鳴らすのは見出し語の音源（`QuestionBase.pronunciationAudioUrl` = 最初の Meaning の音源）だった。**画面に見えている英文と耳から入る音が食い違う**状態になっている。

## 決定内容

**例文にも意味・関連語と同じ形で発音音源を持たせ、TG 形式では発音ボタンの鳴らす対象を見出し語から TG例文へ差し替える**。

### データモデルと登録経路

- `Example` に `pronunciationAudioUrl String? @map("pronunciation_audio_url")` を追加する（`Meaning` / `RelatedWord` と同名・同型、index なし）。既存行は NULL 開始で backfill 不要。
- blob key は `audio/example/<exampleId>/pronunciation.mp3`（`AudioTarget.dir = "example"`）。**例文種別（`kind`）は key に含めない**（編集フォームで変更できるため、埋めると key と実体の意味がずれる）。
- `src/lib/pronunciation-audio.ts` に `exampleTarget` ディスクリプタと公開 API 2 本（`uploadExampleAudioForUser` / `deleteExampleAudioForUser`）、`ExampleNotFoundError` を足す。**共通コアは 1 行も変えない**ため、認可・検証と put → DB update → 旧 blob del の順序契約（[ADR-0044](0044-blob-best-effort-delete.md)）、blob の DI 境界（[ADR-0043](0043-blob-di-driver-switching.md)）をそのまま継承する。
- 入口は `src/app/words/[id]/edit/actions.ts` への Server Action 2 本の追加。route handler は新設せず、same-origin 保護に依拠する（[ADR-0017](0017-server-actions-over-route-handlers.md)）。
- 入力検証は既存の `validateAudioFile`（`audio/mpeg` 完全一致・空ファイル拒否・4MB 上限）を共有する。例文用の別上限・別 MIME は設けない。
- blob は既存どおり `access: "public"` + random suffix のまま使う。保存されるのは学習コンテンツの読み上げ mp3 であり、意味・関連語の音源と性質が同じで、例文だけ private 化しても全体の前提は変わらない。
- 登録は **1 件ずつの手動アップロードのみ**。`db:import-audio`（`Meaning` 専用）は変更せず、例文音源の一括取り込みは作らない。

### 認可

- 音源を操作できるのは `ownerId === userId` の行だけ（既存 `loadOwnedRow` の厳格一致。読み取りの `scopedOwnerIds` は使わない）。結果として **system 所有の共通例文の音源は system としてログインしたときだけ**登録・差し替え・削除できる。
- 理由は 2 つ。例文の本文は一般ユーザーには編集できない pass-through（[ADR-0019](0019-two-layer-write-authorization.md)）なので、音源だけ書けると同じ行の読み書き権限が本文と音源で食い違う。加えて `pronunciationAudioUrl` は 1 行 1 値なので、共有行への書き込みを許すと「後から書いた人が他人の音源を上書きする」競合が構造的に起きる。
- UI でも system 所有行には音源欄を出さないが、強制はサーバ側（`ForbiddenUpdateError`）で行う。

### 音源の保持とクリーンアップ

- `upsertExamples`（`words/handlers/example-handler.ts`）は音源カラムを読み書きしない。**本文・種別・並び順を編集しても音源は残る**。フォーム値に載る `pronunciationAudioUrl` は UI 表示専用の pass-through で、音源 URL を書ける経路は上記の action だけ（クライアントが偽 URL を送っても DB に入らない）。
- 音源 URL を横断で扱う経路すべてに Example を足す: `words-delete` / `words-update`（フォームから消えた例文の orphan 収集）/ `admin-user-delete` / `occurrence-purge` / `blob-purge` / `audio-manifest`。**カラム追加・登録 UI・削除経路を同時に揃え**、「登録できるのに消えない」期間を作らない（孤児 blob は DB に手掛かりが残らず後から回収できない）。

### 読み上げと再生 UI

- 読み上げ対象は例文の**英文（`Example.text`）のみ**。和訳（`Example.meaning`）は読み上げない。例文に発音記号は持たせない。
- 単語詳細の例文カード上部にメタ行を新設し、`AudioPlayButton` を 1 つ置く（全種別。`src` = 例文の音源、`ttsText` = 例文の英文）。音源あり／自動音声の描き分け（[ADR-0076](0076-audio-source-visual-distinction.md)）はコンポーネント内部で効く。音源も自動音声も使えないときはボタンごと消え、メタ行も畳まれる。
- **TG 4 形式では、いま見出し語を鳴らしているボタン（出題見出し下・正解選択肢・解答カード・結果一覧の 4 箇所）の対象を TG例文へ差し替える**。ボタンの数・位置・ラベル（「発音」）は変えない。自動再生・プリロード（[ADR-0047](0047-quiz-audio-autoplay-preload.md)）の対象も同じものに揃え、日→英形式の出題時早期 return（解答漏れ防止）は維持する。
- **TG例文の音源が未登録でも見出し語の音源へはフォールバックしない**。自動音声 → ボタン非表示の順に落ちる。関連語が単語の音源へ落ちるのは「同じ綴りの語なので発音が同じ」という根拠があるからで、例文と見出し語は別のテキストであり同じ根拠が立たない。
- 「鳴らす対象」は `questionBaseOf(word, format)` の 1 箇所で決め、`QuestionBase` に音源 URL と読み上げテキストの組（`pronunciationAudioUrl` / `ttsText`）として載せる。**`pronunciationAudioUrl` の意味は「この問題の発音ボタンが鳴らす音源」に再定義**され、見出し語の音源とは限らなくなる。UI 側は形式で分岐しない。
- ダミー選択肢には音源・読み上げを持たせない（既存の「正解選択肢のみ」を踏襲）。

TG の対象差し替えを別 ADR に分けず本 ADR に含めたのは、「例文に音源を持たせる」判断と「その音源をどこで鳴らすか」が同じ機能の表裏で、片方だけ読むと非フォールバックの理由が分からなくなるため。

## 採らなかった代替案

- **音源を別テーブル（`ExampleAudio`）に切り出す** — 1 例文 1 音源で多重度が増えず、`Meaning` / `RelatedWord` と構造だけが変わる。join が増えて得るものがない。
- **例文音源用のモジュールを新設する（`example-audio.ts` 等）** — 音源の認可・順序契約が 2 ファイルに分かれ、片方だけ直す事故が起きる。`AudioTarget`（保持先だけ差し替える拡張点）の設計意図にも反する。
- **`(kind, id)` を取る汎用 action 1 組にまとめる** — `kind` が client 由来の文字列になり、型で保証されていた対象がランタイム検証に格下げされる。呼び出し側の記述量も減らない。
- **system 所有の共通例文にも一般ユーザーが音源を書けるようにする** — 上書き競合と読み書き非対称の崩れが起き、`src/lib/words/policy/` に独立ルールを足す規模の権限モデル拡張になる。共通例文が当面ほとんど音源未登録でも、自動音声フォールバックで読み上げ自体は成立する。
- **ユーザーごとの例文音源テーブルを持つ** — 上書き競合は解けるが、削除・orphan・manifest・purge の全経路に別テーブルの取り回しが増える。MVP のスコープを超える。
- **TG例文の音源が無ければ見出し語の音源へフォールバックする** — 「ボタンを押すたびに例文だったり単語だったりする」挙動になる。
- **TG 形式で発音ボタンを 2 つ（見出し語・例文）出す** — 選択肢行・結果一覧の行内に横幅の余裕が無く、押し分けの説明も要る。
- **`QuestionBase` に例文用フィールドを別途足し、UI 側で `isTgExampleFormat(format)` により選ぶ** — 消費側 4 箇所すべてに TG 判定が散り、新しい形式・表示箇所を足したときに「見えている英文と違うものが鳴る」形で静かに壊れる。
- **登録 UI を先に入れ、削除経路の追随を後続に回す** — 追随前に登録された音源が孤児化し、その分は永久に回収できない。
- **例文の和訳も読み上げる（和訳用の読み上げ手段を用意する）** — `speakEnglish` は `en-US` 固定で、日本語の読み上げには voice の出し分け（端末ごとの差異）を伴う別設計が要る。「英語の音で例文を定着させる」目的は英文だけで満たせる。
- **TG例文だけを読み上げ・音源登録の対象にする** — 単語テストで使うのは TG例文だけだが、単語詳細では成句・MP例文・例文も同じ英文として並ぶ。ここだけ読み上げられないのは説明のつかない差になる。
- **例文にも発音記号（`pronunciation`）を持たせる** — 発音記号は語単位の表記で、文・句に付ける慣習がない。読み上げにも使わない（読み上げは音源または英文からの合成）。
- **単語一覧・編集フォームでも読み上げられるようにする** — 一覧は例文の全文を表示しないため対象がなく、編集フォームは入力中のテキストが対象になって音源との対応が曖昧になる。編集フォームで鳴らせるのは登録済み音源の「試聴」だけとする。
- **例文用の一括取り込みスクリプトを新設する** — `db:import-audio` は掲載番号（＝単語単位）でファイルと DB を突合する設計で、例文単位で突合できる音源ソースが手元にない。ソースが手に入った時点で改めて検討する。

## 影響

- 単語詳細の例文カードに「発音」ボタンが出る（全種別）。共通単語の例文は当面ほとんどが音源未登録のため、実際に鳴るのは多くが自動音声になる。
- **TG 形式で鳴る音が変わる**。出題・解答・結果一覧のいずれでも、見出し語ではなく TG例文の英文が鳴る（音源未登録なら読み上げ）。TG例文の音源も自動音声も無い問題ではボタンが消える。
- `QuestionBase` に必須フィールド `ttsText` が増えるため、payload リテラルを組み立てるテストは追随が要る。
- 一括プリフェッチの対象に例文の音源が加わる。グループ分けは [ADR-0080](0080-audio-prefetch-grouping.md) を参照。
- 例文の英文には括弧のプレースホルダ（`(be) similar to 〜` など）が多く、読み上げ品質は [ADR-0081](0081-speech-bracket-normalization.md) の正規化に依存する。
- ユーザー・単語・掲載箇所の削除、単語編集での例文削除、`db:purge-*` 系のいずれでも例文の blob が回収されるようになった。逆に言えば、これらの経路に新しい音源保持先を足すときは 6 経路すべてを見る必要がある。

## 根拠（設計・コード・文書参照）

- `prisma/schema.prisma`（`Example.pronunciationAudioUrl`）、`prisma/migrations/20260803171317_add_example_pronunciation_audio_url/`
- `src/lib/pronunciation-audio.ts`（`exampleTarget` / 公開 API 2 本 / `ExampleNotFoundError`）、`src/app/words/[id]/edit/actions.ts`
- `src/lib/{words-delete,words-update,admin-user-delete,occurrence-purge,blob-purge}.ts`（音源 URL の収集）
- `src/app/words/new/_components/examples-fields.tsx`（登録 UI）、`src/lib/schema/word-form.ts`（表示専用 pass-through）
- `src/components/word-detail-view.tsx`（例文カードのメタ行）
- `src/lib/quiz/generation/material.ts`（`questionBaseOf(word, format)`）、`src/lib/quiz/payload.ts`（`QuestionBase.ttsText`）、`src/lib/quiz/queries/quiz-source.ts`
- `src/app/quiz/_components/{quiz-flow,question-choice,revealed-headword-card,result-list}.tsx`（差し替え 4 箇所）
- 検証: `src/lib/pronunciation-audio.{unit,integration}.test.ts` / `src/lib/words-update.integration.test.ts` / `src/lib/occurrence-purge.integration.test.ts` / `src/lib/blob-purge.unit.test.ts` / TG ビルダー 4 本の unit テスト
- [ADR-0046](0046-tts-fallback.md)（音源優先・TTS は代替）/ [ADR-0043](0043-blob-di-driver-switching.md)・[ADR-0044](0044-blob-best-effort-delete.md)（blob DI・削除順序）/ [ADR-0019](0019-two-layer-write-authorization.md)（書き込み認可）/ [ADR-0047](0047-quiz-audio-autoplay-preload.md)（自動再生・プリロード）/ [ADR-0076](0076-audio-source-visual-distinction.md)（描き分け）
- issue #170
