# 02. データモデル

状態: **確定**（2026-07-13）

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- 用語は bookmark（日本語名「ブックマーク」）、naming-book に登録する（01 確定）。
- ブックマークは 1 ユーザー × 1 単語の ON/OFF 1 種類。種別・タグ・フォルダ分類・メモは持たない（01 確定）。
- 共有マスタ単語（ownerId=system）にも本人のブックマークを付けられる。ブックマークは常に本人だけのデータ（01 確定）。
- ブックマーク全件出題（掲載箇所未指定）と単語一覧の「ブックマークのみ」フィルタがあり、ユーザー単位でブックマークを引く経路が必要（01 確定）。

## 検討事項リスト

- [x] side table のモデル名・形（`@@id([userId, wordId])` の per-user 設定パターン想定。手本: OccurrencePresetSetting。ADR-0008 準拠で既存テーブル無変更）→ 決定 1
- [x] 保持カラム（createdAt のみか、メモ等を持つか）→ 決定 2
- [x] onDelete 連鎖（User 削除・Word 削除時。ADR-0009 の例外方針との整合）→ 決定 3
- [x] インデックス（ブックマーク全件出題・一覧表示に必要な引き方）→ 決定 4
- [x] マイグレーション（backfill 不要の純加算か）→ 決定 5

## 議論・決定

### 決定 1: side table `Bookmark`（テーブル `bookmark`）、複合 PK `@@id([userId, wordId])` の per-user 設定系

ユーザー × 単語の中間テーブル `Bookmark` を新設する。行があればその単語をブックマーク中（ON）、無ければ OFF の存在ベーストグル。per-user 設定系の慣例に従い `userId` 主体で `ownerId` は持たない。User / Word には逆リレーション `bookmarks Bookmark[]` を追加する（モデル定義の追記のみで、テーブル定義は無変更）。

採用理由: 01 の「1 ユーザー × 1 単語の ON/OFF 1 種類」に最小の形で一致する。ADR-0008（side table 加算）準拠で既存テーブルに触れない。per-user 設定系（userId 主体・ownerId 非保持、手本 OccurrencePresetSetting）の規約に一致し、共有マスタ単語（ownerId=system）にも本人行を張れる。複合 PK により同一単語への重複付与は DB レベルで不可能で、upsert の where にも `userId_wordId` がそのまま使える。

却下した代替案: Word への boolean カラム追加（per-user にできず、ADR-0008 の既存テーブル無変更にも違反）。モデル名 `WordBookmark`（ブックマーク対象は単語のみで曖昧さがなく、01 確定の用語 bookmark とコード名を一致させる方を優先）。サロゲート `id` + `@@unique([userId, wordId])`（複合 PK で必要十分。単独で参照される行ではないため独立 id の使い道がない）。

### 決定 2: 保持カラムは FK 2 列 + `createdAt` のみ

`userId` / `wordId` / `createdAt`（付けた日時、`@default(now())`）の 3 列とする。

採用理由: createdAt は後から遡って埋められないデータで、保持コストはほぼゼロ。「付けた順」ソート等の将来余地と調査・デバッグに有用。Word 等のコンテンツ系モデルも createdAt を持つ慣例。

却下した代替案: カラムなし（OccurrencePresetSetting と同形の FK 2 列のみ）— 存在ベーストグルとしては足りるが、createdAt の情報は後から取得できない。メモ・種別等の追加カラム — 01 でスコープ外と確定済み。

### 決定 3: onDelete は両 FK とも Cascade

`user` / `word` の両リレーションとも `onDelete: Cascade` とする。User 削除で本人のブックマークが全消滅、Word 削除でその単語へのブックマークが全ユーザーぶん消滅する。

採用理由: ADR-0009 の既定（Cascade）。参照先が消えた後に残す価値のあるデータがなく、SetNull 例外（参照先が消えても本体を残す価値がある場合）に該当しない。そもそも両列とも PK 構成列（NOT NULL）のため SetNull は成立しない。

却下した代替案: SetNull — 上記のとおり成立せず、残す価値もない。

### 決定 4: インデックスは PK（userId, wordId）+ `@@index([wordId])`。個別 `@@index([userId])` は張らない

採用理由: ユーザー単位の全件取得（quiz のブックマーク全件出題・単語一覧の「ブックマークのみ」フィルタ）は複合 PK の先頭列 prefix（userId）で足りる。`@@index([wordId])` は Word 削除時の cascade（FK 参照チェック）用。

却下した代替案: `@@index([userId])` も張る（手本 OccurrencePresetSetting と同形）— PK の先頭列 prefix と完全に重複し、insert / delete の書き込みコストが増えるだけで読み取りに寄与しない。**手本との差異は意図的**であり、userId 個別 index が無いのを「規約違反」と誤認して追加しないこと。

### 決定 5: マイグレーションは backfill なしの純加算

`CREATE TABLE` + index + FK 制約のみの加算マイグレーションとし、初期データ投入（backfill）は行わない。

採用理由: 初期状態「全 OFF」が仕様（ブックマークは本人の明示操作でのみ付く）。OccurrencePresetSetting の migration が backfill を含んでいたのは「既定 ON にする掲載箇所」という要件があったためで、ブックマークには該当する要件がない。

却下した代替案: なし（backfill の必要が仕様上存在しない）。

### Prisma 定義（決定 1〜4 の帰結）

```prisma
model Bookmark {
  userId    String   @map("user_id")
  wordId    String   @map("word_id")
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  word Word @relation(fields: [wordId], references: [id], onDelete: Cascade)

  @@id([userId, wordId])
  @@index([wordId])
  @@map("bookmark")
}
```

ユーザー単位の絞り込みは Prisma から `bookmarks: { some: { userId } }`（Word 側）または `prisma.bookmark.findMany({ where: { userId } })` で引ける。
