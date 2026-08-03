# 05. quiz-tg-example-audio（単語テスト TG 形式の発音対象を TG例文へ）

状態: **実装中**　PR: （未作成）

## 目的

TG 4 形式（`CHOICE_TG` / `SELF_JUDGE_TG` / `CHOICE_TG_JA_EN` / `SELF_JUDGE_TG_JA_EN`）で、いま見出し語を鳴らしている発音ボタン・自動再生・プリロードの対象を TG例文（音源 URL と英文）へ差し替える。判断は `questionBaseOf` の 1 箇所に閉じ、UI 側は形式分岐しない。

スコープ外:

- ボタンの追加・位置・ラベルの変更（ボタンは増やさない）（[01-requirements.md](../../design/example-audio/01-requirements.md) 決定 6）
- TG 以外の形式（`headword` / `ja-plain` の promptView）の変更（[05-ui-playback.md](../../design/example-audio/05-ui-playback.md) 決定 3）
- ダミー選択肢への音源・読み上げの付与（→ 持たせない）（[05-ui-playback.md](../../design/example-audio/05-ui-playback.md) 決定 6）
- 括弧の読み上げ正規化（→ 03）
- `src/components/audio-play-button.tsx` の変更（無改造で再利用）（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 4）

## 依存チケット

- 01: `Example.pronunciationAudioUrl` カラム（TG例文の音源 URL を `select` するため）

**03 との関係**: TG例文の TTS 読み上げ品質は 03 の括弧規則に依存するため、03 のマージ後に着手するのが望ましい。ただし本チケットは 03 未マージでも単独でマージ可能（依存宣言はしない）。

## 前提（設計決定の再掲）

- TG 4 形式で、いま見出し語を鳴らしているボタンの `src` と `ttsText` を **TG例文の音源 URL と英文**に差し替える。ボタンの数・位置・ラベルは変えない。差し替え対象は 4 箇所（[05-ui-playback.md](../../design/example-audio/05-ui-playback.md) 決定 3）

  | 箇所 | 対象 format |
  | --- | --- |
  | `quiz-flow.tsx` の `tg-text` 見出し下のボタン | `CHOICE_TG` / `SELF_JUDGE_TG` |
  | `question-choice.tsx` の正解選択肢のボタン | `CHOICE_TG_JA_EN` |
  | `revealed-headword-card.tsx` のボタン | `SELF_JUDGE_TG_JA_EN` |
  | `result-list.tsx` の行内ボタン | TG 4 形式の行 |

- **TG例文の音源が未登録のときは見出し語の音源へフォールバックしない**。音源が無ければ TTS（例文の英文を読み上げ）に落ち、TTS も無効ならボタンが消える（[05-ui-playback.md](../../design/example-audio/05-ui-playback.md) 決定 3）
- 「鳴らす対象」は `questionBaseOf` の段階で音源 URL と読み上げテキストの 1 組に決め、`QuestionBase` に載せる。UI 側（4 箇所）は `format` を見た分岐を持たず、渡された組をそのまま `AudioPlayButton` に流す（[05-ui-playback.md](../../design/example-audio/05-ui-playback.md) 決定 4）
- 変更点を上流から（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 1）

  | 層 | ファイル | 変更 |
  | --- | --- | --- |
  | 取得 | `src/lib/quiz/queries/quiz-source.ts` | TG例文の追加クエリの `select` に `pronunciationAudioUrl` を足す |
  | 素材 | `src/lib/quiz/generation/material.ts` | `TgExampleRow` と `QuizWord.tgExample` に `pronunciationAudioUrl: string \| null` を足す |
  | payload 生成 | 同上 | `questionBaseOf(word, format)` に format 引数を足し、内部で組を選ぶ |
  | payload 型 | `src/lib/quiz/payload.ts` | `QuestionBase` に `ttsText: string` を足す |
  | UI | 4 箇所 | `ttsText={question.ttsText}` を渡すだけ（形式分岐なし） |

  ※ 「4 箇所」は差し替え対象の**表示箇所**の数。`revealed-headword-card.tsx` だけは `question` を受け取らず `ttsText` を内部で組み立てているため、props 追加とその呼び出し元 3 本の追随が要る（[05-ui-playback.md](../../design/example-audio/05-ui-playback.md) 決定 3。具体的な変更は実装内容を参照）。

