# ブックマーク 設計ドキュメント（ハブ）

苦手な単語にブックマークを付け、単語テスト（quiz）の出題対象をブックマークで絞り込める機能の設計ドキュメント群の入口。
**ブックマーク の設計に関わるセッションは、必ずこのファイルから読み始めること。**

## 目的・スコープ

苦手な英単語にブックマークを付けられるようにし、quiz の出題対象を「掲載箇所×範囲内のブックマークのみ」に絞る、または掲載箇所を指定せずブックマーク全件を出題できるようにする。一覧画面（単語一覧・テスト結果一覧）と詳細画面からワンタップで付け外しでき、苦手単語を効率よく復習できるようにする。

スコープの詳細（何をやる / やらない）は [01-requirements.md](01-requirements.md) で定義する。

## 確定事項サマリ

結論のみを記載する。採用理由・却下した代替案は各トピックファイルを参照。

- **用語は bookmark（日本語名「ブックマーク」）**。naming-book に登録する。→ [01](01-requirements.md)
- **1 ユーザー × 1 単語の ON/OFF、1 種類のみ**。種別・タグ・フォルダ分類・メモは持たない。→ [01](01-requirements.md)
- **共有マスタ単語（ownerId=system）にも本人のブックマークを付けられる**。ブックマークは常に本人だけのデータ。→ [01](01-requirements.md)
- **付け外し導線は 4 箇所**: 単語一覧の行・テスト結果一覧の行・単語詳細画面・quiz の単語詳細ダイアログ。トグルボタン自体が ON/OFF 状態を可視化する。→ [01](01-requirements.md)
- **単語一覧に「ブックマークのみ」フィルタを追加**する（専用一覧画面は作らない）。→ [01](01-requirements.md)
- **quiz は開始フォームの「ブックマークのみ」チェックボックスで絞り込む**。掲載箇所×番号範囲と AND、掲載箇所未選択＋チェック ON ならブックマーク全件出題。仕様詳細は 03 で決める。→ [01](01-requirements.md)
- **スコープ外**: 誤答からの自動付与・種別/タグ分類・解答直後画面での付け外し・共有/エクスポート。→ [01](01-requirements.md)
- **side table `Bookmark`（複合 PK userId × wordId、per-user 設定系・ownerId なし）を新設**。ブックマーク格納のための既存テーブル変更はなし。→ [02](02-data-model.md)
- **カラムは FK 2 列 + createdAt のみ。両 FK は onDelete: Cascade**。→ [02](02-data-model.md)
- **インデックスは PK + wordId 単独（userId 個別 index は張らない）。マイグレーションは backfill なしの純加算**。→ [02](02-data-model.md)
- **quiz の絞り込みは出題述語 `bookmarks: { some: { userId } }` を quiz-source の 3 関数へ同一適用**（入力・各関数に `bookmarkedOnly: boolean` を追加、除外内訳もブックマークにスコープ）。ダミー候補には適用しない。→ [03](03-quiz-scope.md)
- **掲載箇所未選択＋チェック ON は「ブックマーク全件モード」**。occurrenceId を optional 化し、掲載番号なし単語も対象（ADR-0022 の明示的例外）。未選択を許すのは bookmarkedOnly=true のときのみ・そのとき範囲未指定、はスキーマで拒否。→ [03](03-quiz-scope.md)
- **Drill は掲載箇所なしに対応**: occurrenceId / rangeFrom / rangeTo を nullable 化し `sourceBookmarkedOnly` を追加。QuizDefaultSetting にも `bookmarkedOnly Boolean?` を追加。→ [03](03-quiz-scope.md)
- **ブックマーク集合は開始時に再評価**（再テスト含む）。drill 本体は DrillWord スナップショットで、開始後に外しても drill からは消えない。→ [03](03-quiz-scope.md)
- **対象 0 件（ブックマーク 0 個＋ON 含む）は既存流儀**（プレビュー 0 件・開始不成立、入口で拒否しない）。→ [03](03-quiz-scope.md)
- **トグルは共有部品 BookmarkButton（src/components/）＋行内用 RowBookmarkButton（contents ラッパ）**。設置は単語一覧行・結果一覧行の右端ボタン群、単語詳細の ScreenHeader actions、quiz 単語詳細ダイアログのヘッダ。→ [04](04-ui.md)
- **反映は楽観的更新**（即時反転、失敗時のみ巻き戻し＋エラー toast、router.refresh なし）。server action は目標状態を受ける冪等 set。→ [04](04-ui.md)
- **状態取得は 3 経路**: 一覧は WordListItem に `bookmarked` 追加、quiz 結果一覧は表示時に一括取得しクライアント状態管理、ダイアログは getWordDetailForDialog に並置＋コールバックで親へ同期。→ [04](04-ui.md)
- **単語一覧フィルタは toolbar の Bookmark アイコントグル＋ URL `bookmarked=1`**（デフォルト OFF は URL 非掲載）。→ [04](04-ui.md)
- **開始フォームは掲載箇所 Select に「指定なし」を常時表示**。未指定時は範囲 Input を disabled＋送信除外（テキストは保持）、プレビューは bookmarkedOnly 連動・noNumber null 項目は省略。設定画面にも同チェックボックスを追加。→ [04](04-ui.md)
- **drill ラベルは全件モード「ブックマークのみ」、掲載箇所あり＋ブックマーク条件は「（ブックマークのみ）」注記**。→ [04](04-ui.md)
- **アイコンは lucide BookmarkIcon、ON は塗りつぶし＋強調色、aria-pressed で状態提示**。→ [04](04-ui.md)
- **UseCase は新規 `src/lib/bookmark-settings.ts`**: `setBookmarkForUser`（冪等 set、対象 word は scoped 検証で system 単語も許可）＋ `getBookmarkedWordIdsForUser`（一括取得、単語詳細ページもこれを 1 件で使う）。→ [05](05-architecture.md)
- **server action は新規 `src/app/words/actions.ts` に集約**: `toggleBookmark(wordId, bookmarked)`（boolean 1 action・zod なし・revalidatePath なし）と `getBookmarkStates`（入力は schema/bookmark.ts の zod、wordIds 上限 3000）。BookmarkButton は action を直接 import。→ [05](05-architecture.md)
- **quiz・一覧への組み込みは既存ファイルの拡張のみ**（schema/quiz.ts・quiz-source.ts・quiz-generate / drill-create・quiz-default-settings・words-list.ts・getWordDetailForDialog）。追加 index 不要。→ [05](05-architecture.md)
- **テストは unit（スキーマ検証）＋ integration（bookmark-settings 新規、quiz-source / words-list 等は拡張）＋ E2E 要点確認**。action 層の専用テストは作らない。→ [05](05-architecture.md)
- **naming-book 登録・ADR 起票（新 ADR ＋ ADR-0022 への補記）は実装チケットで行う**。セキュリティチェックリストは全項目クリア（前提を破る設計なし）。→ [05](05-architecture.md)

