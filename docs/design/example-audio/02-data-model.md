# 02. データモデル・音源ライフサイクル

状態: **確定**（2026-08-03）

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- 例文にも発音音源（mp3）を登録でき、未登録のときだけ TTS にフォールバックする（01 確定）。
- 対象は全例文種別（TARGET / PHRASE / MINIMAL / SENTENCE）で、音源登録を種別で絞らない（01 確定）。
- 例文に発音記号は持たせない（01 確定）。
- 例文音源の一括取り込みは行わず、登録は 1 件ずつの手動アップロードのみ（01 確定）。

## 検討事項リスト

- [x] `Example` への音源カラム追加（カラム名・null 許容・index の要否・migration の形） → 決定 1
- [x] blob key の命名と配置（既存 `meaning` / `related-word` のディレクトリ規約との整合） → 決定 2
- [x] 音源 URL を横断で扱う既存経路への波及: `words-delete.ts` / `words-update.ts`（orphan 収集）/ `admin-user-delete.ts` / `occurrence-purge.ts` / `blob-purge.ts` / `audio-manifest.ts` → 決定 3
- [x] 例文の更新・削除で音源が孤児化しないための扱い（例文行の入れ替え時の挙動） → 決定 4
- [x] 既存データへの backfill の要否 → 決定 5
- [x] 既存 ops スクリプトへの影響確認（`db:import-audio` は見出し語・関連語のままで例文カラムを触らない。一括取り込みを作らないことは 01 決定 7） → 決定 6
- [x] 一括プリフェッチ（ADR-0075）で例文音源をどう扱うか → 決定 7・決定 8

## 議論・決定

### 決定 1: `Example` に `pronunciationAudioUrl String? @map("pronunciation_audio_url")` を追加する

`Meaning` / `RelatedWord` と同じカラム名・同じ型・nullable。index は張らない。

採用理由: `pronunciation-audio.ts` の `AudioTarget.loadOwned` が `{ ownerId, pronunciationAudioUrl } | null` を返す契約になっており、同名にすれば `prisma.example.findUnique` の `select` がそのまま型に合う。横断 6 経路も同じフィールド名で書けるため、`Meaning` の記述をコピーして対象モデルだけ替える形になり、追随漏れに気づきやすい。index を張らないのは、横断経路の絞り込みが `wordId` / `ownerId`（既存 index）で行われ、`pronunciationAudioUrl: { not: null }` は結果の絞り込みに使われるだけのため。`Meaning` / `RelatedWord` にも張っていない。

却下した代替案:

- `audioUrl` など短い別名にする → ディスクリプタの型に合わせる mapping が必要になり、6 経路それぞれで名前が食い違って「どちらの名前だったか」を毎回確認することになる。
- 音源を別テーブル（`ExampleAudio`）に切り出す → 1 例文 1 音源で多重度が増えず、`Meaning` / `RelatedWord` と構造が変わる。join が増えるだけで得るものがない。

### 決定 2: blob key は `audio/example/<exampleId>/pronunciation.mp3`

`AudioTarget.dir` に `"example"` を置く。ファイル名は既存と同じ `pronunciation.mp3`。

採用理由: 既存の `audio/meaning/<id>/pronunciation.mp3` / `audio/related-word/<id>/pronunciation.mp3` と同じ規約で、`dir` の 1 語追加だけで済む。

却下した代替案: 例文種別を key に含める（`audio/example/tg/<id>/...`）→ `kind` は編集フォームで変更できる（`upsertExamples` が `kind` を update する）ため、種別を key に埋めると変更後に key と実体の意味がずれる。種別は DB を見れば分かるので key に持たせる必要がない。

### 決定 3: 音源 URL を横断で扱う既存経路すべてに Example を追加する

対象は 6 ファイル・7 関数。いずれも既存の `meaning` / `relatedWord` の並びに `example` を足す。

| 経路 | 変更内容 |
| --- | --- |
| `words-delete.ts` | 削除前の URL 収集（`where: { wordId }`）に `example` を追加 |
| `words-update.ts` | orphan 収集（`where: { wordId, ownerId: userId, id: { notIn } }`）に `example` を追加（決定 4） |
| `admin-user-delete.ts` | 削除前の URL 収集（`where: { ownerId: userId }`）に `example` を追加 |
| `occurrence-purge.ts` | `examples` を `count` から `findMany({ select: { pronunciationAudioUrl } })` に変え、件数は `.length`、URL は `audioUrls` に合流させる |
| `blob-purge.ts` | `purgeAllAudioBlobs` の収集に `example` を追加 |
| `audio-manifest.ts` | 決定 7 のとおり、既存 2 関数の戻り値をグループ別（見出し語・関連語 / 例文）にする |

採用理由: 削除系（`words-delete` / `words-update` / `admin-user-delete` / `occurrence-purge` / `blob-purge`）で落とすと、DB から行が消えたのに blob 実体だけが残る。孤児 blob は DB に手掛かりが無くなるため後から回収できない（`blob-purge` も DB の URL を起点に消す設計のため拾えない）。

