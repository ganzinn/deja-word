# 例文の読み上げ（issue #170）

例文（TG例文・成句・熟語・MP例文・例文）の**英文**を、登録済み音源（mp3）または端末内蔵の自動音声
（TTS）で読み上げられるようにする。

> この文書は実装用の設計・チケット分割。**実装完了後に削除する**（長期の決定記録は ADR が受け皿）。
> 決定の背景と代替案は [ADR-0079](../../adr/0079-example-pronunciation-audio.md) /
> [ADR-0080](../../adr/0080-tg-example-audio-over-headword.md) /
> [ADR-0081](../../adr/0081-speech-bracket-normalization.md) を参照。

## スコープ

やること:

- 例文に発音音源（mp3）を登録・差し替え・削除できるようにする（意味・関連語と同じ操作感）
- 単語詳細の例文カードに「発音」ボタンを出す（音源優先、無ければ自動音声）
- 単語テストの TG 形式で、発音ボタン・自動再生の対象を見出し語から TG 例文へ**差し替える**
- 読み上げ正規化に括弧を追加する

やらないこと:

- **和訳（`Example.meaning`）の読み上げ**。`speakEnglish` は en-US 固定で、日本語読み上げには lang の
  出し分け設計が要る。必要になったら別 issue で起票する
- **例文への発音記号の追加**（ユーザー明示要件）
- **例文音源の一括取り込み**（`db:import-audio` は掲載番号＝単語単位の突合。例文用のソースが無い）
- ダミー選択肢（誤答）の音源

## 決定事項の要約

| 論点 | 決定 |
| --- | --- |
| 音源の持ち方 | `Example.pronunciationAudioUrl`（Meaning / RelatedWord と同名） |
| Blob パス | `audio/example/<exampleId>/pronunciation.mp3` |
| ボタンのラベル | 「発音」のまま（音源あり＝マイク＋通常枠線 / 自動音声＝▶＋薄い） |
| 読み上げる対象 | 例文の英文のみ |
| 単語テストの TG 形式 | ボタンを増やさず、鳴る対象を見出し語 → 例文へ差し替え |
| 自動再生・プリロード | ボタンと同じ対象（TG 形式では例文） |
| `(…)` の読み | 括弧記号だけ落として中身は読む |
| `[…]` の読み | 中身ごと落とす |
| `A` / `B` / `do` / `doing` | 落とさない（英語として読む） |

## チケット（1 チケット = 1 PR）

### T1. 例文に発音音源を持たせる（基盤）

音源を登録できる状態にするまで。UI の発音ボタンは T2 で足すので、この PR 単体では
「編集画面から登録できるが、詳細画面ではまだ鳴らない」状態になる。

- `prisma/schema.prisma` — `Example.pronunciationAudioUrl String? @map("pronunciation_audio_url")`
  ＋ migration（列追加のみ、backfill 不要）
- `src/lib/pronunciation-audio.ts` — `exampleTarget`（`dir: "example"`）・`ExampleNotFoundError`・
  `uploadExampleAudioForUser` / `deleteExampleAudioForUser`。`AudioTarget` に足すだけで
  put → update → 旧 del・owner 検証は継承される
- `src/app/words/[id]/edit/actions.ts` — `uploadExampleAudio` / `deleteExampleAudio`、
  `mapAudioError` に `ExampleNotFoundError` を追加
- `src/lib/schema/word-form.ts` — `exampleSchema` に読み取り専用 `pronunciationAudioUrl`、
  `wordDetailToFormValues` のマッピング（意味・関連語と同じ扱い。書き込み handler は触らない
  → `src/lib/words/CLAUDE.md`）
- `src/app/words/new/_components/examples-fields.tsx` — `PronunciationAudioManager` を「音源」
  フィールドとして設置。保存前（`id` 未確定）は「音源は保存してから追加できます。」、
  system 所有行では出さない（`meanings-fields.tsx` の分岐をなぞる）
- **孤児 Blob 回収に例文を追加**（漏らすと孤児 Blob が残る）:
  `words-delete.ts` / `words-update.ts`（orphan 収集）/ `admin-user-delete.ts` /
  `occurrence-purge.ts` / `blob-purge.ts`
- **一括プリフェッチの対象に追加**（漏らすとオフラインで取りこぼす）:
  `audio-manifest.ts` の `listAudioUrlsForUser` / `countAudioUrlsForUser`
- テスト更新: `pronunciation-audio.{unit,integration}.test.ts` / `audio-manifest.integration.test.ts` /
  `occurrence-purge.integration.test.ts` / `admin-user-delete.integration.test.ts` /
  `blob-purge.unit.test.ts` / `words-detail.integration.test.ts`
- `src/lib/words-detail.ts` は `include` 取得なので列追加で自動的に載る（変更不要の確認だけ）

