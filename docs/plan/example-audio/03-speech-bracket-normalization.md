# 03. speech-bracket-normalization（読み上げの括弧正規化）

状態: **未着手**　PR: （未作成）

## 目的

TTS 読み上げ直前のテキスト正規化（`toSpokenText`）に括弧規則を追加し、`(…)` は括弧記号だけ落として中身を読む／`[…]` は中身ごと落とす、という出し分けを実装する。あわせて表示側 `TG_TEXT_PATTERN` のハイライト対象に全角括弧を足して、読み上げと表示の対象字形を揃える。

スコープ外:

- スラッシュ `/`・引用符 `"` `'` `“` `”` など括弧以外の記号（本番の英文データに 0 件のため今回は扱わない。将来必要になったら `toSpokenText` に 1 規則足す）（[04-speech-normalization.md](../../design/example-audio/04-speech-normalization.md) 決定 6）
- 保存データ（`Example.text` 等）の書き換え。括弧は表示としては必要な情報なので保存物は変えない（[04-speech-normalization.md](../../design/example-audio/04-speech-normalization.md) 決定 1）
- 例文の音源・再生 UI（→ 01 / 04 / 05）

## 依存チケット

なし（並行着手可）。`Example.pronunciationAudioUrl` にも quiz にも依存しない。

**05 との関係**: TG例文の TTS 読み上げ品質は本チケットの括弧規則に依存するため、05 は本チケットのマージ後に着手するのが望ましい。ただし 05 は本チケット未マージでも単独でマージ可能（依存宣言はしない）。

## 前提（設計決定の再掲）

- 括弧は意味で出し分ける。`(…)` は**記号だけ落として中身を読む**、`[…]` は**中身ごと落とす**。読み上げ結果（[04-speech-normalization.md](../../design/example-audio/04-speech-normalization.md) 決定 1）

  | 入力 | 読み上げ |
  | --- | --- |
  | `(be) similar to 〜` | `be similar to` |
  | `consider A (to be) B` | `consider A to be B` |
  | `demand that A (should) do` | `demand that A should do` |
  | `suggest (to 〜) that ...` | `suggest to that` |
  | `compare A with [to] B` | `compare A with B` |

- `A` / `B` / `do` / `doing` は落とさず英語として読ませる（naming-book のプレースホルダ語）（[04-speech-normalization.md](../../design/example-audio/04-speech-normalization.md) 決定 1）
- 実装は 2 段。(1) `[…]`（半角・全角）のペアが取れる箇所を**中身ごと**除去する → (2) 残った括弧記号 `(` `)` `[` `]` `（` `）` `［` `］` を**記号単体で**除去する。丸括弧はそもそもペア判定しない（(2) の一律除去だけで決定 1 を満たす）。ペアが取れない括弧・ネストは「記号だけ落として中身は読む」に倒す（[04-speech-normalization.md](../../design/example-audio/04-speech-normalization.md) 決定 2）

  | 入力 | 読み上げ | 経路 |
  | --- | --- | --- |
  | `consider A (to be B` | `consider A to be B` | 丸括弧はペア判定しない（(2) のみ） |
  | `compare A with [to B` | `compare A with to B` | (1) が不一致 → (2) で記号のみ除去 |
  | `(a (b) c)` | `a b c` | 丸括弧は入れ子でも記号が全部落ちる |
  | `compare A with (to [or] from) B` | `compare A with to from B` | (1) で `[or]` が消え、(2) で丸括弧の記号が落ちる |

