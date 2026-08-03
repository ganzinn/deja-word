# 06. アーキテクチャ・テスト戦略

状態: **確定**（2026-08-04）

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- 例文にも発音音源（mp3）を登録でき、未登録のときだけ TTS にフォールバックする（01 確定）。
- 対象画面は単語詳細（全例文種別）と単語テストの TG 形式（TG例文のみ）（01 確定）。
- 単語テスト TG 形式ではボタンを増やさず、いま見出し語を鳴らしているボタンの対象を TG例文へ差し替える（01 確定）。
- `Example` に `pronunciationAudioUrl String?` を追加し、blob key は `audio/example/<exampleId>/pronunciation.mp3`（02 確定）。
- 音源 URL を横断で扱う 6 経路すべてに Example を追加し、カラム追加・登録・削除経路は同一チケットで揃える（02 確定）。
- 一括プリフェッチはグループ別（見出し語・関連語 / 例文）にダウンロードでき、Cache Storage は 1 つのまま prune は和集合で判定する（02 確定）。
- `pronunciation-audio.ts` は `exampleTarget` ディスクリプタと公開 API 2 本（`uploadExampleAudioForUser` / `deleteExampleAudioForUser`）の追加のみで、共通コアは無改造（03 確定）。`ExampleNotFoundError` を新設する。
- 入口は `words/[id]/edit/actions.ts` への action 2 本追加で、route handler は新設しない（03 確定）。
- 音源の登録 UI は例文カードの例文テキスト直後に `PronunciationAudioManager` を再利用して置く（03 確定）。
- `exampleSchema` に `pronunciationAudioUrl` を足すが UI 表示専用で、`upsertExamples` は読み書きしない（03 確定）。
- 読み上げ正規化の括弧規則は `toSpokenText`（`src/lib/speech.ts`）1 箇所への追加で、除去順序は「装飾記法 → `【…】` → `[…]` → 残存括弧記号 → プレースホルダ → 空白畳み込み」（04 確定）。既存テスト `speech.unit.test.ts` の期待値 `suggest (to ) that` は更新対象。
- 括弧は半角・全角の両字形が対象で、表示側 `TG_TEXT_PATTERN`（`src/components/tg-example-text.tsx`）にも全角括弧を足して同一チケットで揃える（04 確定）。表示変更を伴うため `docs/features/` の再撮影要否を棚卸しする。
- 単語詳細の例文カード上部にメタ行を新設し、`AudioPlayButton`（`src` = 例文の音源、`ttsText` = 例文の英文）を 1 つ置く（05 確定）。`AudioPlayButton` 自体は変更しない。
- TG 4 形式では発音ボタン・自動再生・プリロードの対象を TG例文に差し替え、見出し語の音源へはフォールバックしない（05 確定）。差し替え箇所は `quiz-flow.tsx` / `question-choice.tsx` / `revealed-headword-card.tsx` / `result-list.tsx` の 4 つ。
- 「鳴らす対象」は `questionBaseOf` の段階で音源 URL と読み上げテキストの 1 組に決め、`QuestionBase` に載せる。UI 側は形式分岐しない（05 確定）。フィールド名・型は 06 で決める。
- ダミー選択肢には音源・読み上げを持たせない（05 確定）。
- 設定画面は 1 セクション内にグループ別 2 行を並べ、「端末から削除」は共通 1 つのまま（05 確定）。同時ダウンロードはしない。

## 検討事項リスト

- [x] quiz のデータフローへの音源 URL の載せ方 → 決定 1
- [x] 単語詳細側のデータ取得経路 → 決定 2
- [x] 一括プリフェッチのグループ別 manifest の型 → 決定 3
- [x] モジュール配置（新規モジュールの要否） → 決定 4
- [x] テスト戦略（unit / integration / E2E の割り当て） → 決定 5
- [x] 機能紹介ドキュメントの更新対象とスクリーンショット再撮影の要否 → 決定 6
- [x] `docs/reference/naming-book.md` への用語追加 → 決定 7
- [x] 実装後に起票する ADR の候補 → 決定 8

## 議論・決定

