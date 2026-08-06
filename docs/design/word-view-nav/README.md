# word-view-nav 設計ドキュメント（ハブ）

単語詳細の前後ナビを「ユーザーが直前に見ていた一覧の並び順・絞り込み」に追随させる機能の設計ドキュメント群の入口。
**word-view-nav の設計に関わるセッションは、必ずこのファイルから読み始めること。**

## 目的・スコープ

単語詳細の前後ナビ（単語詳細ページと、単語テスト結果から開く単語詳細ダイアログ）を、直前に見ていた一覧の並び・絞り込みと一致させる。対象は次の 3 経路:

1. **単語ビュー → 単語詳細ページ**: 現状は一覧状態を URL に引き継がず前後ナビ自体が出ない。並び順（新着順/見出し順）・検索・ブックマーク絞り込みを引き継いだ前後ナビを追加する
2. **掲載箇所ビュー → 単語詳細ページ**: 前後ナビは既にあるが、ブックマーク絞り込みだけコンテキストに欠けている。これを補完する
3. **テスト結果一覧 → 単語詳細ダイアログ**: 現状は結果一覧と無関係に掲載箇所全体を掲載番号昇順で辿る。結果一覧に並んでいる順（出題順）で移動できるようにする

スコープの詳細（何をやる / やらない）は [01-requirements.md](01-requirements.md) で定義する。

## 確定事項サマリ

結論のみを記載する。採用理由・却下した代替案は各トピックファイルを参照。

- **対象は 3 経路。いずれも「直前に見ていた一覧の並び・絞り込み」にナビを一致させる**。単語ビュー由来の詳細ページに前後ナビを新設（sort / q / match / bookmarked 引き継ぎ）、掲載箇所コンテキストに bookmarked を追加、テスト結果ダイアログは結果一覧順（= 出題順）ナビに変更。→ [01](01-requirements.md)
- **「間違えた問題だけ表示」で絞り込み中のダイアログナビは、表示中の行だけを辿る**。→ [01](01-requirements.md)
- **全件ブックマークモードのテストでも前後ナビを出す**。→ [01](01-requirements.md)
- **スコープ外**: 一覧ソート機能自体の追加・変更、関連語スタック先のナビ非表示の解除、ナビ順序と無関係な既存挙動の変更。→ [01](01-requirements.md)
- **単語ビューコンテキストは `view=word` を判別子に `sort` / `q` / `match` / `bookmarked` を詳細 URL に載せる**。`occ` があれば掲載箇所コンテキストが優先、デフォルト値は省略。→ [02](02-list-nav-context.md)
- **コンテキスト型は kind 付き union `WordDetailNavContext` に一般化し、掲載箇所コンテキストに `bookmarked` を追加**（隣接クエリ・詳細リンク・戻りリンクに反映）。→ [02](02-list-nav-context.md)
- **単語ビュー用隣接クエリ `findAdjacentWordsInWordView` を新設**。一覧と where を共有し、タプル比較（recent = createdAt desc, id desc / headword = headword asc, id asc）で prev / next を引く。戻り値に掲載番号は含めない。→ [02](02-list-nav-context.md)
- **current が絞り込み集合から外れたら前後ナビ非表示**（既存踏襲）。→ [02](02-list-nav-context.md)
- **戻り・編集リンクはコンテキストから再構築し、`page` は持ち回らない**。→ [02](02-list-nav-context.md)
- **テスト結果ダイアログの前後ナビは「開いた時点の表示行」のクライアントスナップショット（wordId 配列）を順序ソースとする**。`onOpenDialog` の引数で渡し、quiz-flow が `dialogNavOrder` として保持。ナビ表示条件は `navOrder` 非 null かつスタック深さ 1 で、`occurrenceId` に依存しない（全件ブックマークモードでもナビが出る）。→ [03](03-quiz-result-dialog-nav.md)
- **`getAdjacentWordsForDialog` action と `findAdjacentWordsByOccurrenceNumber` は廃止する**（隣接応答系 state は同期導出に置き換え）。→ [03](03-quiz-result-dialog-nav.md)
- **ダイアログの `#N` は詳細応答の掲載箇所一覧から導出する**（全件ブックマークモードは `#N` なし）。→ [03](03-quiz-result-dialog-nav.md)
- **削除済み単語の行はナビからスキップしない**（エラービューでもナビ継続可能）。→ [03](03-quiz-result-dialog-nav.md)
- **ダイアログの先読みは `navOrder` 前後 1 件の詳細のみ**（隣接先読みは廃止、全件ブックマークモードでも有効）。→ [03](03-quiz-result-dialog-nav.md)
- **ページ側ナビは既存コンポーネント（`WordNavArea` / `AdjacentWordNav` / `WordContentTransition`）を流用し、新規 UI は作らない**。ダイアログのナビ行は `AdjacentWordNav` と共通化せず直書きを維持する。→ [04](04-ui-architecture.md)
- **テスト戦略**: パーサは unit（判別順・デフォルト省略）、単語ビュー隣接クエリは integration（`createdAt` 同値の id tiebreak 必須）、ダイアログ state は navOrder ベースへ unit 書き換え。`.tsx` はテスト対象外の方針を維持。→ [04](04-ui-architecture.md)
- **`docs/features/` は word-management.md と word-quiz.md を改訂し、スクリーンショットは再撮影・追加しない**。→ [04](04-ui-architecture.md)
- **ADR を 2 本起票する**（02 の URL コンテキスト追随、03 のクライアント配列ナビ化。後者に ADR-0086 の隣接先読み置き換えを明記し 0086 本文へ注記追加）。naming-book に「前後ナビ」「単語ビュー / 掲載箇所ビュー」を追加。→ [04](04-ui-architecture.md)