### T2. 単語詳細の例文に発音ボタン＋読み上げ正規化

- `src/components/word-detail-view.tsx` の `ExampleCard` に `AudioPlayButton`
  （`src` = 例文の音源、`label="発音"`、`ttsText` = 例文の英文）。配置は `MeaningCard` /
  `RelatedWordCard` と同じ `metaRowClassName` の行（カード上部）。`empty:hidden` により、
  音源なし・自動音声 OFF のときは行ごと畳まれる
- `src/lib/speech.ts` の `toSpokenText` に括弧処理（ADR-0081）。`speech.unit.test.ts` に
  `(be) similar to 〜` / `consider A (to be) B` / `compare A with [to] B` のケースを追加

### T3. 単語テスト（TG）の発音ボタンを例文へ差し替え

- `src/lib/quiz/queries/quiz-source.ts` — TG 例文取得の select に音源 URL
- `src/lib/quiz/generation/material.ts` — `TgExampleRow` / `QuizWord.tgExample` に `audioUrl`
- `src/lib/quiz/payload.ts` — TG 系 4 形式（`CHOICE_TG` / `CHOICE_TG_JA_EN` / `SELF_JUDGE_TG` /
  `SELF_JUDGE_TG_JA_EN`）に例文音源 URL を追加
- UI 差し替え:
  - `quiz-flow.tsx` の `promptView.kind === "tg-text"` の `AudioPlayButton`
  - `question-choice.tsx` の正解選択肢（`showCorrectAudio`）— TG 形式のとき例文を鳴らすよう
    props を一般化する
  - `revealed-headword-card.tsx` — 同上（TG自己判定（日→英）の解答カード）
  - `result-list.tsx` の `tg-text` / `tg-meaning` 行
- `quiz-flow.tsx` の**自動再生（出題時 effect / `handleAnswerReveal`）とプリロードも同じ対象へ**
- テスト更新: `choice-tg*.unit.test.ts` / `self-judge-tg*.unit.test.ts` / `material.unit.test.ts` /
  `build-quiz.unit.test.ts` / `quiz-generate.integration.test.ts`

### T4. 機能紹介ドキュメントの更新

- `docs/features/word-management.md` — 例文にも音源を登録でき、未登録なら自動音声で英文を読み上げる旨
- `docs/features/settings.md` — 自動音声の説明に例文が含まれる旨、括弧の読み方
- `docs/features/word-quiz.md` — TG 形式の発音ボタン・自動再生が例文を鳴らす旨
- 画面が変わるセクションのスクリーンショット再撮影（`pnpm e2e:capture-docs --only <section>`。
  被写体が足りなければ `scripts/e2e/db.ts` に冪等 seed を足す）
- `docs/reference/naming-book.md` — `pronunciationAudioUrl` の説明に Example を追加

## 並行実行

依存は「`Example.pronunciationAudioUrl` の Prisma 型があるか」だけで決まる。

```
T1 基盤 ──┬──▶ T2a 単語詳細の発音ボタン ─┐
          └──▶ T3 単語テスト（TG）      ─┤
                                          ├──▶ T4 機能紹介ドキュメント
T2b 括弧の読み上げ正規化 ─────────────────┘
```

- **T1 と T2b は最初から並行できる**。T2b は `src/lib/speech.ts` と `speech.unit.test.ts` だけで、
  DB も Prisma 型も触らない
- **T2a と T3 は T1 のマージ後に並行できる**。触るファイルが分かれている
  （T2a = `word-detail-view.tsx` / T3 = `src/lib/quiz/**`・`src/app/quiz/_components/**`）
- T2a / T3 を T1 より前に始めると、列が無いため型エラーで進まない
- **worktree を使う場合**: DB は単一 `dejaword` を共有する（[ADR-0054](../../adr/0054-worktree-shared-db-blob.md)）。
  migration を打つのは T1 だけなので、T1 マージ後に他レーンの worktree で `pnpm db:migrate` を回す

## 検証

各チケット共通:

- `pnpm test:unit` / `pnpm test:integration` / `pnpm lint` / `pnpm build`

ブラウザ E2E（`.claude/skills/e2e-verify`）— T2 / T3 完了時:

1. 例文に mp3 を登録 → 単語詳細でマイクアイコンになり音源が鳴る
2. 音源を削除 → ▶ の薄い表示に戻り、自動音声で例文の英文が読まれる
3. `compare A with [to] B` を持つ単語で「compare A with B」と読まれる（`[to]` を読まない）
4. `consider A (to be) B` が「consider A to be B」と読まれる
5. TG四択（英→日）を実行 → 上部の発音ボタン・出題時の自動再生が例文になっている
6. 自動音声フォールバックを設定で OFF にすると、音源なしの例文ではボタンが出ない
7. 単語を削除 → `.dev-blob/audio/example/<id>/` が消えている（孤児 Blob が残らない）
