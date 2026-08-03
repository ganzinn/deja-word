# 06. audio-prefetch-grouping（一括プリフェッチのグループ分け）

状態: **未着手**　PR: （未作成）

## 目的

一括プリフェッチ（ADR-0075）を「見出し語・関連語の音源」と「例文の音源」の 2 グループに分け、グループごとにダウンロードできるようにする。manifest はグループ別に URL と件数を返し、Cache Storage は 1 つのまま prune は両グループの和集合で判定する。

スコープ外:

- Cache Storage をグループごとに分けること（1 つのまま維持）（[02-data-model.md](../../design/example-audio/02-data-model.md) 決定 8）
- 「端末から削除」のグループ別化（共通 1 つのまま）（[05-ui-playback.md](../../design/example-audio/05-ui-playback.md) 決定 7）
- グループの同時ダウンロード（実行中はもう一方を無効化）（[05-ui-playback.md](../../design/example-audio/05-ui-playback.md) 決定 7）
- `scripts/e2e/verify-audio-cache.ts`（`pnpm e2e:audio-cache`）の変更。再生時キャッシュの検証で音源の種類に依存しないため**変更しない**（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 5）
- `docs/features/settings.md` の本文更新とスクリーンショット再撮影（→ 07）

## 依存チケット

- 01: `Example.pronunciationAudioUrl` カラム（`example` グループの URL を集めるため）

## 前提（設計決定の再掲）

- `src/lib/audio-manifest.ts` の 2 関数をグループ別に返す形へ変える（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 3、[02-data-model.md](../../design/example-audio/02-data-model.md) 決定 7）

  ```ts
  type AudioGroup = "word" | "example";
  type AudioUrlGroups = Record<AudioGroup, string[]>;   // listAudioUrlsForUser
  type AudioCountGroups = Record<AudioGroup, number>;   // countAudioUrlsForUser
  ```

- `word` グループ = Meaning + RelatedWord（現行の対象そのまま）、`example` グループ = Example。UI 上のラベルは「見出し語・関連語」「例文」（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 3）
- 重複排除は**グループ内**で行う。グループ間で同じ URL が現れることは無い（blob key の接頭辞が `audio/meaning/` / `audio/related-word/` / `audio/example/` で分かれ、`addRandomSuffix` により URL は一意）（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 3）
- `/api/audio/manifest` は**常に両グループを返す**（1 回のレスポンス）。クライアントはダウンロード時に片方だけを使い、prune の判定には**両グループの和集合**を使う。片方だけ取得して prune すると、もう一方のキャッシュが manifest に無い扱いで消える（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 3、[02-data-model.md](../../design/example-audio/02-data-model.md) 決定 8）
- 和集合を作るロジックは**コンポーネントに置かず `src/lib/audio-cache.ts` の純関数に切り出す**（unit テストの対象にするため）（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 5）
- 端末保存済み件数の表示は、キャッシュ済み URL とグループの URL 集合の**積**で数える（[02-data-model.md](../../design/example-audio/02-data-model.md) 決定 8）
- 設定画面の初期表示はグループ別件数（`countAudioUrlsForUser` の戻り値）を 2 行に割り当てる（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 3）
- `src/app/settings/general/_components/audio-prefetch-section.tsx` は**セクションを増やさず**、見出し「発音音源のダウンロード」と説明文は 1 つのまま維持し、中に 2 行を置く（[05-ui-playback.md](../../design/example-audio/05-ui-playback.md) 決定 7）

  ```
  発音音源のダウンロード
    （説明文：Wi-Fi 推奨・容量目安）

    見出し語・関連語   対象 n 件 ／ 端末に保存済み n' 件      [ダウンロード]
    例文               対象 m 件 ／ 端末に保存済み m' 件      [ダウンロード]

    [端末から削除]（確認ダイアログ → 両グループまとめて削除）
  ```

- 進捗バーと「中止」ボタンは**実行中の行にのみ**表示し、実行中はもう一方の「ダウンロード」も無効化する（同時実行はしない）。「端末から削除」は従来どおり 1 つで、Cache Storage の音源を全件削除する（[05-ui-playback.md](../../design/example-audio/05-ui-playback.md) 決定 7）
- 例文音源をグループ分けする目的は「見出し語だけ端末に持ちたい」「例文は Wi-Fi のときだけ」という選び方を可能にすること。例文音源は 1 件あたりの再生時間が語より長く、件数の伸び方も読めないため（[02-data-model.md](../../design/example-audio/02-data-model.md) 決定 7）
- 現行の `audio-prefetch-section.tsx` は `diffAudioCache(manifest, cached)` の `stale`（manifest に無いキャッシュ）を `pruneAudioCache` で消す構造（[02-data-model.md](../../design/example-audio/02-data-model.md) 決定 8 前提）