### 決定 1: `QuestionBase` に `ttsText` を足し、`questionBaseOf(word, format)` が形式で組を選ぶ

quiz のデータフローに例文音源を通す。変更点を上流から:

| 層 | ファイル | 変更 |
| --- | --- | --- |
| 取得 | `src/lib/quiz/queries/quiz-source.ts` | TG例文の追加クエリの `select` に `pronunciationAudioUrl` を足す |
| 素材 | `src/lib/quiz/generation/material.ts` | `TgExampleRow` と `QuizWord.tgExample` に `pronunciationAudioUrl: string \| null` を足す |
| payload 生成 | 同上 | `questionBaseOf(word, format)` に format 引数を足し、内部で組を選ぶ |
| payload 型 | `src/lib/quiz/payload.ts` | `QuestionBase` に `ttsText: string` を足す |
| UI | 5 決定 3 の 4 箇所 | `ttsText={question.ttsText}` を渡すだけ（形式分岐なし） |

```ts
// QuestionBase = { wordId, headword, pronunciationAudioUrl, ttsText }
// pronunciationAudioUrl は「この問題の発音ボタンが鳴らす音源」、ttsText は「その音源が無いとき読み上げる語」。
export function questionBaseOf(word: QuizWord, format: QuizFormat): QuestionBase {
  const base = { wordId: word.id, headword: word.headword };
  if (isTgExampleFormat(format)) {
    return {
      ...base,
      pronunciationAudioUrl: word.tgExample?.pronunciationAudioUrl ?? null,
      ttsText: word.tgExample?.text ?? "",
    };
  }
  return {
    ...base,
    pronunciationAudioUrl: word.meanings[0]?.pronunciationAudioUrl ?? null,
    ttsText: word.headword,
  };
}
```

- `pronunciationAudioUrl` は既存フィールドを使い回し、**意味を「この問題の発音ボタンが鳴らす音源」に再定義する**（見出し語の音源とは限らなくなる）。`headword` は表示・結果一覧の見出しに使われ続けるので残す。
- TG 形式で `word.tgExample` が null になるのは不変条件違反（TG 形式は「使える TG例文」を持つ単語だけを対象に生成される）だが、防御的に `ttsText: ""` に落とす。`AudioPlayButton` は `ttsText` が空なら `showTts = false` になるため、見出し語が鳴ってしまう事故は起きずボタンが消えるだけになる（05 決定 3 の「見出し語へフォールバックしない」に沿う）。
- `ResultRow`（`result-list.tsx`）も `pronunciationAudioUrl` / `headword` と同じ形で `ttsText` をコピーする。
- `RevealedHeadwordCard`（`revealed-headword-card.tsx`）だけは「渡すだけ」で済まない。`question` を受け取らず `ttsText={headword}` を内部で組み立てているため、`ttsText` prop を新設し、呼び出し元 3 本（`question-self-judge-tg-ja-en` / `question-self-judge-ja-en` / `question-spelling`）が `question.ttsText` を渡すよう追随する。
- `QuestionBase` に必須フィールドが増えるため、payload リテラルを組み立てているテスト（`src/app/quiz/actions.unit.test.ts`）の追随も要る（決定 5）。

採用理由: 判断を `questionBaseOf` の 1 箇所に閉じられる（05 決定 4）。ビルダー 10 本は自分の format を知っているので引数を渡すだけで済み、UI 4 箇所とビルダー側に TG 判定が散らない。`ttsText` は `AudioPlayButton` の prop 名と一致するので、payload から UI までフィールド名が変わらず追跡しやすい。

却下した代替案:
- **`QuestionBase` に例文用フィールド（`tgExampleAudioUrl` 等）を別途足す**: payload の意味は明快になるが、消費側 4 箇所で「どちらを使うか」の分岐が復活する。
- **`questionBaseOf` を TG 用と非 TG 用の 2 関数に分ける**: 呼び出し側が明示的になるが、TG ビルダーが誤って非 TG 版を呼んでも型は通り、「見出し語が鳴る」形で静かに壊れる。format 引数なら形式の取り違えが起きない。
- **`ttsText` を載せず、UI 側で `prompt` / `choices[correctIndex]` / `answer` から取り出す**: payload は小さくなるが取り出し方が形式ごとに違い、結局 4 種の分岐になる（05 決定 4 で却下済み）。