## トピック状態表

状態: `未着手` → `議論中` → `確定`

| ファイル | 状態 | 要約 |
| --- | --- | --- |
| [01-requirements.md](01-requirements.md) | 確定（2026-07-13） | 要求・ユースケース・スコープ外 |
| [02-data-model.md](02-data-model.md) | 確定（2026-07-13） | ブックマークの side table 設計・削除連鎖 |
| [03-quiz-scope.md](03-quiz-scope.md) | 確定（2026-07-13） | quiz 出題範囲へのブックマーク条件の組み込み |
| [04-ui.md](04-ui.md) | 確定（2026-07-13） | 一覧・詳細のトグル、開始フォームのチェックボックス |
| [05-architecture.md](05-architecture.md) | 確定（2026-07-13） | 層配置・認可・テスト戦略 |

**全トピック確定（2026-07-13）— 設計完了**。後続はチケット分割（ticket-split スキル、置き場 `docs/plan/bookmark/`）へ。

## 実装への引き継ぎ

チケット分割が全トピックを読み直さずに開始できるための棚卸し。詳細が必要な場合のみ各トピックの「決定 N」を参照する。

### 変更対象の一覧

- **スキーマ / migration**（backfill なしの純加算。分割単位はチケット分割で決める）:
  - `Bookmark` モデル新設: 複合 PK userId × wordId、カラムは FK 2 列＋ createdAt のみ、両 FK onDelete: Cascade、index は PK ＋ wordId 単独（userId 個別 index は張らない）、User / Word に逆参照追加（[02](02-data-model.md)）
  - `Drill`: occurrenceId / rangeFrom / rangeTo を nullable 化＋ `sourceBookmarkedOnly Boolean @default(false)` 追加（[03](03-quiz-scope.md)）
  - `QuizDefaultSetting`: `bookmarkedOnly Boolean?` 追加（[03](03-quiz-scope.md)）
- **新規モジュール**:
  - `src/lib/bookmark-settings.ts`: `setBookmarkForUser` / `getBookmarkedWordIdsForUser` ＋ `BookmarkWordNotInScopeError`（[05 決定 1](05-architecture.md)）
  - `src/lib/schema/bookmark.ts`: `getBookmarkStatesInputSchema`（wordIds 上限 3000）（[05 決定 3](05-architecture.md)）
  - `src/app/words/actions.ts`: `toggleBookmark` / `getBookmarkStates`（[05 決定 2・3](05-architecture.md)）
  - `src/components/bookmark-button.tsx`: `BookmarkButton` ＋行内用 `RowBookmarkButton`（contents ラッパ）。楽観的更新・失敗時巻き戻し＋ toast・aria-pressed（[04](04-ui.md)）
- **既存ファイルの変更**:
  - `src/lib/schema/quiz.ts`: quizRangeInputSchema の occurrenceId optional 化＋ bookmarkedOnly ＋クロスフィールド検証（extend 先へ自動波及）
  - `src/lib/quiz/queries/quiz-source.ts`: 3 関数へ bookmarkedOnly 追加・出題述語 `bookmarks: { some: { userId } }` 同一適用（ダミー候補には非適用）・全件モード対応
  - `src/lib/quiz-generate.ts` / `src/lib/drill-create.ts`: pass-through ＋ Drill 保存
  - `src/lib/quiz-default-settings.ts`: bookmarkedOnly の読み書き
  - `src/lib/words-list.ts`: wordListSelect へ userId 導入＋ bookmarked 列＋「ブックマークのみ」フィルタ
  - `src/app/quiz/actions.ts`: getWordDetailForDialog の戻りに bookmarked 並置