- `questionBaseOf` の実装（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 1）

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

- `pronunciationAudioUrl` は既存フィールドを使い回し、**意味を「この問題の発音ボタンが鳴らす音源」に再定義する**（見出し語の音源とは限らなくなる）。`headword` は表示・結果一覧の見出しに使われ続けるので残す（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 1）
- TG 形式で `word.tgExample` が null になるのは不変条件違反だが、防御的に `ttsText: ""` に落とす。`AudioPlayButton` は `ttsText` が空なら `showTts = false` になるため、見出し語が鳴ってしまう事故は起きずボタンが消えるだけになる（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 1）
- `ResultRow`（`result-list.tsx`）も、現在 `pronunciationAudioUrl` / `headword` を `question` からコピーしているのと同じ形で `ttsText` をコピーする（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 1、[05-ui-playback.md](../../design/example-audio/05-ui-playback.md) 決定 4）
- 自動再生・プリロードも決定 4 の「鳴らす対象」に統一する（[05-ui-playback.md](../../design/example-audio/05-ui-playback.md) 決定 5）
  - `CHOICE_TG` / `SELF_JUDGE_TG`（英→日）: 出題時に TG例文の音源が自動再生される（未登録かつ TTS ON なら例文の英文を読み上げ）
  - `CHOICE_TG_JA_EN` / `SELF_JUDGE_TG_JA_EN`（日→英）: 出題時は従来どおり無音（`isJaToEnFormat` の**早期 return を維持**。解答漏れ防止）。解答表示の瞬間（`handleAnswerReveal` / `autoplayAnswerAudioJaEn` 設定）に TG例文の音源が鳴る
  - プリロード（現在問＋次問）の対象 URL も TG例文の音源になる。日→英でもプリロードが早期 return より前で走る既存構造は変えない
- ダミー選択肢には音源・読み上げを持たせない。既存の `showCorrectAudio`（確定後の正解選択肢のみ）をそのまま踏襲し、ダミー用の音源 URL は payload に載せない（[05-ui-playback.md](../../design/example-audio/05-ui-playback.md) 決定 6）
- `questionBaseOf` の呼び出し元はビルダー 10 本（`choice` / `choice-ja-en` / `choice-tg` / `choice-tg-ja-en` / `self-judge` / `self-judge-ja-en` / `self-judge-tg` / `self-judge-tg-ja-en` / `multi-meaning` / `spelling`）。各ビルダーは自分の format を知っているので、引数を渡すだけで済む（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 1）
- `isTgExampleFormat` は `src/lib/quiz/format-options.ts` の既存関数を使う

## 実装内容

### 変更: `src/lib/quiz/queries/quiz-source.ts`

TG例文の追加クエリの `select` に `pronunciationAudioUrl: true` を足す。

### 変更: `src/lib/quiz/generation/material.ts`

- `TgExampleRow` と `QuizWord.tgExample` に `pronunciationAudioUrl: string | null` を足す。
- `questionBaseOf` に `format: QuizFormat` 引数を追加し、前提のコードブロックのとおり実装する。

### 変更: `src/lib/quiz/payload.ts`

`QuestionBase` に `ttsText: string` を追加する。`pronunciationAudioUrl` のコメント／意味を「この問題の発音ボタンが鳴らす音源」に更新する。

### 変更: ビルダー 10 本（`src/lib/quiz/generation/*.ts`）

`questionBaseOf(target)` の呼び出しを `questionBaseOf(target, <自分の format>)` に変える。

### 変更: `src/app/quiz/_components/quiz-flow.tsx`