### 決定 2: 単語詳細のデータ取得は変更しない

`getWordDetailForUser`（`src/lib/words-detail.ts`）の examples は `select` ではなく `include` で取っているため、`Example` にカラムを足せば `WordDetail["examples"][number]` に自動的に載る。クエリの修正は不要。

ネストした関連の owner 再スコープ（`linkedWord.meanings` を `scopedOwnerIds` で引き直す既存の契約）に相当する箇所は例文側に無い。例文自体が `where: { ownerId: { in: allowed } }` でスコープされ、音源 URL はその行のスカラー列だからである。

採用理由: 触らずに済むことを明示しておかないと、実装時に「詳細取得にも足すのだろう」と不要な変更が入る。

却下した代替案:
- **`include` を明示 `select` に書き換える**: 列を絞れるが、既存の他フィールドをすべて列挙する変更になり、本機能と無関係な差分が増える。

### 決定 3: manifest はグループキー `word` / `example` を持つオブジェクトを返す

`src/lib/audio-manifest.ts` の 2 関数をグループ別に返す形へ変える。

```ts
type AudioGroup = "word" | "example";
type AudioUrlGroups = Record<AudioGroup, string[]>;   // listAudioUrlsForUser
type AudioCountGroups = Record<AudioGroup, number>;   // countAudioUrlsForUser
```

- `word` グループ = Meaning + RelatedWord（現行の対象そのまま）。`example` グループ = Example。UI 上のラベルは「見出し語・関連語」「例文」。
- 重複排除は**グループ内**で行う。グループ間で同じ URL が現れることは無い（blob key の接頭辞が `audio/meaning/` / `audio/related-word/` / `audio/example/` で分かれ、`addRandomSuffix` により URL は一意）。
- `/api/audio/manifest` は常に両グループを返す。クライアントはダウンロード時に片方だけを使い、prune の判定には**両グループの和集合**を使う（02 確定）。片方だけ取得して prune すると、もう一方のキャッシュが manifest に無い扱いで消える。
- 設定画面の初期表示はグループ別件数を使う（`countAudioUrlsForUser` の戻り値を 2 行に割り当てる）。

採用理由: グループの区別は「どのテーブル由来か」であり、キーで持つのが最も直接的。配列 2 本を別関数で返すと prune の和集合を作る側が両方を呼ぶ必要があり、片方だけ呼んで prune する事故の余地が残る。1 回のレスポンスに両方入っていれば、和集合は受け取った側でそのまま作れる。

却下した代替案:
- **manifest にグループを持たせず、クライアントが URL の blob key 接頭辞（`audio/example/`）で振り分ける**: サーバー側の変更は最小だが、blob key の規約が UI の分類ロジックに漏れる。key 規約を変えた瞬間に分類が壊れ、しかもテストで気づきにくい。
- **グループごとに別エンドポイントを用意する**: prune の和集合を作るのに 2 回叩くことになり、片方の失敗時に和集合が不完全なまま prune が走る。

### 決定 4: 新規モジュールは作らず、既存ファイルの拡張に閉じる

本機能で新規に作るファイルは**マイグレーションのみ**とする。ロジックはすべて既存モジュールへの追加で収める。

