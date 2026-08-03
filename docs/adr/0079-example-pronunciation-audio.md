# ADR-0079: 例文にも発音音源を持たせる（発音記号は持たせない）

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-08-03

## 背景

発音音源（mp3）を持てるのは Meaning（英単語）と RelatedWord（関連語）だけで、Example（例文）は
音を一切出せなかった。読み上げの入口（`speakEnglish`）も発音ボタン（`AudioPlayButton`）も既にあるが、
例文には音源カラムもボタンも無く、繋がっていない。

例文（TG例文・成句・熟語・MP例文・例文）は「その単語がどう使われるか」を覚える素材であり、単語単独の
発音より文としての読みを聞きたい場面がある（issue #170）。

音源の入手が難しい点は見出し語と同じなので、[ADR-0046](0046-tts-fallback.md) と同じく
**音源があれば音源、無ければ自動音声（TTS）**の 2 段構えにする。

## 決定内容

`Example` に発音音源を持たせる。

- `Example.pronunciationAudioUrl String? @map("pronunciation_audio_url")` を追加する。
  Meaning / RelatedWord と**同じフィールド名・同じカラム名**にする。
- **発音記号（`pronunciation`）は追加しない**（ユーザー明示要件）。例文は文であり、文全体の発音記号を
  書く実務が無い。編集 UI も「音源」だけを出し、意味カードのような「記号／音源」2 段構えにはしない。
- Blob 管理は `src/lib/pronunciation-audio.ts` の `AudioTarget` ディスクリプタに 3 つ目を足すだけで済ませる
  （`dir: "example"` → `audio/example/<exampleId>/pronunciation.mp3`）。put → update → 旧 del の順序契約
  （[ADR-0044](0044-blob-best-effort-delete.md)）、owner 本人のみ操作可、`bestEffortDeleteAudioUrls` に
  よる孤児回収はそのまま継承する。
- **一括取り込み（`db:import-audio` / `src/lib/audio-import.ts`）は例文を対象にしない**。突合キーが
  掲載番号（＝単語単位）で、例文に対応する一括ソースが無い。例文の音源は個別アップロードのみ。

「音源が無ければ TTS」の読み上げ対象は**例文の英文**であり、和訳（`Example.meaning`）は読み上げない
（`speakEnglish` は en-US 固定。日本語読み上げは別途 lang の出し分け設計が要るため、issue #170 の
スコープから外した）。

## 採らなかった代替案

- **例文は TTS 専用にして音源カラムを持たない** — 実装は最小で済むが、TTS の品質は端末依存で
  「正しい発音として覚えてよいか」が担保できない（[ADR-0076](0076-audio-source-visual-distinction.md)
  が区別を設けた理由と同じ）。見出し語と関連語だけ音源を登録できて例文はできない、という非対称も
  説明しにくい。
- **例文にも発音記号を持たせる** — 文全体の発音記号を書く実務が無く、入力欄が使われないまま残る。
  ユーザーが明示的に不要とした。
- **音源を別テーブル（`ExampleAudio` 等）に切り出す** — 1 例文 1 音源で多重度が増えないため、
  側テーブル化の条件（[ADR-0008](0008-side-table-addition.md)）を満たさない。既存 2 箇所と
  形を変えると `AudioTarget` の共通化も効かなくなる。
- **`audioUrl` など新しいフィールド名にする** — 例文は「発音」ではなく「読み上げ」なので名前としては
  正確だが、横断コード（孤児回収・プリフェッチ・purge）が同じフィールド名で書けなくなる。
  ドメイン用語としては `pronunciationAudioUrl` ＝「発音音源」で統一する
  （`docs/reference/naming-book.md`）。

## 影響

- migration が 1 本増える（列追加のみ、backfill 不要）。
- 音源 URL を横断で扱う箇所すべてに Example を足す必要がある。漏らすと**孤児 Blob が残る**か
  **プリフェッチの取りこぼし**になる:
  - 孤児回収: `words-delete.ts` / `words-update.ts`（orphan 収集）/ `admin-user-delete.ts` /
    `occurrence-purge.ts` / `blob-purge.ts`
  - 一括プリフェッチ（[ADR-0075](0075-audio-local-cache-and-prefetch.md)）: `audio-manifest.ts`
- 編集フォームの `pronunciationAudioUrl` は意味・関連語と同じ**読み取り専用フィールド**の扱いになる
  （書き込み handler は触らない。`src/lib/words/CLAUDE.md` 参照）。
- 単語詳細・単語テストの発音ボタンが例文にも出るようになり、`docs/features/` のスクリーンショット
  再撮影が必要になる。

## 根拠（コード・文書参照）

- `src/lib/pronunciation-audio.ts` — `AudioTarget`（保持先だけ差し替える記述子）
- `prisma/schema.prisma` — `Meaning.pronunciationAudioUrl` / `RelatedWord.pronunciationAudioUrl`
- [ADR-0046](0046-tts-fallback.md) — 音源優先・TTS は代替という前提
- [ADR-0044](0044-blob-best-effort-delete.md) — put → update → del の順序契約
- [ADR-0075](0075-audio-local-cache-and-prefetch.md) — プリフェッチ対象の manifest
- [ADR-0080](0080-tg-example-audio-over-headword.md) — 単語テストでこの音源を鳴らす画面
- issue #170 — 例文の読み上げ要望