- `tg-text` 見出し下の `AudioPlayButton` に `ttsText={question.ttsText}` を渡す（`src` は `question.pronunciationAudioUrl` のまま。意味が再定義されているので変更不要）。
- 出題時 `useEffect` の自動再生・`handleAnswerReveal` の自動再生・`preloadAudio`（現在問＋次問）の対象 URL を、`question.pronunciationAudioUrl`（＝再定義後の値）に揃える。`isJaToEnFormat` の早期 return とプリロードの位置関係は変えない。

### 変更: `src/app/quiz/_components/question-choice.tsx`

正解選択肢の `AudioPlayButton` に `ttsText={question.ttsText}` を渡す（`question: ChoiceQuestion` を props で受け取っているのでそのまま参照できる）。

### 変更: `src/app/quiz/_components/revealed-headword-card.tsx` ＋ その呼び出し元 3 本

`RevealedHeadwordCard` は現状 `AudioPlayButton` の `ttsText` を props の `headword` から内部で組み立てているため、`ttsText: string` を props に追加して外から受ける形に変える。呼び出し元は `question-self-judge-tg-ja-en.tsx` / `question-self-judge-ja-en.tsx` / `question-spelling.tsx` の 3 本で、いずれも `ttsText={question.ttsText}` を渡す（非 TG 形式では `ttsText` が `headword` と同値になるため挙動は変わらない）。

### 変更: `src/app/quiz/_components/result-list.tsx` ＋ `quiz-flow.tsx` の `ResultRow` 組み立て

- `result-list.tsx`: `ResultRow` 型に `ttsText: string` を追加し、行内の `RowAudioButton` **2 箇所（見出し行・正解行）**の両方に渡す（`RowAudioButton` は既に `ttsText` を受けて `AudioPlayButton` へ委譲するため `src/components/row-audio-button.tsx` は変更不要）。既存の `pronunciationAudioUrl` のコメント（「英単語の発音音源 URL（最初の Meaning）」）も再定義後の意味に更新する。
- `quiz-flow.tsx`: `ResultRow` を組み立てている箇所で `pronunciationAudioUrl: question.pronunciationAudioUrl` の隣に `ttsText: question.ttsText` を足す。

いずれも `format` を見た分岐は書かない。

### 変更: `src/app/quiz/actions.unit.test.ts`

`QuestionBase` に必須フィールド `ttsText: string` が増えることで、既存の quiz payload リテラル 3 箇所（`generateQuizForUser` のモック戻り値）が `QuizPayload` 型と合わなくなり typecheck が落ちる。各リテラルに `ttsText` を追加する（テストの検証内容は変えない）。

## 完了条件（Definition of Done）

- [ ] unit（`pnpm test:unit`）: TG ビルダー 4 本（`choice-tg` / `choice-tg-ja-en` / `self-judge-tg` / `self-judge-tg-ja-en`）の `*.unit.test.ts` で、`pronunciationAudioUrl` / `ttsText` が **TG例文の値**になること（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 5）
- [ ] unit: 非 TG ビルダーの `*.unit.test.ts` で、`pronunciationAudioUrl` / `ttsText` が**見出し語の値のまま**であること（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 5）
- [ ] unit: TG例文の音源が未登録のとき `pronunciationAudioUrl` が `null` になり、見出し語の音源へフォールバック**しない**こと（[05-ui-playback.md](../../design/example-audio/05-ui-playback.md) 決定 3）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` が通る
- [ ] 手動確認（`pnpm dev`、単語テスト）:
  - [ ] `CHOICE_TG` / `SELF_JUDGE_TG`: 出題時に TG例文（音源または英文の読み上げ）が自動再生され、発音ボタンも同じものを鳴らす
  - [ ] `CHOICE_TG_JA_EN` / `SELF_JUDGE_TG_JA_EN`: 出題時は無音のまま。解答表示で TG例文が鳴る
  - [ ] TG例文の音源が未登録の単語で、見出し語の音源が鳴らないこと
  - [ ] TG 以外の形式では従来どおり見出し語が鳴ること
  - [ ] 結果一覧の TG 形式の行で TG例文が鳴ること

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