| 変更対象 | 内容 |
| --- | --- |
| `prisma/schema.prisma` ＋ マイグレーション | `Example.pronunciationAudioUrl`（02 確定） |
| `src/lib/pronunciation-audio.ts` | `exampleTarget` ＋ 公開 API 2 本 ＋ `ExampleNotFoundError`（03 確定） |
| `src/app/words/[id]/edit/actions.ts` | action 2 本 ＋ `mapAudioError` の分岐追加（03 確定） |
| `src/lib/schema/word-form.ts` | `exampleSchema` のフィールド追加とマッピング（03 確定） |
| `src/app/words/new/_components/examples-fields.tsx` | 音源登録 UI（03 確定） |
| `src/lib/speech.ts` | 括弧規則（04 確定） |
| `src/components/tg-example-text.tsx` | `TG_TEXT_PATTERN` に全角括弧（04 確定） |
| `src/components/word-detail-view.tsx` | 例文カードのメタ行（05 確定） |
| `src/lib/quiz/{queries/quiz-source.ts, generation/material.ts, payload.ts}` ＋ ビルダー 10 本 | 決定 1 |
| quiz UI 4 ファイル ＋ `RevealedHeadwordCard` の呼び出し元 3 本 | 決定 1（原則は `ttsText` を渡すだけ。`revealed-headword-card.tsx` のみ prop 新設と呼び出し元の追随が要る） |
| `src/lib/audio-manifest.ts` ＋ `src/app/api/audio/manifest/route.ts` ＋ `src/app/settings/general/page.tsx` | 決定 3（`countAudioUrlsForUser` の戻り値が `number` → `AudioCountGroups` になるため page 側の受け渡しも変わる） |
| `src/lib/audio-cache.ts` | グループ別 URL から prune 用の和集合を作る純関数を追加（決定 5） |
| `src/app/settings/general/_components/audio-prefetch-section.tsx` | グループ別 2 行（05 確定） |
| `src/lib/{words-delete,words-update,admin-user-delete,occurrence-purge,blob-purge}.ts` | 音源 URL 収集に Example を追加（02 確定） |

`AudioPlayButton` と `PronunciationAudioManager` は無改造で再利用する。

採用理由: 例文音源は既存の音源機能と同じ形をもう 1 つ増やすものであり、新しい関心事は生まれていない。共通化のための抽象を先に作るとファイル数だけ増え、3 種目が「共通化の失敗した抽象」に引きずられる。既存ファイルへの追加で収まる規模（`AudioTarget` は 4 フィールド、UI は既存コンポーネントの再利用）。

却下した代替案:
- **例文音源用のモジュールを新設する**（`example-audio.ts` 等）: 音源の認可・順序契約が 2 ファイルに分かれ、片方だけ直す事故が起きる。`AudioTarget` の設計意図（保持先だけ差し替える）に反する。

### 決定 5: テストは既存ファイルへのケース追加を基本とし、E2E は prefetch のみ追随する

**unit**

| ファイル | 追加するケース |
| --- | --- |
| `src/lib/speech.unit.test.ts` | 括弧規則（`(be) similar to 〜` / `consider A (to be) B` / `compare A with [to] B` / ペア不一致 / 全角 / 丸括弧内の角括弧）。既存の `suggest (to ) that` の期待値を `suggest to that` に更新 |
| `src/lib/pronunciation-audio.unit.test.ts` | example ターゲット（blob パスが `audio/example/<id>/`、owner 本人可・他人不可・SYSTEM 行を一般ユーザーが操作不可・不存在は `ExampleNotFoundError`、delete） |
| `src/lib/quiz/generation/*.unit.test.ts`（TG ビルダー 4 本） | `pronunciationAudioUrl` / `ttsText` が TG例文の値になること。非 TG ビルダーは見出し語のままであること |
| `src/lib/audio-cache.unit.test.ts` | グループ別 URL から prune 用の和集合を作る純関数（片方のグループだけダウンロードしても、もう一方の URL が stale と判定されないこと）。和集合を作るロジックはコンポーネントに置かず `audio-cache.ts` の関数に切り出す |
| `src/lib/blob-purge.unit.test.ts` | 例文の音源も収集・削除対象になること（`purgeAllAudioBlobs`） |
| `src/app/quiz/actions.unit.test.ts` | ケース追加ではなく**追随**。`QuestionBase` に必須の `ttsText` が増えるため、payload リテラルを組み立てている箇所に `ttsText` を足さないと typecheck が落ちる |

**integration**

