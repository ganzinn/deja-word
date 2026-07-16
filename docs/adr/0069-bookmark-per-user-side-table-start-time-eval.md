# ADR-0069: ブックマークは per-user side table・quiz 絞り込みは開始時評価

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-16

## 背景

苦手な単語にブックマークを付け、単語テスト（quiz）の出題対象や単語一覧をブックマークで絞り込む機能を追加する。1 ユーザー × 1 単語の ON/OFF 1 種類（種別・タグ・フォルダ・メモを持たない）で、共有マスタ単語（ownerId=system）にも本人のブックマークを付けられる。設計は docs/design/bookmark/ で全トピック確定済み。本 ADR はその設計判断のうち、実装後も長期に引き継ぐべき骨子を記録する（設計ドキュメントは実装完了後に削除する運用のため）。

## 決定内容

### 1. 格納は per-user side table `Bookmark`（既存テーブル無変更）

ユーザー × 単語の中間テーブル `Bookmark` を新設する。複合 PK `@@id([userId, wordId])`・両 FK とも `onDelete: Cascade`・保持カラムは FK 2 列＋ `createdAt` のみ。per-user 設定系（`userId` 主体・`ownerId` 非保持、手本 OccurrencePresetSetting）に倣い、行の存在で ON/OFF を表す存在ベーストグルとする。User / Word には逆リレーション `bookmarks Bookmark[]` を追記するのみで、両テーブルの DDL は変えない（ADR-0008 の side table 加算）。

- インデックスは複合 PK ＋ `@@index([wordId])` のみ。**個別 `@@index([userId])` は張らない**（ユーザー単位の全件取得は PK 先頭列 prefix で足り、追加すると書き込みコストが増えるだけで読みに寄与しない）。手本 OccurrencePresetSetting との差異は意図的。
- migration は `CREATE TABLE` ＋ index ＋ FK のみの純加算。backfill はしない（初期状態「全 OFF」が仕様）。

### 2. quiz の絞り込みは出題述語を 3 関数へ同一適用・ダミーには非適用

quiz の「ブックマークのみ」絞り込みは、出題述語 `bookmarks: { some: { userId } }` を `fetchQuizSource` / `countQuizTargets` / `countQuizSourceExclusions` の 3 関数へ同一適用する（各関数に `bookmarkedOnly: boolean` 引数を追加）。四択のダミー候補（sameOccurrenceRows / fallbackRows）にはブックマーク述語を適用しない（ダミーはあくまで誤答選択肢であり、ブックマーク集合に限定する必然がない）。

### 3. ブックマーク集合は開始時に再評価・drill はスナップショットしない

「ブックマークのみ」で出題する集合は quiz 開始時（「同じ範囲でもう一度テストする」などの再テスト含む）にその時点のブックマークで再評価する。drill（定着モード）本体は生成時に確定した DrillWord スナップショットで進行し、ラウンド生成時にブックマーク条件を再適用しない。ブックマークの ON/OFF は「次にテストを始めるときの出題対象」を変えるだけで、進行中の drill の構成を後から書き換えない。

### 4. トグル反映は楽観的更新パターン（本機能で初導入）

ブックマークの付け外し UI は楽観的更新で反映する（クライアント状態を即時に更新し、server action 失敗時のみ巻き戻して エラー toast、`router.refresh` / `revalidatePath` は呼ばない）。server action は目標状態（ON/OFF の boolean）を受け取る冪等 set とし、連打は最後の意図に収束させる。このコードベースで楽観的更新を採用する最初の機能であり、以降の即時トグル系 UI の参照実装とする。

## 採らなかった代替案

- **Word への boolean カラム追加**: per-user にできず、ADR-0008 の既存テーブル無変更にも反する。
- **サロゲート `id` ＋ `@@unique([userId, wordId])`**: 複合 PK で必要十分。単独参照されない行に独立 id の使い道がない。
- **`@@index([userId])` も張る（手本と同形）**: PK 先頭列 prefix と完全重複。書き込みコスト増のみ。
- **ダミー候補にもブックマーク述語を適用**: 誤答選択肢をブックマーク集合に縛る理由がなく、ブックマーク数が少ないとダミーが枯渇する。
- **drill をブックマークでスナップショット / ラウンドごと再評価**: 進行中 drill の構成が途中で変わり、定着の一貫性が崩れる。
- **add / remove の 2 action**: クライアントが現状態を見て action を選ぶ分岐が増え、連打・競合時に最後の意図とズレる。
- **成功時に `revalidatePath` / `router.refresh`**: 楽観的更新と矛盾し、サーバ再レンダで巻き戻り・ちらつきが出る。

## 影響

- Bookmark は純 per-user データ（ownerId なし）で新たな共有 / system データ種別を導入しない。read は本人行のみ、write は本人行のみ＋対象 word を scoped 検証（per-user 設定系の確立済み例外、手本 occurrence-preset-settings.ts）で、row-policy 拡張は不要。
- quiz の出題述語は 3 関数で一貫し、プレビュー件数（count 系）と実出題（fetch）でブックマーク集合がずれない。
- 掲載箇所を指定しない「ブックマーク全件モード」は本 ADR の範囲外。ADR-0022（出題対象は掲載箇所＋番号範囲）への明示的例外として別 ADR で扱う（bookmark 実装チケット 03 で起票）。
- 楽観的更新は本機能が初導入。設置箇所（単語一覧の行・toolbar・単語詳細・quiz 結果ダイアログ）は共有部品 BookmarkButton を通す。

## 根拠（設計・コード・文書参照）

- docs/design/bookmark/02-data-model.md（決定 1〜5: side table の形・カラム・onDelete・index・純加算 migration）
- docs/design/bookmark/03-quiz-scope.md（出題述語の 3 関数同一適用・ダミー非適用・開始時再評価・drill 非スナップショット）
- docs/design/bookmark/04-ui.md（楽観的更新・冪等 set action）
- docs/design/bookmark/05-architecture.md 決定 6（本 ADR の起票方針）
- prisma/schema.prisma（`model Bookmark`）、prisma/migrations/20260715162102_add_bookmark/
- 前提 ADR: [0008](0008-side-table-addition.md)（side table 加算）/ [0009](0009-cascade-default-setnull-exceptions.md)（Cascade 既定）/ [0018](0018-scoped-owner-ids-read-scope.md)・[0019](0019-two-layer-write-authorization.md)（認可）/ [0022](0022-quiz-source-occurrence-range.md)（出題対象）
