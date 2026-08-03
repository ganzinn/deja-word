# ADR-0080: TG 例文が主役の画面では、発音ボタンは見出し語ではなく例文を鳴らす

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-08-03

## 背景

単語テストの TG 形式（TG四択・TG自己判定の英→日／日→英）は、画面に大きく出ているのが
**TG 例文の英文**であり、見出し語は表示していない（英文の中に含まれるため出さない）。にもかかわらず
発音ボタンと自動再生は**見出し語**を鳴らしていた。「画面に見えている英文」と「鳴る音」が食い違う。

例文に発音音源を持たせた（[ADR-0079](0079-example-pronunciation-audio.md)）ことで、例文そのものを
鳴らせるようになった。

## 決定内容

**表示されているものを鳴らす**に統一する。TG 例文が主役の画面では、発音ボタンの対象を見出し語から
TG 例文へ差し替える。**ボタンを増やさない**（差し替えなので「発音」ボタンが 2 つ並ぶことはない）。

差し替える箇所:

| 画面 | 実装 | 変更後に鳴るもの |
| --- | --- | --- |
| TG四択・TG自己判定（英→日）の問題文 | `quiz-flow.tsx`（`promptView.kind === "tg-text"`） | TG 例文 |
| TG四択（日→英）の正解選択肢 | `question-choice.tsx`（`showCorrectAudio`） | TG 例文 |
| TG自己判定（日→英）の解答カード | `revealed-headword-card.tsx` | TG 例文 |
| 結果一覧の TG 行 | `result-list.tsx`（`tg-text` / `tg-meaning`） | TG 例文 |

付随して守ること:

- **自動再生・プリロードも同じ規則に揃える**（`quiz-flow.tsx` の出題時 effect と `handleAnswerReveal`、
  [ADR-0047](0047-quiz-audio-autoplay-preload.md)）。ボタンは例文・自動再生は見出し語では食い違う。
- **ラベルは「発音」のまま**（[ADR-0076](0076-audio-source-visual-distinction.md) のラベル不変の制約を
  継承）。音源あり＝マイク＋通常枠線 / 自動音声＝▶＋薄い、の描き分けがそのまま「その例文に音源が
  登録されているか」を伝える。
- 音源が無ければ自動音声が例文の英文を読む（[ADR-0046](0046-tts-fallback.md) のフォールバックをそのまま
  使う。読み上げテキストの正規化は [ADR-0078](0078-speech-text-normalization.md) /
  [ADR-0081](0081-speech-bracket-normalization.md)）。
- **ダミー選択肢の音源は持たない**。発音ボタンを出すのは正解選択肢だけという既存方針
  （`showCorrectAudio`）に従うので、payload が持つのは対象単語の TG 例文 1 件分の音源 URL でよい。

非 TG 形式（四択・自己判定・多義語選択・スペル確認）は従来どおり見出し語を鳴らす。これらは見出し語
または意味が主役の画面であり、例文は表示していない。

## 採らなかった代替案

- **例文用のボタンを追加して 2 つ並べる** — 「発音」ラベルのボタンが 2 つ並び、どちらが何を鳴らすか
  区別できない。区別するにはラベルを変える（「例文」等）ことになるが、ラベル文字を変えない制約
  （ADR-0076）と衝突し、密なテスト画面のレイアウトも崩れる。ユーザーが明示的に却下。
- **見出し語と例文を続けて鳴らす** — 1 タップで両方聞ける利点はあるが、聞きたい方だけを聞く操作が
  できなくなり、自動再生時は待ち時間が倍になる。
- **ダミー選択肢にも音源を載せる** — 誤答の選択肢を鳴らす動線が無く（発音ボタンは正解選択肢のみ）、
  payload と生成経路が重くなるだけ。
- **TG 形式でも見出し語のままにする** — 現状維持。画面と音の食い違いが残り、例文に音源を登録しても
  テスト中は聞けない。

## 影響

- TG 例文の音源 URL を出題データに載せる必要がある: `quiz-source.ts`（取得）→ `material.ts`
  （`TgExampleRow` / `QuizWord.tgExample`）→ `payload.ts`（TG 系 4 形式）。
- TG 形式では、見出し語に音源があっても**テスト中はその音が鳴らなくなる**。見出し語の発音を聞きたい
  ときは「詳細」から単語詳細を開く（既存動線）。
- 例文に音源が未登録の単語では、TG 形式のボタンが「音源あり（マイク）」から「自動音声（▶・薄い）」
  表示に変わる。見た目の変化はユーザーから見ると劣化に見えうるが、実態（その例文の音源は無い）を
  正しく表している。
- `docs/features/word-quiz.md` の説明とスクリーンショットの更新が必要。

## 根拠（コード・文書参照）

- `src/app/quiz/_components/quiz-flow.tsx` — `promptViewOf` の `tg-text` / `tg-meaning` 分岐、
  出題時の自動再生 effect、`handleAnswerReveal`
- `src/app/quiz/_components/question-choice.tsx` — `showCorrectAudio`（正解選択肢のみ発音ボタン）
- `src/app/quiz/_components/revealed-headword-card.tsx` — 解答カードの共通表示
- `src/lib/quiz/payload.ts` — TG 系 4 形式の payload
- [ADR-0079](0079-example-pronunciation-audio.md) — 例文の発音音源
- [ADR-0076](0076-audio-source-visual-distinction.md) — ラベル不変・アイコン＋濃淡での区別
- [ADR-0047](0047-quiz-audio-autoplay-preload.md) — quiz 中の自動再生・プリロード