- 括弧は**半角・全角の両字形**を対象とする（`(` `)` `[` `]` `（` `）` `［` `］`）。あわせて `TG_TEXT_PATTERN`（`src/components/tg-example-text.tsx`）の括弧にも全角字形を追加し、**同一チケットで揃える**（読み上げでは落ちるが表示ではハイライトが付かない、という非対称を残さない）（[04-speech-normalization.md](../../design/example-audio/04-speech-normalization.md) 決定 3）
- 除去順序は「装飾記法（`stripRichTextMarkup`）→ `【…】`（中身ごと）→ `[…]`（中身ごと）→ 残存括弧記号 → プレースホルダ（`...` 3 個以上・`…`・チルダ 3 字形）→ 空白畳み込み（`\s+` → 1 個）＋ `trim()`」。既存 3 規則の間に括弧処理を挟み、最後の畳み込みと `trim()` はそのまま通す。除去は既存と同じく**空文字ではなく空白 1 個への置換**とし、語の結合（`A(B)` → `AB`）を防ぐ（[04-speech-normalization.md](../../design/example-audio/04-speech-normalization.md) 決定 4）
- 既存テスト `speech.unit.test.ts` が固定している期待値 `suggest (to ) that` は、本決定で **`suggest to that` に更新される**（丸括弧処理の後にプレースホルダ処理が走るため）（[04-speech-normalization.md](../../design/example-audio/04-speech-normalization.md) 決定 4、[06-architecture.md](../../design/example-audio/06-architecture.md) 前提）
- 括弧規則は `toSpokenText`（`src/lib/speech.ts`）の **1 箇所にのみ**追加し、例文専用の分岐や引数（種別・フィールドの区別）は設けない。結果として見出し語（`Word.headword`）・関連語の見出し（`RelatedWord.term`）の読み上げにも同じ規則が掛かる（本番データに括弧を含む見出し語・関連語は現時点で無い）。`toSpokenText` は読み上げの一本道 `speakEnglish` の入口 1 箇所からのみ呼ばれ、ブラウザ `speechSynthesis` 経路と Android ネイティブブリッジ経路（ADR-0073）の両方に効く（[04-speech-normalization.md](../../design/example-audio/04-speech-normalization.md) 決定 5）
- 登録済み mp3 の再生経路（`<audio>` / `preloadAudio`）は正規化を通らないため、音源がある行の聞こえ方は一切変わらない。正規化の追加によって本文の表示が変わることもない（表示側の変更は `TG_TEXT_PATTERN` のハイライト対象拡張のみ）（[04-speech-normalization.md](../../design/example-audio/04-speech-normalization.md) 決定 5）

## 実装内容

### 変更: `src/lib/speech.ts`

`toSpokenText` に括弧処理を 2 段で追加する。挿入位置は既存の `【…】` 除去の**直後**、プレースホルダ除去の**直前**。

1. `[…]` / `［…］` のペアが取れる箇所を中身ごと空白 1 個へ置換（半角・全角の開き／閉じを両方受ける）
2. 残存する括弧記号 `(` `)` `[` `]` `（` `）` `［` `］` を空白 1 個へ置換

既存の `\s+` 畳み込みと `trim()` はそのまま最後に通す。

### 変更: `src/components/tg-example-text.tsx`

`TG_TEXT_PATTERN` の括弧に全角字形（`（` `）` `［` `］`）を追加する（正規表現 1 行の拡張）。ハイライトの体裁自体は変えない。

## 完了条件（Definition of Done）

- [ ] unit（`pnpm test:unit`）: `src/lib/speech.unit.test.ts` に括弧規則のケースを追加（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 5）
  - [ ] 丸括弧は中身を読む: `(be) similar to 〜` → `be similar to`
  - [ ] 丸括弧は中身を読む: `consider A (to be) B` → `consider A to be B`
  - [ ] 角括弧は中身ごと落とす: `compare A with [to] B` → `compare A with B`
  - [ ] ペア不一致: `compare A with [to B` → `compare A with to B`
  - [ ] 全角字形が半角と同じに扱われる
  - [ ] 丸括弧内の角括弧: `compare A with (to [or] from) B` → `compare A with to from B`
  - [ ] `A` / `B` / `do` / `doing` が落ちないこと（[04-speech-normalization.md](../../design/example-audio/04-speech-normalization.md) 決定 1）
- [ ] unit: 既存ケースの期待値 `suggest (to ) that` を `suggest to that` に更新（[04-speech-normalization.md](../../design/example-audio/04-speech-normalization.md) 決定 4）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る（本チケットは DB を触らないため integration は不要。念のため通すなら `pnpm test`）
- [ ] 手動確認（`pnpm dev`）: 括弧を含む TG例文の表示で、全角括弧にも半角と同じハイライトが付く

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