| ファイル | 追加するケース |
| --- | --- |
| `src/lib/pronunciation-audio.integration.test.ts` | example の 3 グループ（upload → 差し替え → 削除で DB と blob が追随 / Word 削除・編集の orphan 削除で blob が消える / 認可）。既存の meaning・related-word と同じ構成で反復 |
| `src/lib/audio-manifest.integration.test.ts` | グループ別の URL・件数（他人の音源が混ざらないこと、system の音源が入ること） |
| `src/lib/words-update.integration.test.ts` | フォームから消えた例文の音源が orphan として削除されること |
| `src/lib/occurrence-purge.integration.test.ts` | 例文の音源も収集・削除対象になること |

**E2E**

- `pnpm e2e:audio-prefetch` — グループ別 2 行の UI に追随させる（例文音源を持つ単語を作り、`example` グループの件数・ダウンロード・prune・削除を検証）。
- `pnpm e2e:audio-cache` — 再生時キャッシュ（Service Worker）の検証で、音源の種類に依存しない。**変更しない**。
- 音源の Server Action（`words/[id]/edit/actions.ts` の音源 4 action）のテストは既存でも無く、本機能でも新設しない。認可・検証はサービス層のテストで担保されている（既存の `src/app/quiz/actions.unit.test.ts` への追随は型の追随であって、この方針の例外ではない）。

採用理由: 既存の音源機能が unit（認可・検証・呼び出し順）と integration（DB と blob の追随・クリーンアップ）で役割を分けており、例文はその 3 種目なので同じ場所に同じ形で足すのが最も読みやすく、抜けも検出しやすい。E2E は「グループ分け」という UI 構造の変更が入る prefetch だけが追随対象になる。

却下した代替案:
- **例文音源用に新しいテストファイルを作る**: meaning / related-word / example が別ファイルに散り、「3 種で同じ保証があるか」の確認が目視になる。
- **`AudioPlayButton` / `word-detail-view` にコンポーネントテストを新設する**: 既存にコンポーネントテストが 1 つも無く、本機能のためだけに導入すると設定（jsdom・testing-library）とテスト規約の追加が本筋から外れる。表示の確認は E2E とスクリーンショットで足りる。

### 決定 6: `docs/features/` は 4 ページを更新し、再撮影は `words,settings` を必須・`quiz` は実装後に目視判断

**本文の更新対象**

| ページ | 箇所 |
| --- | --- |
| `README.md` | 目次の説明文 2 行（単語管理・設定） |
| `word-management.md` | 単語詳細（例文カードに発音ボタン）／単語の編集（例文の音源登録、未保存行・共通例文の扱い）／補足（「意味・関連語には発音音源を登録でき」→ 例文を追加、TG例文の非フォールバック） |
| `word-quiz.md` | TG 形式の説明（「発音」が鳴らすのは TG例文の英文であること、未登録時は自動音声・それも不可ならボタン非表示） |
| `settings.md` | 自動音声の読み飛ばし規則に括弧を追加／「発音音源のダウンロード」をグループ別 2 行の説明に書き換え（容量目安の記述も見直す） |

**スクリーンショット**

- 必須: `pnpm e2e:capture-docs --only words,settings`（`word-detail.png` / `word-edit.png` / `settings-general.png`。新規登録フォームの例文カードにも「音源は保存してから追加できます。」の注記が出るため `word-new.png` も同じセクションで撮り直される）。
- `quiz`（`quiz-play-tg-choice.png`）はボタンの位置・ラベルが変わらないため、実装後に目視で差分を確認してから判断する。
- 撮影の被写体を作るため `scripts/e2e/db.ts` の `ensureDemoAudio` に Example への音源付与を追加する。**全例文には付けず一部だけに付ける**（例: TARGET と SENTENCE のみ）。戻り値の件数にも加算する。

採用理由: `ensureDemoAudio` が全件に音源を付けると、単語詳細で「音源あり（マイク）／自動音声（再生）」の描き分け（ADR-0076）が 1 種類しか写らない。例文は種別が 4 つあるので、一部だけ音源を付ければ 1 枚で両方の見た目を記録できる。設定画面の件数も同時に増えるため、`--only words,settings` の 2 セクションで撮影が閉じる。

却下した代替案:
- **全例文に音源を付ける**: seed は単純になるが、未登録時の見た目（自動音声アイコン／ボタン非表示）が機能紹介に残らない。
- **`--only` を使わず全セクション撮り直す**: 差分の目視レビュー範囲が広がり、無関係な画像のピクセル差分が混ざる（README の運用注意に反する）。