## トピック状態表

状態: `未着手` → `議論中` → `確定`

| ファイル | 状態 | 要約 |
| --- | --- | --- |
| [01-requirements.md](01-requirements.md) | **確定**（2026-08-07） | 要求・対象 3 経路の期待挙動・スコープ外 |
| [02-list-nav-context.md](02-list-nav-context.md) | **確定**（2026-08-07） | 単語一覧 → 詳細ページの URL コンテキスト設計と隣接クエリ |
| [03-quiz-result-dialog-nav.md](03-quiz-result-dialog-nav.md) | **確定**（2026-08-07） | テスト結果一覧 → 詳細ダイアログの順序ソースとナビ実装方式 |
| [04-ui-architecture.md](04-ui-architecture.md) | **確定**（2026-08-07） | UI・遷移フィードバック・テスト戦略・ドキュメント更新 |

**全トピック確定（2026-08-07）。設計完了。** 後続はチケット分割（ticket-split スキル、`docs/plan/word-view-nav/`）へ。

## 実装への引き継ぎ

チケット分割はこのセクションと確定事項サマリだけで開始できる（詳細が必要な場合のみ各トピックの「決定 N」を参照）。

### 変更対象の一覧

スキーマ変更・マイグレーション: **なし**（DB 変更なし）。

**ページ経路（単語ビューコンテキスト＋掲載箇所 bookmarked）**

- `src/app/words/_lib/search-params.ts` — kind 付き union `WordDetailNavContext` 化、`parseWordDetailNavContext`、`buildWordDetailHref` / `buildWordEditHref` の union 対応（02 決定 1・2・3）
- `src/lib/words-list.ts` — 一覧 where のビルダ抽出、`findAdjacentWordsInWordView` 新設、`AdjacentWordsParams` に `bookmarkedOnly` 追加（02 決定 3・4）
- `src/app/words/page.tsx` — 単語ビューの行リンクにコンテキスト付与、掲載箇所ビューの行リンクに `bookmarked` 反映
- `src/app/words/[id]/page.tsx` — `ctx.kind` で隣接クエリ出し分け・戻りリンク・`#N` 出し分け（04 決定 1）
- `src/app/words/[id]/edit/page.tsx` — union ctx の持ち回り

**ダイアログ経路（結果一覧順ナビ）**

