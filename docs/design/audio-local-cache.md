# 発音音源のローカルキャッシュ（Service Worker cache-first）

- ステータス: 実装済み（本番リリース後の Android 実機検証待ち。成立確認後に ADR を起票し本ドキュメントを削除する）
- 起票日: 2026-08-02
- スコープ確定: キャッシュのみ（一括プリフェッチは issue 起票し本設計の対象外）

## 目的

一度再生した発音音源（mp3）を端末に保存し、2 回目以降はサーバー（Vercel Blob）へアクセスせずローカルから再生する。

- 対象: ブラウザ利用・Android アプリ（WebView シェル、[ADR-0073](../adr/0073-webview-android-app.md)）の両方
- 動機: Blob Data Transfer（従量課金）の削減、再生の高速化・安定化
- 非目的: 完全オフライン利用（初回再生には通信が必要。全件事前ダウンロードは別 issue）

## 前提事実（2026-08-02 調査）

設計の成立条件は以下をすべて確認済み。

1. **音源 URL は不変**。`addRandomSuffix: true`（`src/lib/blob-client-impl.ts`）で発行され、差し替え時は新 URL・旧 URL は best-effort 削除（[ADR-0044](../adr/0044-blob-best-effort-delete.md)）。→ **URL をそのままキャッシュキーにでき、キャッシュ無効化ロジックが不要**。
2. **公開 Blob 配信は CORS 許可・Range 対応**。実在の公開 Blob URL への実測で `access-control-allow-origin: *` と `accept-ranges: bytes` を確認。→ SW から cors モードで取得でき、opaque レスポンスのクォータ水増し（Chrome で 1 件 ≒ 7MB 換算）を回避できる。
3. **想定規模は問題なし**。本番の単語 1,928 件が全件音源登録されても、単語発音 mp3（10〜30KB 程度）× 約 1,900 件 ≒ 20〜60MB。Cache Storage のオリジンクォータ（通常 GB 単位）にも Android アプリのデータ領域にも収まる。
4. **Android System WebView は Service Worker 対応**。Web 側の SW 実装がアプリにそのまま効く見込み（実機検証項目）。
5. **再生経路は 2 つとも media リクエスト**。`<audio src>`（`src/components/audio-play-button.tsx`）とクイズ先読みの `new Audio()`（[ADR-0047](../adr/0047-quiz-audio-autoplay-preload.md)、`quiz-flow.tsx`）。いずれも SW の fetch イベントで横取りできるため、**アプリ側のコード変更は不要**。

## 方式

**静的な `public/sw.js`（Service Worker）+ Cache Storage、音源リクエストだけ cache-first**。ビルド統合・依存追加なし。

### SW 登録

- `public/sw.js` を root layout 配下の client component（`SwRegister`、描画なし）から `navigator.serviceWorker.register("/sw.js")` で登録する。scope はルート既定のまま。
- 登録時に `navigator.storage.persist()` を best-effort で呼ぶ（ストレージ逼迫時の追い出し軽減。拒否されても動作は変わらない）。
- SW 非対応環境（`"serviceWorker" in navigator` が偽）では何もしない。従来動作のまま。

### fetch ハンドラ（対象判定）

以下のどちらかに一致するリクエストだけを処理し、それ以外は `respondWith` を呼ばず素通しする（ページ・Server Action・API に一切触れない）。

- ホストが `*.public.blob.vercel-storage.com`（本番の音源）
- 同一オリジンで pathname が `/api/dev-blob/` 始まり（dev のローカルディスク配信。本番では出現しないため無害で、**dev でも同じコードパスを検証できる**）

dev-blob 配信（`src/app/api/dev-blob/[...key]/route.ts`）は認証なし・`Cache-Control: no-store` だが、どちらも支障ない: 認証なしは文書化済みの既存例外（`src/app/CLAUDE.md`）で `credentials: "omit"` と整合し、`cache.put` は HTTP キャッシュ意味論（no-store）に従わず保存するため cache-first の検証が dev で成立する。

判定は音源に限らずホスト単位でよい（当該ホストに置くのは発音音源のみ。将来別種のファイルを置く場合はこの前提を見直す）。

### cache-first 応答

1. `caches.open("audio-v1")` から URL（クエリ除去なし・そのまま）でマッチ。
2. ヒット: キャッシュから応答（Range 付きなら後述の 206 組み立て）。
3. ミス: `fetch(url, { mode: "cors", credentials: "omit" })` で**全量**取得し、200 ならキャッシュへ `put` してから応答する。media リクエストは `no-cors` モードで届くが、SW 内で cors モードの fetch に差し替えることで非 opaque のまま保存する（前提事実 2）。
4. 取得失敗（オフライン等）: エラーをそのまま返す。`<audio>` の `onError` / クイズ先読みの取得失敗無視（ADR-0047）が受け止めるため、既存のエラー処理に変更は不要。

### Range リクエスト対応（206）

media 再生は `Range` ヘッダ付きで要求されることがある（特に WebView / Safari）。キャッシュには常に全量を保存し、`Range` 付きリクエストにはキャッシュ済み本体から該当バイト範囲を切り出して `206 Partial Content`（`Content-Range` / `Content-Length` 付き）を組み立てて返す。

- 対応するのは `bytes=start-` / `bytes=start-end` / `bytes=-suffix` の単一範囲のみ。多重範囲・不正値は全量 200 で返す（ブラウザの media スタックは許容する）。