### 決定 7: naming-book は既存 5 エントリを修正し、新規 2 エントリを追加する

**修正**

| エントリ | 修正内容 |
| --- | --- |
| `pronunciationAudioUrl`（発音音源） | 定義の対象に Example を追加。出典に `Example` の schema 行を追記 |
| `Example`（例文） | 発音音源を持つこと、書けるのは専用 action のみで `upsertExamples` は触らないことを混同注意に追記 |
| `AudioTarget` | 英語名の列挙に `exampleTarget` を追加 |
| `ttsFallback`（TTS 代替） | フォールバック対象に例文が入る旨を追記 |
| `TG例文`（TARGET） | ハイライト対象のプレースホルダに全角括弧を追加。TG 形式では発音ボタンの対象が TG例文になる旨を追記 |

**新規**

- **読み上げ正規化（`toSpokenText`）** — ADR-0078 / 本設計 04 で規則が増えたが naming-book に項目が無い。「読み上げ直前に表示用の記号を落とす一本道の関数」と、括弧の出し分け（`(…)` は中身を読む／`[…]` は落とす）を定義する。
- **音源グループ（`word` / `example`）** — 一括プリフェッチの分類。「見出し語・関連語グループ」「例文グループ」の日本語名と、Cache Storage は 1 つで prune は和集合であることを混同注意に置く。

あわせて `QuestionBase.pronunciationAudioUrl` の意味が「この問題の発音ボタンが鳴らす音源」（見出し語の音源とは限らない）に変わる点を、`TG例文` か新規の読み上げ関連エントリの混同注意に残す。

採用理由: naming-book は「英語コード名 ⇔ 日本語名・定義・使ってはいけない類義語」を引くための一次資料であり、定義文が「Meaning・RelatedWord の」と限定されたままだと、次に読む人が例文の音源を別概念と誤解する。`AudioTarget` の列挙漏れは拡張点を探すときに直接効く。

却下した代替案:
- **設計ドキュメントがあるので naming-book は据え置く**: `docs/design/` は実装済み分を削除していく運用（長期の記録は ADR）なので、用語の定義を設計ドキュメントに残す前提は成り立たない。

### 決定 8: ADR は実装後に起票し、番号は 0079 から採番する

| 番号 | 主題 | 既存 ADR との関係 |
| --- | --- | --- |
| 0079 | 例文の発音音源（`Example` への音源カラム追加、`exampleTarget`、共通例文は system のみ登録可） | ADR-0046（TTS フォールバック）・0043/0044（blob DI・削除順序）を参照。supersede しない |
| 0080 | 一括プリフェッチのグループ分け（`word` / `example`、Cache Storage は 1 つ・prune は和集合） | ADR-0075 の追補。supersede しない |
| 0081 | 読み上げの括弧正規化（`(…)` は中身を読む／`[…]` は落とす） | ADR-0078 の追補。supersede しない |
| （0082 候補） | TG 形式で発音ボタンの対象を TG例文にする | ADR-0047（自動再生・プリロード）・0076（描き分け）を参照。0079 に含めるか分けるかは実装時に判断 |

いずれも `docs/adr/README.md` の一覧表への追記を伴う。

採用理由: 現行 repo の最大番号は 0078 で、0079 以降は空いている（同番号の設計ドキュメントが過去に一度入って取り下げられている（`ffec63e`）が、現行 repo には存在しない）。取り下げ済みの番号を欠番にすると、以後ずっと「なぜ欠番か」を説明する必要が生じる。取り下げの経緯は git 履歴で追える。

却下した代替案:
- **0082 から採番して過去の取り下げ分と番号を重複させない**: git 履歴を遡ったときの混乱は避けられるが、repo 内の一覧に説明のつかない欠番が 3 つ残る。ADR 番号は現行 repo 内で一意であれば足りる。
- **設計確定と同時に ADR を起票する**: 実装で前提が変わる余地があり、ADR が「決めたつもり」の記録になる。既存 ADR も実装後の起票が慣例。