- `src/app/quiz/actions.ts` — `getAdjacentWordsForDialog` 削除。`src/lib/schema/quiz.ts` — `adjacentWordsInputSchema` 削除（03 決定 3）
- `src/lib/words-list.ts` — `findAdjacentWordsByOccurrenceNumber` 削除（03 決定 3。ページ経路と同一ファイルの唯一の交点）
- `src/app/quiz/_components/result-list.tsx` — `onOpenDialog(wordId, navOrder)` 拡張（03 決定 2）
- `src/app/quiz/_components/quiz-flow.tsx` — `dialogNavOrder` state（03 決定 2）
- `src/app/quiz/_components/word-detail-dialog.tsx` / `word-detail-dialog-state.ts` — navOrder ベース同期導出・`#N` の詳細応答導出・先読み再設計（03 決定 2・4・6）

**UI コンポーネント**: 新規なし（`WordNavArea` / `AdjacentWordNav` / `WordContentTransition` 流用、ダイアログのナビ行は直書き維持。04 決定 1・2）。

**ドキュメント**: `docs/features/word-management.md`・`word-quiz.md` 改訂（スクリーンショットなし。04 決定 5）、ADR 2 本起票＋ADR-0086 へ注記 1 行（04 決定 3・6）、naming-book に「前後ナビ」「単語ビュー / 掲載箇所ビュー」追加（04 決定 6）。各実装 PR と同時に更新する。

### 着手順序のヒント

- ページ経路とダイアログ経路は独立しており並行実装できる。交点は `src/lib/words-list.ts` のみ（ページ経路が追加、ダイアログ経路が削除）で、同一ファイル競合に注意
- ページ経路内の依存方向: `search-params.ts`（union 型 = 共有基盤）→ `words-list.ts`（隣接クエリ）→ ページ配線（`page.tsx` / `edit/page.tsx`）
- ダイアログ経路内: `word-detail-dialog-state.ts` の純関数再設計 → `word-detail-dialog.tsx` / `quiz-flow.tsx` / `result-list.tsx` の配線 → action・スキーマ・`findAdjacentWordsByOccurrenceNumber` の削除

### テスト戦略の要点（チケット完了条件に転記可）

- `search-params.unit.test.ts`: 判別順（`occ` 優先 → `view=word` → null）、単語ビューコンテキストのパースと正規化、href のデフォルト省略（`view=word` は常時付与）、掲載箇所 `bookmarked`
- `words-list.integration.test.ts`: `findAdjacentWordsInWordView` の新 describe（recent / headword 両順・端・**`createdAt` 同値の id tiebreak**・`q` / `match`・`bookmarkedOnly`・集合外 null・scope）、`findAdjacentWordsByOccurrence` へ `bookmarkedOnly` ケース追加、`findAdjacentWordsByOccurrenceNumber` の describe 削除
- `word-detail-dialog-state.unit.test.ts`: navOrder ベース導出（index 解決・端 disabled・navOrder null で非表示・`#N` 導出の各分岐）、`resolvePrefetchTargets` を「詳細のみ・前後 1 件・表示中詳細 settle 後」で書き直し
- E2E: e2e-verify スキルで 3 経路（単語ビュー由来ページナビ / 掲載箇所 bookmarked 込みナビ / 結果ダイアログの表示行順ナビ）を動作確認

### 次工程

チケット分割は ticket-split スキルで行う（チケットの置き場は `docs/plan/word-view-nav/`、形式は ticket-split 側で定義）。

## セッション運用ルール

1. **読み込みは「ハブ + 対象トピック1ファイル」に限定する**。他のトピックファイルは原則読まない。依存する決定は各ファイル冒頭の「前提」に再掲されている。
2. **仕様書・設計書に記載した後は、毎回必ず整合性レビューを実施する**（成立しない記述・二重定義・決定間の矛盾・曖昧なシグネチャ等。観点は design-session スキル参照）。修正してから次へ進む。
3. **セッション終了（クリア）前に、このファイルの状態表と確定事項サマリを必ず更新する**。これが次セッションへの引き継ぎとなる。
4. **議論の過程・却下案・採用理由はトピックファイルに残し、ハブには昇格させない**。ハブには結論のみ（各1〜3行）を書く。
5. **既存の確定事項を覆す場合は、ハブのサマリと元トピックファイルの両方を更新する**。あわせて、その決定を「前提」に再掲している他ファイルも更新する。
6. 全トピック確定後、ハブに「実装への引き継ぎ」セクションを追記して設計を閉じる。実装フェーズの分割計画は別途 `docs/plan/` で扱う（このディレクトリは設計のみ）。