却下した代替案: 先に UI と登録だけ実装し、削除経路の追随を後続チケットに回す → 追随前に登録された音源が孤児化し、その分は永久に回収できない。カラム追加・登録・削除経路は同一チケットで揃える（[06](06-architecture.md) の順序ヒントへ引き継ぐ）。

### 決定 4: 例文の編集では音源を保持し、フォームから消えた例文の音源は orphan として消す

- 保持: `upsertExamples`（`words/handlers/example-handler.ts`）は `id` を持つ自分所有行を in-place update し、`kind` / `text` / `meaning` / `sortOrder` だけを書く。`pronunciationAudioUrl` を触らないので、本文や種別を編集しても音源は残る
- 削除: フォームから消えた自分所有の例文は `deleteOrphanedEditorOwned(tx, "example", ...)` で消えるため、`words-update.ts` の orphan URL 収集（現状 `meaning` / `relatedWord` のみ）に `example` を足し、tx commit 後に `bestEffortDeleteAudioUrls` へ渡す

採用理由: `Meaning` の音源とまったく同じ経路・同じ順序（tx 前に URL を控える → commit 後にベストエフォート del）に乗るため、例文だけ別の考え方を覚える必要がない。ネットワーク I/O をトランザクション内に入れない既存方針も保てる。

却下した代替案: 例文削除時に UseCase 側で個別に `blob.del` を呼ぶ → 収集タイミングが経路ごとに分散し、tx 内でネットワーク I/O を呼ぶ書き方を誘発する。

### 決定 5: 既存データの backfill は不要。migration は `ALTER TABLE "example" ADD COLUMN "pronunciation_audio_url" TEXT;` のみ

採用理由: 音源は手動アップロードのみで（01 確定）、初期値は全行 NULL。nullable カラムの追加なので、既存行の書き換えもテーブル全体のロックも発生しない（`20260614092420_add_related_word_pronunciation_audio_url` と同じ形）。

### 決定 6: ops スクリプトは `db:import-audio` を対象外とし、purge 系のみ追随する

`audio-import.ts`（`db:import-audio`）は `Meaning` 専用のまま変更しない。`occurrence-purge.ts` / `blob-purge.ts` は決定 3 のとおり例文を含める。

採用理由: 一括取り込みを作らないことは 01 で確定済み。一方 purge 系は「消し漏らすと孤児 blob が残る」側なので、取り込みの有無と関係なく追随が要る。

### 決定 7: 一括プリフェッチは「発音音源（見出し語・関連語）」と「例文の音源」を分けてダウンロードできるようにする

`audio-manifest.ts` はグループ別に URL と件数を返す形にする（例: `listAudioUrlsForUser` / `countAudioUrlsForUser` が `{ word: string[]; example: string[] }` / `{ word: number; example: number }` を返す）。設定画面はグループごとに件数表示とダウンロード操作を持つ（配置と文言は [05](05-ui-playback.md) で確定する）。

採用理由: 例文音源は 1 件あたりの再生時間が語より長く、件数の伸び方も登録の仕方次第で読めない。まとめて 1 ボタンにすると「見出し語だけ端末に持ちたい」「例文は Wi-Fi のときだけ」という選び方ができず、通信量・容量の判断をユーザーから奪う（ユーザー要望）。

却下した代替案:

- 全音源を 1 つの manifest にまとめる → 実装は最小だが上記の選択ができない。
- TG例文だけプリフェッチ対象にする → manifest の where に `kind` 条件が入り、単語詳細では他種別だけキャッシュ未ヒットという説明しにくい差が出る。

### 決定 8: Cache Storage は 1 つのまま維持し、prune は両グループの和集合に対して行う

- `/api/audio/manifest` は 1 回のレスポンスで両グループの URL を返す
- クライアントは「ダウンロードする対象＝選んだグループ」「prune の判定対象＝両グループの和集合」と使い分ける
- 端末保存済み件数の表示は、キャッシュ済み URL とグループの URL 集合の積で数える

採用理由: 現行の `audio-prefetch-section.tsx` は `diffAudioCache(manifest, cached)` の `stale`（manifest に無いキャッシュ）を `pruneAudioCache` で消す。グループ単位の manifest だけを渡すと、例文をダウンロードした瞬間に見出し語のキャッシュが「不要」と判定されて消える。prune の目的は「DB から消えた・差し替わった音源の掃除」なので、判定は常に全体の manifest に対して行う必要がある。

却下した代替案:

- グループごとに Cache Storage を分ける → prune の事故は防げるが、`audio-cache.ts` の全 API（`listCachedAudioUrls` / `clearAudioCache` / 再生時のヒット判定）にキャッシュ名の引き回しが波及する。再生側は「この URL がキャッシュにあるか」しか要らないため、保存先を分ける利点がない。
- グループごとに manifest を 2 回 fetch する → prune のために結局どちらの呼び出しでも両方を取ることになり、往復が増えるだけ。
