# 01. example-audio-column（音源カラムとクリーンアップ経路）

状態: **完了**（2026-08-04）　PR: （未作成）

## 目的

`Example` に発音音源 URL のカラムを追加し、`pronunciation-audio.ts` に例文ターゲットとサービス API 2 本を用意する。あわせて音源 URL を収集する削除・orphan の 5 経路に Example を足し、**音源が登録できるようになる前にクリーンアップ側を先に揃える**。

スコープ外:

- 音源の登録 UI・Server Action（→ 02）。本チケットで追加する公開 API 2 本は、02 がマージされるまで未参照のままでよい（設計は 02 と同一チケットを想定していたが、PR サイズの都合で分割した。設計の意図が保たれる理由は [plan ハブ](README.md#01-と-02-の分割について設計の着手順序ヒントとの差分)を参照）
- `audio-manifest.ts` のグループ分け（音源 URL を扱う 6 経路目だが削除経路ではないため → 06）
- 単語詳細・単語テストの再生 UI（→ 04 / 05）
- `db:import-audio`（`src/lib/audio-import.ts`）は対象外。`Meaning` 専用のまま変更しない（[02-data-model.md](../../design/example-audio/02-data-model.md) 決定 6 ／ [01-requirements.md](../../design/example-audio/01-requirements.md) 決定 7）
- `src/lib/words-detail.ts` は**変更しない**（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 2）

## 依存チケット

なし（並行着手可）。

## 前提（設計決定の再掲）

- `Example` に `pronunciationAudioUrl String? @map("pronunciation_audio_url")` を追加する。`Meaning` / `RelatedWord` と同じカラム名・同じ型・nullable で、**index は張らない**（横断経路の絞り込みは `wordId` / `ownerId` の既存 index で行われ、`pronunciationAudioUrl: { not: null }` は結果の絞り込みに使われるだけのため）（[02-data-model.md](../../design/example-audio/02-data-model.md) 決定 1）
- backfill は不要。マイグレーションは `ALTER TABLE "example" ADD COLUMN "pronunciation_audio_url" TEXT;` のみ（既存の `20260614092420_add_related_word_pronunciation_audio_url` と同じ形）（[02-data-model.md](../../design/example-audio/02-data-model.md) 決定 5）
- blob key は `audio/example/<exampleId>/pronunciation.mp3`。`AudioTarget.dir` に `"example"` を置き、ファイル名は既存と同じ `pronunciation.mp3`。**例文種別（`kind`）を key に含めない**（`kind` は編集フォームで変更できるため）（[02-data-model.md](../../design/example-audio/02-data-model.md) 決定 2）
- `exampleTarget` ディスクリプタは 4 フィールドのみで構成し、共通コア（`loadOwnedRow` / `uploadAudio` / `deleteAudio` / `validateAudioFile` / `bestEffortDel`）は **1 行も変更しない**。put → DB update → 旧 blob del の順序契約（ADR-0044）と、`BlobClient` DI（ADR-0043）もそのまま継承する（[03-audio-registration.md](../../design/example-audio/03-audio-registration.md) 決定 1）

  | フィールド | 内容 |
  | --- | --- |
  | `dir` | `"example"` |
  | `loadOwned` | `prisma.example.findUnique({ where: { id }, select: { ownerId: true, pronunciationAudioUrl: true } })` |
  | `writeUrl` | `prisma.example.update({ where: { id }, data: { pronunciationAudioUrl: url }, select: { id: true } })` |
  | `notFound` | `() => new ExampleNotFoundError()`（`message: "EXAMPLE_NOT_FOUND"` を新設） |

- 公開 API は既存の命名規則に揃えて 2 本追加する（[03-audio-registration.md](../../design/example-audio/03-audio-registration.md) 決定 1）

  ```ts
  export function uploadExampleAudioForUser(userId: string, exampleId: string, file: File, blob: BlobClient = defaultBlobClient): Promise<{ url: string }>
  export function deleteExampleAudioForUser(userId: string, exampleId: string, blob: BlobClient = defaultBlobClient): Promise<void>
  ```

- 認可は既存の `loadOwnedRow`（`row.ownerId !== userId` の**厳格一致**）をそのまま適用し、`scopedOwnerIds` は使わない。結果として一般ユーザーが操作できるのは自分が追加した例文のみで、system 所有の共通例文の音源は system としてログインしたときのみ操作できる。所有者違反は `ForbiddenUpdateError` で弾く（[03-audio-registration.md](../../design/example-audio/03-audio-registration.md) 決定 3）
- 入力検証は既存の `validateAudioFile`（`AUDIO_MIME = "audio/mpeg"` 完全一致 / 空ファイル拒否 / `MAX_AUDIO_BYTES = 4MB`）を共通コア経由でそのまま通す。例文用に別の上限・別の MIME は設けない。決定 1 でコアを触らないため、検証が `loadOwnedRow` より前に走る順序も自動的に継承される（[03-audio-registration.md](../../design/example-audio/03-audio-registration.md) 決定 7）
- blob は既存どおり `access: "public"` + `addRandomSuffix: true` のまま使う。private 化・署名付き配信は導入しない（[03-audio-registration.md](../../design/example-audio/03-audio-registration.md) 決定 4）
- 音源 URL を横断で扱う既存経路のうち、**削除・orphan の 5 経路**に Example を追加する。いずれも既存の `meaning` / `relatedWord` の並びに `example` を足す（[02-data-model.md](../../design/example-audio/02-data-model.md) 決定 3）

  | 経路 | 変更内容 |
  | --- | --- |
  | `words-delete.ts` | 削除前の URL 収集（`where: { wordId }`）に `example` を追加 |
  | `words-update.ts` | orphan 収集（`where: { wordId, ownerId: userId, id: { notIn } }`）に `example` を追加 |
  | `admin-user-delete.ts` | 削除前の URL 収集（`where: { ownerId: userId }`）に `example` を追加 |
  | `occurrence-purge.ts` | `examples` を `count` から `findMany({ select: { pronunciationAudioUrl } })` に変え、件数は `.length`、URL は `audioUrls` に合流させる |
  | `blob-purge.ts` | `purgeAllAudioBlobs` の収集に `example` を追加 |

- 例文の編集では音源を保持する。`upsertExamples`（`src/lib/words/handlers/example-handler.ts`）は `id` を持つ自分所有行を in-place update し `kind` / `text` / `meaning` / `sortOrder` だけを書くため、**音源カラムを触らない（本チケットでも変更しない）**。フォームから消えた自分所有の例文は `deleteOrphanedEditorOwned(tx, "example", ...)` で消えるので、`words-update.ts` の orphan URL 収集に `example` を足し、tx commit 後に `bestEffortDeleteAudioUrls` へ渡す（[02-data-model.md](../../design/example-audio/02-data-model.md) 決定 4）
- 6 経路目の `audio-manifest.ts` は本チケットの対象外（グループ分けとして 06 で扱う）（[02-data-model.md](../../design/example-audio/02-data-model.md) 決定 3・決定 7）

## 実装内容

### 変更: `prisma/schema.prisma`

`Example` モデルに `pronunciationAudioUrl String? @map("pronunciation_audio_url")` を追加する。index は張らない。`Meaning` / `RelatedWord` の該当行をそのまま写す。

### 作成: `prisma/migrations/<timestamp>_add_example_pronunciation_audio_url/migration.sql`

```sql
ALTER TABLE "example" ADD COLUMN "pronunciation_audio_url" TEXT;
```

`pnpm db:migrate` で生成・適用する。nullable カラム追加のみなので既存行の書き換え・テーブル全体のロックは発生しない。

### 変更: `src/lib/pronunciation-audio.ts`

- `ExampleNotFoundError`（`message: "EXAMPLE_NOT_FOUND"`）を新設する。既存の `MeaningNotFoundError` / `RelatedWordNotFoundError` と同形。
- `exampleTarget` ディスクリプタを追加する（前提の 4 フィールド表のとおり）。
- `uploadExampleAudioForUser` / `deleteExampleAudioForUser` を追加する（前提のシグネチャ）。既存 2 種と同じく共通コアへ `exampleTarget` を渡すだけの実装にする。
- 共通コア（`loadOwnedRow` / `uploadAudio` / `deleteAudio` / `validateAudioFile` / `bestEffortDel`）は変更しない。

### 変更: `src/lib/words-delete.ts`

削除前の音源 URL 収集（`where: { wordId }`）に `prisma.example` を追加する。既存の `meaning` / `relatedWord` の並びに足す。

### 変更: `src/lib/words-update.ts`

orphan URL 収集（`where: { wordId, ownerId: userId, id: { notIn } }`）に `example` を追加する。収集は tx の前に行い、収集した URL は tx commit 後に `bestEffortDeleteAudioUrls` へ渡す既存の順序に乗せる（tx 内でネットワーク I/O を呼ばない）。

### 変更: `src/lib/admin-user-delete.ts`

削除前の音源 URL 収集（`where: { ownerId: userId }`）に `example` を追加する。

### 変更: `src/lib/occurrence-purge.ts`

`examples` の取得を `count` から `findMany({ select: { pronunciationAudioUrl: true } })` に変える。件数の算出は `.length` に置き換え、取得した URL は既存の `audioUrls` に合流させる。

### 変更: `src/lib/blob-purge.ts`

`purgeAllAudioBlobs` の URL 収集に `example` を追加する。

## 完了条件（Definition of Done）

- [ ] unit（`pnpm test:unit`）: `src/lib/pronunciation-audio.unit.test.ts` に example ターゲットのケースを追加 — blob パスが `audio/example/<id>/pronunciation.mp3` になる／owner 本人は可／他人は不可／一般ユーザーは SYSTEM 所有行を操作不可／不存在は `ExampleNotFoundError`／delete が動く（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 5）
- [ ] unit（`pnpm test:unit`）: `src/lib/blob-purge.unit.test.ts` の既存ケースで、例文の音源も収集・削除対象になること（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 5）
- [ ] integration（`pnpm test:integration`）: `src/lib/pronunciation-audio.integration.test.ts` に example の 3 グループを既存の meaning・related-word と同じ構成で追加 — upload → 差し替え → 削除で DB と blob が追随／Word 削除・編集の orphan 削除で blob が消える／認可（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 5）
- [ ] integration: `src/lib/words-update.integration.test.ts` — フォームから消えた例文の音源が orphan として削除されること。あわせて、**本文・種別を編集しても音源が保持される**こと（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 5、[02-data-model.md](../../design/example-audio/02-data-model.md) 決定 4）
- [ ] integration: `src/lib/occurrence-purge.integration.test.ts` の既存ケースで、例文の音源も収集・削除対象になること（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 5）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` が通る
- [ ] `src/lib/words-detail.ts` / `src/lib/audio-import.ts` に差分が入っていないこと

## 実装メモ

- **計画外の変更**: `docs/ops/purge-blobs.md` / `docs/ops/purge-occurrence.md` が収集対象を「`Meaning` / `RelatedWord`」と明示列挙しており本チケットの変更で事実と食い違うため、モデル名 `Example` の追記のみ（計 3 箇所）を実施。担当表・07 のスコープに `docs/ops/` が無く放置されるため。
- **`pnpm db:migrate` だけでは Prisma Client が再生成されない**: `prisma migrate dev` 後に typecheck が `pronunciationAudioUrl does not exist on type` で落ちるため、`pnpm db:generate` を併せて実行する必要がある。**他チケットの worktree でも `pnpm db:migrate` の後に `pnpm db:generate` を実行すること**。
- **`words-update.ts` の orphan URL 収集位置**: チケット本文は「収集は tx の前」と書いているが、既存の Meaning / RelatedWord 実装は `$transaction` コールバック内で DB 読み取りし `bestEffortDeleteAudioUrls` のみ commit 後に呼ぶ構造。「tx 内でネットワーク I/O を呼ばない」という設計意図に従い既存構造を踏襲した（tx 内は DB 読み取りのみ）。
- **02 への申し送り**: `src/lib/schema/word-form.ts` の `exampleSchema` と `wordDetailToFormValues` の examples マッピングに `pronunciationAudioUrl` の pass-through は未追加（02 のスコープどおり）。
- **04 / 05 / 06 への申し送り**: `Example.pronunciationAudioUrl` は `words-detail.ts` 無変更のまま `WordDetail["examples"][number]` に載ることを typecheck で確認済み。
- 公開 API `uploadExampleAudioForUser` / `deleteExampleAudioForUser` は 02 のマージまで未参照（想定どおり。lint / typecheck とも問題なし）。