- **UI コンポーネント（設置・フォーム）**:
  - 単語一覧: 行右端に RowBookmarkButton、toolbar に Bookmark アイコントグル（URL `bookmarked=1`、デフォルト OFF は URL 非掲載）
  - quiz 結果一覧（result-list.tsx）: 行右端に設置、表示時に getBookmarkStates で一括取得しクライアント状態管理
  - 単語詳細（words/[id]）: ScreenHeader actions に設置（bookmarked は server component が getBookmarkedWordIdsForUser を 1 件で取得）
  - quiz 単語詳細ダイアログ（word-detail-dialog.tsx）: ヘッダに設置、onBookmarkChange コールバックで親へ同期
  - quiz 開始フォーム: 掲載箇所 Select に「指定なし」常時表示・未指定時は範囲 Input を disabled ＋送信除外・「ブックマークのみ」チェックボックス・プレビュー連動（noNumber null 項目は省略）。設定画面（quiz-defaults）にも同チェックボックス
  - drill ラベル: 全件モード「ブックマークのみ」、掲載箇所あり＋ブックマーク条件は「（ブックマークのみ）」注記

### 着手順序のヒント

スキーマ（Bookmark ＋ Drill / QuizDefaultSetting）→ src/lib/bookmark-settings.ts ＋ schema/bookmark.ts → quiz 系（schema/quiz.ts → quiz-source.ts → quiz-generate / drill-create / quiz-default-settings）→ words-list.ts → action ＋ BookmarkButton → 各設置箇所・開始フォーム・設定画面。

並行実装時に競合しやすい共有物: `prisma/schema.prisma`（migration 順序）・`src/lib/schema/quiz.ts`（extend 波及）・`src/app/quiz/actions.ts`・単語一覧まわりの page / toolbar。

### テスト戦略の要点（チケット完了条件に転記できる粒度）

- unit: schema/quiz のクロスフィールド検証の組合せ（指定×false / 未指定×true×範囲なし / 未指定×false 拒否 / 未指定×範囲あり拒否）、schema/bookmark の上限超過拒否
- integration（新規）: bookmark-settings — ON / OFF の冪等性・scope 外で throw・system 単語へ付与可・他ユーザー単語拒否・一括取得のヒット / 非ヒット
- integration（拡張）: quiz-source — bookmarkedOnly の絞り込み・テナント分離・ダミー非適用・全件モードで掲載番号なし単語を含む・除外内訳のスコープ / words-list — bookmarked 列とフィルタ / drill-create・quiz-default-settings — nullable 保存と bookmarkedOnly 保存
- action 層の専用テストは作らない（分岐が薄く、UseCase integration ＋ E2E でカバー）
- E2E（e2e-verify スキル）: トグル一連（一覧行・詳細・ダイアログの状態同期）・一覧フィルタ・quiz「ブックマークのみ」開始（掲載箇所あり＋全件モード）・0 件時プレビュー 0 件

### ドキュメント起票（実装チケットに含める）

- naming-book: `Bookmark（ブックマーク）` 登録（混同注意:「お気に入り」「スター」「マーク」不使用、UI 文言は「ブックマークのみ」）
- ADR: 新 ADR「per-user side table ＋開始時評価」・新 ADR「全件モード（ADR-0022 の例外）」＋ ADR-0022 への相互リンク補記（1 本化の判断はチケット分割時、0022 例外は独立の見出しに）

### 次工程

チケット分割は ticket-split スキルで行う。チケットの置き場は `docs/plan/bookmark/`、形式は ticket-split 側で定義。

## セッション運用ルール

1. **読み込みは「ハブ + 対象トピック1ファイル」に限定する**。他のトピックファイルは原則読まない。依存する決定は各ファイル冒頭の「前提」に再掲されている。
2. **仕様書・設計書に記載した後は、毎回必ず整合性レビューを実施する**（成立しない記述・二重定義・決定間の矛盾・曖昧なシグネチャ等。観点は design-session スキル参照）。修正してから次へ進む。
3. **セッション終了（クリア）前に、このファイルの状態表と確定事項サマリを必ず更新する**。これが次セッションへの引き継ぎとなる。
4. **議論の過程・却下案・採用理由はトピックファイルに残し、ハブには昇格させない**。ハブには結論のみ（各1〜3行）を書く。
5. **既存の確定事項を覆す場合は、ハブのサマリと元トピックファイルの両方を更新する**。あわせて、その決定を「前提」に再掲している他ファイルも更新する。
6. 全トピック確定後、ハブに「実装への引き継ぎ」セクションを追記して設計を閉じる。実装フェーズの分割計画は別途 `docs/plan/` で扱う（このディレクトリは設計のみ）。
