# 単語アーカイブ 設計ドキュメント（ハブ）

学習を終えた単語を一覧から片付けて、必要なときだけ見返せるようにする機能の設計ドキュメント群の入口。
**単語アーカイブ の設計に関わるセッションは、必ずこのファイルから読み始めること。**

## 目的・スコープ

覚え終わった単語で一覧が埋まらないようにし、いま学習中の単語に集中できるようにする。単語データの削除はしない（いつでも戻せる）。

スコープは [01-requirements.md](01-requirements.md) の決定・却下案で定義する。

## 確定事項サマリ

結論のみを記載する。採用理由・却下した代替案は各トピックファイルを参照。

- **アーカイブは単語単位のオン/オフで本人専用**。単語データ自体は変更しない。→ [01](01-requirements.md)
- **アーカイブ済みは通常の単語一覧から隠し、絞り込みで見返す・戻すができる**。→ [01](01-requirements.md)
- **保存は中間テーブル UserWordArchive、単語削除時はアーカイブ状態も削除**。→ [02](02-data-model.md)
- **アーカイブ済み除外は一覧取得クエリ側で既定除外し、全一覧・ナビ経路に統一適用**。絞り込みで「アーカイブのみ表示」へ切り替える。→ [03](03-architecture.md)
- **アーカイブ/解除は Server Action → UseCase（words-archive.ts）で本人スコープの UserWordArchive 行を作成/削除（冪等）**。→ [03](03-architecture.md)
- **テストは除外述語を純関数として unit、操作〜一覧反映を E2E 1本**。→ [03](03-architecture.md)

## トピック状態表

状態: `未着手` → `議論中` → `確定`

| ファイル | 状態 | 要約 |
| --- | --- | --- |
| [01-requirements.md](01-requirements.md) | 確定（2026-07-05） | アーカイブの単位・所有・見え方 |
| [02-data-model.md](02-data-model.md) | 確定（2026-07-06） | 保存形態・削除時の扱い |
| [03-architecture.md](03-architecture.md) | 確定（2026-07-08） | 除外の適用方式・書き込み経路・テスト戦略 |

**全トピック確定。設計は完了**。実装フェーズの分割は下記「実装への引き継ぎ」を起点に ticket-split スキルで行う。

## セッション運用ルール

1. **読み込みは「ハブ + 対象トピック1ファイル」に限定する**。他のトピックファイルは原則読まない。依存する決定は各ファイル冒頭の「前提」に再掲されている。
2. **仕様書・設計書に記載した後は、毎回必ず整合性レビューを実施する**（成立しない記述・二重定義・決定間の矛盾・曖昧なシグネチャ等。観点は design-session スキル参照）。修正してから次へ進む。
3. **セッション終了（クリア）前に、このファイルの状態表と確定事項サマリを必ず更新する**。これが次セッションへの引き継ぎとなる。
4. **議論の過程・却下案・採用理由はトピックファイルに残し、ハブには昇格させない**。ハブには結論のみ（各1〜3行）を書く。
5. **既存の確定事項を覆す場合は、ハブのサマリと元トピックファイルの両方を更新する**。あわせて、その決定を「前提」に再掲している他ファイルも更新する。
6. 全トピック確定後、ハブに「実装への引き継ぎ」セクションを追記して設計を閉じる。実装フェーズの分割計画は別途 `docs/plan/` で扱う（このディレクトリは設計のみ）。

## 実装への引き継ぎ

チケット分割（ticket-split スキル）が全トピックを読み直さずに開始できるための棚卸し。詳細が要る場合のみ各決定（`NN-xxx.md の決定 N`）を参照する。

### 変更対象の一覧

- **スキーマ変更 / マイグレーション**（→ [02](02-data-model.md) 決定 1・2 / [03](03-architecture.md) 決定 1）
  - 新規モデル `UserWordArchive`（`@@map("user_word_archive")`）: `userId` + `wordId`、複合主キー `@@id([userId, wordId])`、両 FK `onDelete: Cascade`、各 FK に `@@index`。`OccurrencePresetSetting`（`prisma/schema.prisma`）を構造の範とする。
  - 既存 `Word` に逆リレーション `userWordArchives UserWordArchive[]` を追加（除外述語 `some` / `none` を張るために必要）。
  - マイグレーション 1 本。
- **新規モジュール / ファイル**
  - `src/lib/words-archive.ts`（`server-only`）: `archiveWord` / `unarchiveWord`（本人スコープで `UserWordArchive` 行を作成 / 削除、冪等）。→ [03](03-architecture.md) 決定 3
  - 除外述語の純ヘルパー `archiveExclusionWhere(userId, mode)`: `Word` スコープの `where` 断片（`{ userWordArchives: { none|some: { userId } } }`）を返す純関数。unit テスト対象。words-view はこれを `where` に直接展開、occurrence-view / 隣接ナビは `word: {...}` の下にネストして置く。→ [03](03-architecture.md) 決定 1・4
  - Server Action（`src/app/**`）: アーカイブ / 解除。Result 型を返す。
- **既存ファイルの変更**
  - `src/lib/words-list.ts`: 共有 where / where-builder（`listWordsForUser`、`buildWordsByOccurrenceWhere` 経由の `listWordsByOccurrence`、隣接ナビ `findAdjacentWordsByOccurrence` / `findAdjacentWordsByOccurrenceNumber`）に除外述語を組み込む。`WordListParams` にアーカイブ表示モードを追加。→ [03](03-architecture.md) 決定 1・2
  - `src/app/words/page.tsx`: 検索クエリパラメータでアーカイブ表示モードを受け取り、`skip`/`take`/`total` の算出に流す。
- **UI コンポーネント**
  - 一覧のアーカイブ絞り込みトグル（通常 / アーカイブのみ）。
  - 各単語のアーカイブ / 解除操作（一覧または詳細）。

### 着手順序のヒント

共有基盤 → 依存方向に沿って積む: **スキーマ + マイグレーション → 純ヘルパー `archiveExclusionWhere`（unit test 付き）→ `words-archive` UseCase ＋ where への除外組み込み → Server Action → UI → E2E**。競合しやすい共有物は `src/lib/words-list.ts` の where / where-builder（複数の一覧・ナビ経路が同じ where を共有するため、除外述語の組み込みは1本のチケットにまとめるのが安全）。

### テスト戦略の要点（チケット完了条件に転記可）

- unit: `archiveExclusionWhere` — 既定は `none` 述語 / 絞り込み時は `some` 述語 / `userId` が述語内に正しく閉じ込められる。
- E2E: `scripts/e2e/verify-archive.ts`（`pnpm e2e:archive`）— `test1` で単語をアーカイブ → `/words` から消える → アーカイブ絞り込みで見える → 解除で一覧に戻る。
- 一覧クエリ本体は ADR-0056 によりクエリの検証層が integration のため unit を持たない。DB レベルの回帰固定が必要になった場合のみ `words-list.integration.test.ts` に除外・スコープのアサーションを追加する。

### 用語

- 実装時に `docs/reference/naming-book.md` へ「アーカイブ（archived）/ アーカイブ解除」と `UserWordArchive` を追加する（現状コード・schema・naming-book に archive 語は未登録）。

### チケット分割

チケットは ticket-split スキルで `docs/plan/word-archive/` に生成する（形式は ticket-split 側で定義）。
