# 05. アーキテクチャ

状態: **確定**（2026-07-13）

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- 用語は bookmark（日本語名「ブックマーク」）、naming-book に登録する（01 確定）。
- 共有マスタ単語（ownerId=system）にも本人のブックマークを付けられる。ブックマークは常に本人だけのデータ（01 確定）。
- 単語一覧の「ブックマークのみ」フィルタと quiz の「ブックマークのみ」絞り込みが入る（01 確定）。
- ブックマークは per-user 設定系 side table `Bookmark`（複合 PK userId × wordId、両 FK Cascade、backfill なしの純加算 migration）。ブックマーク格納のための既存テーブル変更はなし（02 確定）。
- quiz の絞り込みは出題述語 `bookmarks: { some: { userId } }` を fetchQuizSource / countQuizTargets / countQuizSourceExclusions の 3 関数へ同一適用し、各関数に `bookmarkedOnly: boolean` 引数を追加。ダミー候補（sameOccurrenceRows / fallbackRows）には適用しない（03 確定）。
- occurrenceId を optional 化（quizRangeInputSchema・3 関数シグネチャ）。掲載箇所未指定は bookmarkedOnly=true のときのみ・範囲未指定必須をスキーマのクロスフィールド検証で拒否。全件モードは掲載番号なし単語も対象（ADR-0022 の明示的例外、実装時に ADR へ補記起票）（03 確定）。
- Drill の occurrenceId / rangeFrom / rangeTo を nullable 化し `sourceBookmarkedOnly Boolean @default(false)` を追加。QuizDefaultSetting に `bookmarkedOnly Boolean?` を追加（03 確定）。
- ブックマーク集合は開始時（再テスト含む）に再評価。drill 本体は DrillWord スナップショットでブックマーク条件を再適用しない（03 確定）。
- トグルの反映は楽観的更新（失敗時のみ巻き戻し＋エラー toast、router.refresh なし）。server action は目標状態（ON/OFF）を受け取る冪等 set とし、連打は最後の意図に収束させる（04 確定）。
- ブックマーク状態の取得は 3 経路: 単語一覧は WordListItem / WordOccurrenceListItem に `bookmarked: boolean` を追加（wordListSelect 拡張）、quiz 結果一覧は表示時に wordId 一覧で一括取得する server action を追加、単語詳細ダイアログは getWordDetailForDialog の戻りに bookmarked を並置（04 確定）。
- 単語一覧の「ブックマークのみ」フィルタは URL searchParam `bookmarked=1` で表現し、listWordsForUser / listWordsByOccurrence に閲覧ユーザーのブックマーク存在条件を追加する（04 確定）。

既存の確定済み前提（規約・ADR）:

