# 04. word-detail-example-playback（単語詳細の例文再生 UI）

状態: **完了**（2026-08-04）　PR: （未作成）

## 目的

単語詳細の例文カード上部にメタ行を新設し、`AudioPlayButton` を 1 つ置く。全例文種別（TARGET / PHRASE / MINIMAL / SENTENCE）で、登録済み音源があればそれを、無ければ例文の英文を TTS で読み上げられるようにする。

スコープ外:

- 見出し語・関連語のボタンの変更（[05-ui-playback.md](../../design/example-audio/05-ui-playback.md) 決定 1）
- 単語テストでの差し替え（→ 05）
- 音源の登録・削除（→ 01 / 02）
- `src/components/audio-play-button.tsx` の変更（無改造で再利用）（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 4）
- `src/lib/words-detail.ts` の変更。examples は `select` ではなく `include` で取っているため、`Example` にカラムを足せば `WordDetail["examples"][number]` に自動的に載る。クエリの修正は不要（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 2）
- 単語一覧・編集フォームでの読み上げ（[01-requirements.md](../../design/example-audio/01-requirements.md) 決定 5）

## 依存チケット

- 01: `Example.pronunciationAudioUrl` カラム（`example.pronunciationAudioUrl` を `src` に渡すため）

## 前提（設計決定の再掲）

- `ExampleCard`（`src/components/word-detail-view.tsx`）に、意味カード・関連語カードと同じ `metaRowClassName`（`"flex flex-wrap items-center gap-2 empty:hidden"`）の行を追加し、`AudioPlayButton` を 1 つ置く。**全例文種別で同じ扱い**にする（[05-ui-playback.md](../../design/example-audio/05-ui-playback.md) 決定 1、[01-requirements.md](../../design/example-audio/01-requirements.md) 決定 2）

  ```tsx
  <div className={metaRowClassName}>
    <AudioPlayButton src={example.pronunciationAudioUrl} label="発音" ttsText={example.text} />
  </div>
  ```

- `ttsText` は例文の英文（`Example.text`）。**和訳（`Example.meaning`）は渡さない**。装飾記法・括弧・プレースホルダの除去は `toSpokenText` が行うので、ここでは生テキストをそのまま渡す（[05-ui-playback.md](../../design/example-audio/05-ui-playback.md) 決定 1、[01-requirements.md](../../design/example-audio/01-requirements.md) 決定 1）
- ラベルは既存どおり「発音」固定。音源あり＝マイクアイコン、自動音声＝再生アイコンの描き分け（ADR-0076）は `AudioPlayButton` の内部実装なので自動的に効く（[05-ui-playback.md](../../design/example-audio/05-ui-playback.md) 決定 1）
- 音源も自動音声も使えないときは**ボタンごと非表示**にする。`reserveSpaceWhenEmpty` は**渡さない**ため `AudioPlayButton` が `null` を返し、メタ行は `empty:hidden` で畳まれる。プレースホルダで幅を確保するのは列幅を揃える必要がある文脈（`RowAudioButton`）だけで、縦積みのカードには当てはまらない（[05-ui-playback.md](../../design/example-audio/05-ui-playback.md) 決定 2）
- `AudioPlayButton` の既存挙動: props は `{ src, label, ttsText?, reserveSpaceWhenEmpty? }`、`hasAudio = Boolean(src)`、`showTts = !hasAudio && 設定ON && ttsText あり && ブラウザ対応`。どちらも false なら `null` を返す。サイズは `size="xs"` 固定（[05-ui-playback.md](../../design/example-audio/05-ui-playback.md) 前提）
- 例文の発音記号は無いため、意味カード・関連語カードのメタ行にある発音記号相当の要素は置かない（[01-requirements.md](../../design/example-audio/01-requirements.md) 決定 4）

## 実装内容

### 変更: `src/components/word-detail-view.tsx`

`ExampleCard` に、意味カード・関連語カードと同じ `metaRowClassName` のメタ行をカード上部へ新設し、前提のコードブロックのとおり `AudioPlayButton` を 1 つ置く。既存の意味カード・関連語カードのボタンには手を入れない。

## 完了条件（Definition of Done）

- [ ] **テストは新設しない**。`AudioPlayButton` / `word-detail-view` のコンポーネントテストは既存に 1 つも無く、本機能のためだけに導入しない。表示の確認は E2E とスクリーンショット（07）で足りる（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 5）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` が通る（既存テストの回帰がないこと）
- [ ] 手動確認（`pnpm dev`、単語詳細画面）:
  - [ ] 音源を登録した例文でマイクアイコンの「発音」ボタンが出て、登録した mp3 が鳴る
  - [ ] 音源未登録の例文で、自動音声設定 ON なら再生アイコンの「発音」ボタンが出て英文が読み上げられる
  - [ ] 音源未登録かつ自動音声設定 OFF の例文では、ボタンだけでなくメタ行ごと畳まれて余白が残らない
  - [ ] TARGET / PHRASE / MINIMAL / SENTENCE の全種別で同じ位置にボタンが出る
  - [ ] 和訳が読み上げられないこと

## 実装メモ

- 計画との差分なし。チケット記載のコードブロックどおり（`word-detail-view.tsx` に +3 行のみ）。`reserveSpaceWhenEmpty` は渡さず、音源・自動音声とも不可のときは `empty:hidden` でメタ行ごと畳まれる。
- `MeaningCard` / `RelatedWordCard` は `nonEmpty(...)` を通して `src` に渡すが、`ExampleCard` はチケット指定どおり `example.pronunciationAudioUrl` を直渡し。`AudioPlayButton` は `hasAudio = Boolean(src)` 判定のため空文字は同挙動で、差が出るのは空白のみの文字列が DB に入った場合だけ（01 / 02 の登録経路では生じない）。
- 手動確認項目は**すべて未実施**。1 項目め（登録済み音源の再生）は音源登録 UI（02）に依存するため、02 と合わせた確認が妥当。