## 実装内容

### 変更: `src/lib/audio-manifest.ts`

- `AudioGroup` / `AudioUrlGroups` / `AudioCountGroups` 型を定義する。
- `listAudioUrlsForUser` を `AudioUrlGroups` を返す形に、`countAudioUrlsForUser` を `AudioCountGroups` を返す形に変える。
- `example` グループの収集を追加する（`word` グループの対象は現行のまま）。重複排除はグループ内で行う。

### 変更: `src/app/settings/general/page.tsx`

`countAudioUrlsForUser(session.user.id)` の戻り値が `number` → `AudioCountGroups` に変わるため、`<AudioPrefetchSection totalCount={audioCount} />` の受け渡しをグループ別件数に追随させる（props 名も実態に合わせて見直す）。

### 変更: `src/app/api/audio/manifest/route.ts`

グループ別のレスポンスを返すよう追随する。常に両グループを含める。

### 変更: `src/lib/audio-cache.ts`

グループ別 URL から prune 用の和集合を作る純関数を追加する（例: `unionAudioUrlGroups(groups: AudioUrlGroups): string[]`）。既存の `diffAudioCache` / `pruneAudioCache` / `listCachedAudioUrls` / `clearAudioCache` のシグネチャは変えない（prune の呼び出し側が和集合を渡す）。

### 変更: `src/app/settings/general/_components/audio-prefetch-section.tsx`

- グループ別 2 行のレイアウトへ変更する（前提のワイヤーフレーム）。
- ダウンロード対象は選択した行のグループの URL、prune の判定対象は和集合（`unionAudioUrlGroups`）を渡す。
- 端末保存済み件数は「キャッシュ済み URL ∩ そのグループの URL」で数える。
- 進捗バー・「中止」は実行中の行にのみ表示し、実行中はもう一方の「ダウンロード」を無効化する。
- 「端末から削除」は 1 つのまま（確認ダイアログ・全件削除の挙動を変えない）。

### 変更: `scripts/e2e/verify-audio-prefetch.ts`

グループ別 2 行の UI に追随させる。例文音源を持つ単語を作り、`example` グループの件数・ダウンロード・prune・削除を検証する。あわせて `fetchManifest` のレスポンス型（現状 `{ urls: string[] }`）をグループ別に追随させる。

**例文音源の用意は prisma ＋ dev blob への直接書き込みで行う**（`scripts/e2e/db.ts` の `ensureDemoAudio` と同じく、`silent.mp3` を `DEV_BLOB_ROOT` 配下へ置いて `Example.pronunciationAudioUrl` を update する）。既存の `createWordWithAudio` は編集画面の file input 経由でアップロードしているが、その方式を例文にも使うとチケット 02（音源登録 UI）のマージが前提になり、本チケットが 02 に直列依存してしまう。本 E2E の検証対象は manifest のグループ分けとキャッシュ挙動であって登録 UI ではないため、直接書き込みで足りる。

## 完了条件（Definition of Done）

- [ ] unit（`pnpm test:unit`）: `src/lib/audio-cache.unit.test.ts` に和集合の純関数のケースを追加 — **片方のグループだけダウンロードしても、もう一方の URL が stale と判定されないこと**（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 5）
- [ ] integration（`pnpm test:integration`）: `src/lib/audio-manifest.integration.test.ts` の**既存ケースをグループ別に書き換え**（戻り値が配列／数値からグループ別オブジェクトに変わるため、配列比較や `count === list.length` の assert は必ず壊れる）、**そのうえで** `example` グループのケースを追加 — 他人の音源が混ざらないこと、system の音源が入ること（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 5）
- [ ] E2E: `pnpm e2e:audio-prefetch` が通る（グループ別 2 行の件数・ダウンロード・prune・削除）（[06-architecture.md](../../design/example-audio/06-architecture.md) 決定 5）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` が通る
- [ ] `scripts/e2e/verify-audio-cache.ts` に差分が入っていないこと

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