- 3 層構成: UseCase は src/lib/*.ts 直下でトランザクションを張る（ADR-0014 / 0015）。zod スキーマは src/lib/schema/。Server Action は Result 型を返し error-map で変換（ADR-0016）
- 読み取りは scopedOwnerIds、書き込み所有検証は 2 層認可（ADR-0018 / 0019）。純 per-user 設定は本人行のみ書き込み・対象は scoped 検証（手本: src/lib/occurrence-preset-settings.ts）

## 検討事項リスト

- [x] ブックマーク付け外しの UseCase / server action の配置と命名・シグネチャ（目標状態を受ける冪等 set は 04 確定。1 action で boolean を受けるか add/remove 2 action かはここで決める）→ 決定 1・決定 2
- [x] quiz 結果一覧用のブックマーク状態一括取得 action（04 確定）の配置と入力上限・認可 → 決定 3
- [x] 認可: 対象単語の scoped 検証（共有マスタ単語にも本人ブックマーク可、01 確定）とセキュリティチェックリスト（docs/reference/security-design-checklist.md）の通し → 決定 1・決定 6
- [x] quiz 系（quiz-source.ts ほか）への組み込み箇所の整理（03 の決定の実装配置）→ 決定 4
- [x] 一覧クエリ（words-list.ts 等）の拡張（bookmarked 列追加・フィルタ条件は 04 確定）の実装配置の確認とクエリ性能の確認（wordId 単独 index は 02 で張済み、userId 側は PK 先頭）→ 決定 4
- [x] テスト戦略: unit（純関数・スキーマ）と integration（クエリ・UseCase、dejaword_test DB）の切り分け、E2E 確認の要点 → 決定 5
- [x] naming-book / ADR の起票（用語登録、主要決定の ADR 化の要否）→ 決定 6

## 議論・決定

### 決定 1: UseCase は src/lib/bookmark-settings.ts に集約（冪等 set＋一括取得）

純 per-user 設定の手本 `src/lib/occurrence-preset-settings.ts` と同型で、新規ファイル `src/lib/bookmark-settings.ts`（`import "server-only"`）に以下を置く。

- `setBookmarkForUser(userId: string, wordId: string, bookmarked: boolean): Promise<void>`
  - 認可: ON / OFF とも、対象 word を `findFirst({ where: { id: wordId, ownerId: { in: scopedOwnerIds(userId) } } })` で scoped 検証し、範囲外なら同ファイル定義の `BookmarkWordNotInScopeError` を throw する。scoped 検証なので共有マスタ単語（ownerId=system）への本人ブックマークが許可され（01 確定）、他ユーザーの単語は拒否される。src/lib/CLAUDE.md の「純 per-user 設定は書き込み先が本人行のみなので対象を scoped 検証してよい」の確立済み例外に該当する
  - 書き込み: ON は `upsert({ where: { userId_wordId: {...} }, create: {...}, update: {} })`（存在すれば no-op）、OFF は `deleteMany({ where: { userId, wordId } })`。どちらも冪等で、書き込み先は本人行（userId 固定）のみ。単一書き込みのため `$transaction` は張らない
- `getBookmarkedWordIdsForUser(userId: string, wordIds: readonly string[]): Promise<string[]>`
  - `findMany({ where: { userId, wordId: { in: wordIds } }, select: { wordId } })` でヒットした wordId 一覧を返す。本人行のみの read のため wordIds の scoped 検証は不要（範囲外・削除済みの wordId は単に非ヒット＝未ブックマーク扱いになり、他人のデータは漏れない）
  - 単語詳細ページ（words/[id]、server component）の bookmarked も本関数を 1 件配列で呼んで取得する（quiz 結果一覧用の一括取得と同一関数で足り、read 専用関数を増やさない）

採用理由: 手本 occurrence-preset-settings.ts と認可モデル・冪等性の作りが完全に同型で、レビュー・テストの型が流用できる。ファイル名は per-user 設定系の命名 `<機能>-settings.ts`、動詞は冪等 set の `set...ForUser` / read の `get...ForUser` という既存規約に一致する。set と一括取得は「ブックマーク」という同一関心で変更理由が同じため 1 ファイルに置く。
却下した代替案: ファイル名 `bookmarks.ts`（per-user 設定系ファミリの命名規約 `<機能>-settings.ts` から外れる。Bookmark テーブルは 02 で per-user 設定系と位置づけ済み）。words/quiz の 2 層認可機構（editor-context / row-policy）の利用（Word 本体の pass-through 編集用の重量機構で、本人行のみ書き込む設定系には scoped findFirst 1 回で足りる）。OFF 時の scoped 検証省略（手本が ON / OFF とも検証しており、非対称にする理由がない。削除済み単語への OFF は forbidden になるが、行は FK Cascade で消えているため実害なし）。

### 決定 2: server action は src/app/words/actions.ts に新設、boolean を受ける 1 action

`src/app/words/actions.ts`（新規、`"use server"`）に `toggleBookmark(wordId: string, bookmarked: boolean): Promise<ToggleBookmarkResult>` を置く。

- Result 型: `{ ok: true } | { ok: false; error: "unauthorized" | "forbidden" | "unknown"; message: string }`（ADR-0016 の流儀）
- 認可・error-map: `getCurrentSession()` で未ログイン → `unauthorized`。UseCase の `BookmarkWordNotInScopeError` → `forbidden`、それ以外 → `console.error` ＋ `unknown`。前例 `togglePresetSetting`（src/app/settings/occurrences/actions.ts）と同じインライン instanceof 判定とし、共有 error-map（words / quiz 用）は使わない
- 入力検証: 引数がプリミティブ 2 つ（id と boolean）のみのため zod スキーマは作らない（togglePresetSetting と同じ）
- **`revalidatePath` は呼ばない**。04 確定の楽観的更新（router.refresh なし）に従い、表示中の状態は BookmarkButton のクライアント状態が真実。一覧・詳細のサーバ供給値（bookmarked）はセッション依存の動的レンダリングのため、次の遷移・リロードで最新が取得される
- 設置 4 箇所で共有する `BookmarkButton`（src/components/、04 確定）は本 action を直接 import する

採用理由: 目標状態を受ける 1 action は 04 の確定（冪等 set・連打は最後の意図に収束）と噛み合い、前例 togglePresetSetting と同型。/words はブックマーク対象ドメイン（単語）のホームルートで、action の置き場規約 `src/app/<route>/actions.ts` に沿う。直接 import は 4 設置箇所への配線重複を避ける（本 action はルートパラメータ非依存のグローバル操作で、quiz 配下の client component からのルート跨ぎ import も技術上・規約上問題ない）。
却下した代替案: add / remove の 2 action（クライアントが現状態を見て action を選ぶ分岐が増え、連打・競合時に最後の意図とズレる余地が生まれる）。ルートごとの action 重複配置（同一処理の二重定義）。props 注入（pronunciation-audio-manager の前例はルートパラメータ束縛の action を注入するためのもの。ここでは 4 箇所の配線が重複するだけで利点がない）。`revalidatePath` の付与（04 の楽観的更新と矛盾し、成功時にサーバ再レンダで巻き戻り・ちらつきが出る）。

### 決定 3: 一括取得 action getBookmarkStates も words/actions.ts、入力上限 3000

quiz 結果一覧用（04 確定）の read 系 server action `getBookmarkStates(input: { wordIds: string[] }): Promise<GetBookmarkStatesResult>` を `src/app/words/actions.ts` に置く。

- Result: `{ ok: true; bookmarkedWordIds: string[] } | { ok: false; error: "unauthorized" | "invalid" | "unknown"; message: string }`
- 入力検証: `src/lib/schema/bookmark.ts`（新規、`zod/v3`）の `getBookmarkStatesInputSchema` で `wordIds: z.array(z.string()).max(3000)` を検証し、超過・不正は `invalid`。上限 3000 は「結果一覧の単語数 = 1 回の quiz の出題数」の上限であり、現実の最大（target1900 の全件 ≒ 1900 語）に余裕を持たせた値。実装時に定数化する
- 認可: セッション必須（未ログイン → `unauthorized`）。返すのは本人のブックマーク行のみ（決定 1 の `getBookmarkedWordIdsForUser`）で、wordIds 自体の scoped 検証は不要
- read を server action にするのは既存流儀（read は server component 直取得）の例外だが、quiz 結果一覧はクライアント状態駆動の画面（ADR-0031）で表示時にサーバ再レンダを挟めないため 04 で確定済み。read 系 server action 自体には `getWordDetailForDialog`（src/app/quiz/actions.ts）の前例がある

採用理由: toggleBookmark と同居させることでブックマーク系 action の変更理由が 1 ファイルに閉じる（凝集度）。配列入力は上限なしで受けない（入力上限の既存方針 ADR-0068 と同趣旨）。
却下した代替案: `src/app/quiz/actions.ts` への配置（唯一の消費箇所には近いが、ブックマーク action が 2 ファイルへ分散する。quiz/actions.ts は既にファイルが大きく、quiz ドメイン固有でない処理を足さない）。上限なし・チャンク分割やページング（現実の最大量 ≒ 1900 に対し過剰な機構）。

### 決定 4: quiz 系・一覧クエリへの組み込みは既存ファイルの責務どおりに割り付ける

03 / 04 の確定事項の実装位置マッピング。新規モジュールは決定 1〜3 の 2 ファイル（bookmark-settings.ts / schema/bookmark.ts）＋ action ファイルのみで、残りは既存ファイルの拡張とする。

- `src/lib/schema/quiz.ts`: `quizRangeInputSchema` を occurrenceId optional ＋ `bookmarkedOnly: boolean` に改修し、クロスフィールド検証（掲載箇所未指定は bookmarkedOnly=true のときのみ・そのとき範囲未指定必須）を追加。これを `.extend()` している各 action 入力スキーマ（getQuizPreviewInputSchema / startQuizInputSchema 等）へは自動波及する
- `src/lib/quiz/queries/quiz-source.ts`: fetchQuizSource / countQuizTargets / countQuizSourceExclusions に `bookmarkedOnly` を追加し、出題述語 `bookmarks: { some: { userId } }` を 3 関数へ同一適用（ダミー候補 sameOccurrenceRows / fallbackRows には適用しない）。occurrenceId 未指定（全件モード）では掲載箇所の可視性検証（assertOccurrenceVisible）をスキップし、掲載番号なし単語も対象に含める
- `src/lib/quiz-generate.ts` / `src/lib/drill-create.ts`: bookmarkedOnly の pass-through と、Drill（occurrenceId / rangeFrom / rangeTo nullable ＋ sourceBookmarkedOnly）への保存
- `src/lib/quiz-default-settings.ts`: QuizDefaultSetting の `bookmarkedOnly` の読み書き追加
- `src/lib/words-list.ts`: `wordListSelect` に userId を渡して `bookmarks: { where: { userId }, take: 1 }` を追加し、WordListItem / WordOccurrenceListItem の `bookmarked: boolean` へ畳む（occurrences-list.ts の isPreset と同型）。「ブックマークのみ」フィルタは listWordsForUser / listWordsByOccurrence の where へ `bookmarks: { some: { userId } }` を追加
- `src/app/quiz/actions.ts`: `getWordDetailForDialog` の戻り値に bookmarked を並置（04 確定。取得は決定 1 の `getBookmarkedWordIdsForUser` を 1 件配列で呼ぶ）
- `prisma/schema.prisma` / migration: Bookmark モデル新設（02 確定の形: 複合 PK userId × wordId・両 FK Cascade・wordId 単独 index・createdAt。userId 個別 index は張らない）＋ Drill 3 カラムの nullable 化と `sourceBookmarkedOnly Boolean @default(false)` ＋ `QuizDefaultSetting.bookmarkedOnly Boolean?`。いずれも backfill なしの純加算（02 / 03 確定）。migration の分割単位はチケット分割で決める

クエリ性能: ブックマーク述語・フィルタ・join はすべて userId を先頭に持つ Bookmark PK で引ける。wordId 単独 index（02 確定）は Word 削除連鎖と wordId 起点の join に効く。追加 index は不要。

採用理由: 03 / 04 の決定を既存ファイルの責務（schema は src/lib/schema/、出題クエリは quiz/queries/、一覧は words-list.ts）どおりに割り付けるだけで、新しい層・新しい置き場を導入しない。
却下した代替案: quiz 用ブックマーク述語の別クエリモジュール新設（3 関数への引数追加で足り、分割すると出題条件の定義が 2 箇所に割れる）。

### 決定 5: テスト戦略は手本と同粒度の unit / integration コロケーション＋ E2E 一連確認

- unit（DB なし、CI で実行）:
  - `src/lib/schema/quiz.unit.test.ts`（既存があれば拡張、なければ新設）: クロスフィールド検証の組合せ（掲載箇所指定×bookmarkedOnly false=従来どおり / 未指定×bookmarkedOnly true×範囲なし=許可 / 未指定×bookmarkedOnly false=拒否 / 未指定×範囲あり=拒否）
  - `src/lib/schema/bookmark.unit.test.ts`: getBookmarkStatesInputSchema の上限超過・型不正の拒否
  - ブックマーク固有の純関数は他にないため、ロジックの unit テストは追加しない
- integration（dejaword_test、`truncateAll` ＋ `seedSystemFixtures` の既存セットアップと fixtures ファクトリを使用）:
  - `src/lib/bookmark-settings.integration.test.ts`（新規）: ON の冪等性（二重 ON で 1 行）・OFF の冪等性（未存在 OFF が安全）・scope 外単語で BookmarkWordNotInScopeError・system 単語へ付与可・他ユーザー単語は拒否・getBookmarkedWordIdsForUser のヒット / 非ヒット（occurrence-preset-settings.integration.test.ts と同粒度）
  - `src/lib/quiz/queries/quiz-source.integration.test.ts`（拡張）: bookmarkedOnly=true で対象がブックマーク済みに絞られる・他ユーザーのブックマークが混ざらない（テナント分離）・ダミー候補には適用されない・全件モードで掲載番号なし単語が含まれる・除外内訳のブックマークスコープ
  - `src/lib/words-list.integration.test.ts`（拡張）: bookmarked フラグの真偽・「ブックマークのみ」フィルタ・他ユーザー分離
  - `src/lib/drill-create.integration.test.ts` / `src/lib/quiz-default-settings.integration.test.ts`（既存があれば拡張）: nullable 化した掲載箇所なし drill の作成・sourceBookmarkedOnly / bookmarkedOnly の保存
- action 層: toggleBookmark / getBookmarkStates はインライン error-map の薄い分岐のみのため専用テストは必須としない（UseCase の integration と E2E でカバー。入力スキーマの境界は上記 unit で担保）
- E2E（e2e-verify スキルの手順）: トグル一連（一覧行 → 詳細 → quiz ダイアログでの付け外しと状態同期）・単語一覧「ブックマークのみ」フィルタ・quiz「ブックマークのみ」開始（掲載箇所あり＋全件モード）・ブックマーク 0 件時のプレビュー 0 件表示

採用理由: 出題述語・フィルタは DB の述語そのものなので integration が主戦場（quiz-source の既存テストと同じ判断）。スキーマのクロスフィールド検証は純関数で unit が最速・最安定。既存テストファイルへの拡張を基本とし、テストの置き場を増やさない。
却下した代替案: action 層の unit テスト必須化（quiz/actions.unit.test.ts の前例はあるが、本件の action は分岐が薄く費用対効果が低い）。E2E の網羅自動化（既存方針どおり要点確認に留める）。

### 決定 6: naming-book / ADR は実装チケットで起票、セキュリティチェックリストは全項目クリア

- naming-book: `Bookmark（ブックマーク）` を登録する。定義（1 ユーザー × 1 単語の ON/OFF、per-user 設定系）・混同注意（「お気に入り」「スター」「マーク」は使わない。quiz 絞り込みの UI 文言は「ブックマークのみ」）・出典（Bookmark モデル行ほか）。登録は実装チケットに含める（出典にコード行番号が必要で、実装後でないと確定しないため）
- ADR: 実装チケットで以下を起票する
  - 新 ADR「ブックマークは per-user side table・quiz 絞り込みは開始時評価」: side table 採用（02）・出題述語の 3 関数同一適用とダミー非適用（03）・開始時再評価と drill スナップショット非適用（03）・楽観的更新パターンの初導入（04）を決定内容に含める
  - 新 ADR「ブックマーク全件モード（掲載箇所なし出題）」: ADR-0022（出題対象は掲載箇所＋番号範囲）への明示的例外。ADR-0022 側にも相互リンクの補記を入れる（03 確定の「実装時に ADR へ補記起票」の具体化）
  - 1 本にまとめるか 2 本にするかの最終判断はチケット分割時でよいが、0022 例外は独立した判断として見出しに立てること
- セキュリティチェックリスト（docs/reference/security-design-checklist.md）通しの結果（本機能はデータ所有に触れるため実施）:
  - データ所有・テナント分離: 新しい共有 / system データ種別は導入しない（Bookmark は純 per-user・ownerId なし）。read / write 非対称は維持（write は本人行のみ・対象 word は scoped 検証 = per-user 設定系の確立済み例外、read は本人行のみで scopedOwnerIds 不要）。row-policy 拡張は不要
  - ルーティング・権限モデル: 新トップレベルルートセグメントなし（/words 配下の action と searchParam `bookmarked=1` のみ）。proxy.ts の matcher 変更不要。管理者概念に変更なし
  - 外部との境界: 外部入出力・URL 生成・blob・route handler の追加なし。server action の CSRF は既存前提（same-origin）のまま。配列入力（getBookmarkStates）は zod 上限で防御
  - 認証まわり: 変更なし
  - 前提を破る設計はなし（チェックリストに追記すべき新原則もなし）

採用理由: 用語・判断はいずれも確定済みだが、naming-book / ADR とも出典・根拠にコード参照を要する規約のため、起票は実装フェーズが正順。チェックリスト通しの結果は本トピックに記録しておくことで、実装時の sec-review（diff レビュー）と二重化しない。
却下した代替案: 設計時点での naming-book 登録・ADR 起票（出典が設計ドキュメントになり、実装後に張り替えが必要になる。設計ドキュメントは実装完了後に削除する運用のため参照が壊れる）。