### テスト方式（sw.js は静的ファイルのままユニットテストする）

`public/sw.js` は自己完結のプレーン JS とし（ビルド・バンドル工程を持ち込まない）、Range パース・206 組み立て・対象 URL 判定の pure 関数を sw.js 内に定義したうえで **`self.__swInternals = { ... }` として末尾で公開**する。ユニットテスト `src/lib/sw.unit.test.ts` は `public/sw.js` をファイルとして読み込み、スタブした `self`（`addEventListener` 等を捕捉）を与えて評価し、`__swInternals` 経由で pure 関数を検証する。

- テストが SUT の隣（public/）に置けないのは、Vitest の include が `src/**/*.unit.test.ts` のためという制約による例外。テストファイル冒頭にその旨をコメントする。
- 出荷される sw.js そのものを評価対象にするため、「テスト用に分離したソース」と「配信物」の乖離が構造的に起きない利点がある。

### キャッシュ管理

- キャッシュ名は `audio-v1` で固定。SW の `activate` で `audio-v` 始まりの旧バージョン名を削除する（フォーマット変更時の移行口）。
- **v1 ではエントリの掃除（削除音源の回収・LRU）は実装しない**。URL 不変・1 エントリ数十 KB・実質上限が語彙数であり、肥大リスクが小さいため。一括プリフェッチ導入時に上限管理とまとめて再検討する。
- SW 更新は `skipWaiting()` + `clients.claim()` で即時有効化する。cache-first への切り替えが再生途中に起きても、応答内容は同一 URL の同一バイト列であり無害。

## 採らなかった代替案

- **WebView の `shouldInterceptRequest` によるネイティブキャッシュ** — Android アプリにしか効かない。Web 側も対象にする本要件では SW 一本が実装・保守とも小さい。**WebView 上で SW が動かない・不安定と実機検証で判明した場合のフォールバックとして温存**する。
- **Workbox / Serwist の導入** — 対象 1 ホスト・戦略 1 種（cache-first + range）にビルド統合と依存追加は過剰。Range 対応込みでも自前 sw.js は小さく、exact pin 運用（[ADR-0002](../adr/0002-exact-version-pinning.md)）の管理対象も増やさない。
- **HTTP キャッシュ任せ（`cacheControlMaxAge` 延長のみ）** — ブラウザ / WebView の HTTP キャッシュは容量・追い出しを制御できず「ローカルに残る」保証がない。なお `cacheControlMaxAge` の延長自体は本設計と独立に併用可能（音源 URL は不変のため延長のデメリットがない）。本設計では変更しない。
- **`<audio crossorigin="anonymous">` をマークアップに付与して cors 化** — SW 内の cors 再取得で足りるため不要。アプリ側変更ゼロを優先。

## 影響・注意

- **UI・操作は一切変わらない**ため、`docs/features/` の更新は不要（AGENTS.md の「ユーザー向け機能変更時は features 更新」には該当しない）。
- 初回再生時の挙動・通信は従来と同一。2 回目以降がローカル応答になる。
- キャッシュはブラウザのストレージ削除（サイトデータ消去）で消えるが、再ダウンロードで自己修復する。
- サイトに SW が常駐すること自体が新規要素。対象判定を音源に限定しているため、ページ更新・デプロイ反映（[ADR-0073](../adr/0073-webview-android-app.md) の「リリースだけで自動反映」特性）には影響しない。
- 採用確定時に ADR を起票する（「発音音源のローカルキャッシュは SW cache-first で行う」。本ドキュメントは実装完了後に削除し、決定記録は ADR に残す）。

## 検証計画

- **ユニット**: Range パース / 206 組み立て / 対象 URL 判定（前述）。
- **dev での E2E**: `pnpm e2e:audio-cache`（`scripts/e2e/verify-audio-cache.ts`、実装済み）。dev は `/api/dev-blob/` 配信のため同じ SW コードパスで検証できる。フローは「mp3 登録（fixture: `scripts/e2e/fixtures/silent.mp3`）→ 試聴クリックで audio-v1 に格納 → **origin の実体ファイルを削除しても 200 で応答**（未キャッシュ URL は 404 の negative control 付き）→ リロード跨ぎ → Range 付き fetch が 206」。キャッシュ格納の待機は「match が返る」でなく「本文まで全量読める」を条件にする（put 直後の可視性タイミングによるフレークを実装時に確認。詳細はスクリプト内コメント）。
- **実機（Android アプリ）**: WebView シェルで (1) SW が登録される、(2) クイズ自動再生・先読みがキャッシュ経由になる、(3) 機内モードでキャッシュ済み音源が再生できる、(4) シーク（Range）で再生が壊れない。**(1) が不成立の場合は shouldInterceptRequest フォールバックの設計に切り替える**。
- **本番相当**: preview 環境または dev + `BLOB_READ_WRITE_TOKEN`（実 Blob driver）で、cross-origin の blob ホストに対する cors 再取得・キャッシュを確認。

## 実装タスク（1 PR 想定）

1. `public/sw.js`（対象判定・cache-first・cors 再取得・Range/206・`audio-v1`・旧キャッシュ掃除）
2. `SwRegister` client component と root layout への配置（`storage.persist()` 含む）
3. Range / 206 / 対象判定のユニットテスト
4. dev での動作確認 + Android 実機検証（上記検証計画）
5. ADR 起票・本設計ドキュメントの削除（実装完了時）
