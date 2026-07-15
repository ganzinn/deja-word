# 01. bookmark-schema

状態: **実装中**　PR: （未作成）

## 目的

Bookmark モデルを新設して migration を適用し、naming-book への用語登録と ADR「per-user side table＋開始時評価」の起票までを行う。後続チケットが参照する DB 基盤とドメイン用語を確定させる。

スコープ外:

- Drill / QuizDefaultSetting のスキーマ変更（04 で行う。Drill の nullable 化は drill 系コードの型対応と同一 PR でないと typecheck が通らないため、本チケットに同居させない）
- ブックマークの読み書きロジック（02）・UI（06 以降）
- ADR「ブックマーク全件モード」の起票（03 で行う）

## 依存チケット

なし（並行着手可）

## 前提（設計決定の再掲）

- Bookmark モデルの具体形（[02-data-model.md](../../design/bookmark/02-data-model.md) 決定 1〜4 の帰結）:

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

- User / Word に逆リレーション `bookmarks Bookmark[]` を追加する（モデル定義の追記のみで、両テーブルの DDL は無変更）（[02-data-model.md](../../design/bookmark/02-data-model.md) 決定 1）
- 保持カラムは FK 2 列＋ `createdAt`（`@default(now())`）のみ（[02-data-model.md](../../design/bookmark/02-data-model.md) 決定 2）
- 両 FK とも `onDelete: Cascade`（User 削除で本人のブックマーク全消滅、Word 削除でその単語へのブックマークが全ユーザーぶん消滅）（[02-data-model.md](../../design/bookmark/02-data-model.md) 決定 3）
- インデックスは複合 PK ＋ `@@index([wordId])` のみ。**個別 `@@index([userId])` は張らない**（PK 先頭列 prefix と完全重複するため。手本 OccurrencePresetSetting との差異は意図的であり、規約違反と誤認して追加しないこと）（[02-data-model.md](../../design/bookmark/02-data-model.md) 決定 4）
- マイグレーションは `CREATE TABLE` ＋ index ＋ FK 制約のみの純加算。backfill はしない（初期状態「全 OFF」が仕様）（[02-data-model.md](../../design/bookmark/02-data-model.md) 決定 5）
- naming-book 登録内容: `Bookmark（ブックマーク）`。定義は「1 ユーザー × 1 単語の ON/OFF、per-user 設定系」。混同注意:「お気に入り」「スター」「マーク」は使わない。quiz 絞り込みの UI 文言は「ブックマークのみ」。出典は Bookmark モデル行（実装後に行番号が確定するため本チケットで登録する）（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 6、[01-requirements.md](../../design/bookmark/01-requirements.md) 決定 1）
- ADR は 2 本構成（チケット分割時に確定）。本チケットで起票するのは 1 本目「ブックマークは per-user side table・quiz 絞り込みは開始時評価」。決定内容: side table 採用（02 決定）・出題述語の 3 関数同一適用とダミー非適用（03 決定）・開始時再評価と drill スナップショット非適用（03 決定）・楽観的更新パターンの初導入（04 決定）（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 6）。設計は全トピック確定済みのため、後続チケットの実装を待たずに内容を記述できる

## 実装内容

### 変更: `prisma/schema.prisma`

上記の Bookmark モデルを追加し、User / Word に `bookmarks Bookmark[]` を追記する。

### 作成: migration（`prisma/migrations/`）

`pnpm prisma migrate dev --name add_bookmark` で 1 本生成する（CREATE TABLE ＋ index ＋ FK のみになることを SQL で確認する）。

### 変更: `docs/reference/naming-book.md`

前提に記載の内容で `Bookmark（ブックマーク）` を登録する（既存エントリの形式に合わせる）。

### 作成: `docs/adr/`（新規 ADR 1 本）

「ブックマークは per-user side table・quiz 絞り込みは開始時評価」。番号は起票時の連番。採用理由・却下案は設計トピック（02 / 03 / 04）から要約する。

## 完了条件（Definition of Done）

- [ ] migration が開発 DB に適用できる（`pnpm db:migrate`、drift なし）
- [ ] `prisma generate` 後に `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る（本チケットのテスト追加はなし。Bookmark の挙動は 02 の integration で担保する）
- [ ] naming-book に Bookmark が登録されている（出典のコード行参照付き）
- [ ] ADR が 1 本起票されている

## 競合注意

- `prisma/schema.prisma` / migration: 04 も migration を持つ。本チケットが先（04 は 01 に依存）。migration は必ず直列になる

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
