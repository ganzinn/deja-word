# 発音音源の一括プリフェッチ（オフライン利用向け）

- ステータス: 実装済み（issue #154 / PR #159。**本番リリース後**の Android 実機検証待ち。成立確認後に ADR へ集約し本ドキュメントを削除する）
- 起票日: 2026-08-03
- 前提: 発音音源のローカルキャッシュ（[audio-local-cache](./audio-local-cache.md)、`public/sw.js`、PR #156）が実装済みであること
- スコープ確定: 全件一括ダウンロードのみ（掲載箇所ごとの部分ダウンロードは対象外）。UI は「単語全般」設定内のセクション

## 目的

自分のスコープ（system + 本人）の発音音源をまとめて事前ダウンロードし、Cache Storage `audio-v1` に格納する。

- 動機 1: **オフライン利用**。現状のキャッシュは「一度再生した音源」しか残らないため、電車内・機内モードでは未再生の単語が鳴らない。
- 動機 2: **初回からの通信削減**。Wi-Fi で一度落としておけば、以後モバイル回線で音源を取得しない。
- 非目的: 単語データ本体（ページ・API）のオフライン化。本件は音源ファイルだけを対象にする。

## 前提事実

[audio-local-cache](./audio-local-cache.md) の前提事実に加えて、本設計が依存するのは次の 2 点。

1. **Cache Storage はページ（window）からも同じ内容を参照・更新できる**。SW と window は同一オリジンの同じ `audio-v1` を共有するため、SW に postMessage して代行させなくてもページ側から直接 `caches.open("audio-v1")` を触ればよい。SW が制御していない状態（初回訪問直後など）でも成立する。
2. **音源 URL は不変**（`addRandomSuffix`、[ADR-0044](../adr/0044-blob-best-effort-delete.md)）。差し替え時は必ず新 URL になる。→ **URL がキャッシュにある = 取得済み（同一バイト列）** と判断でき、再ダウンロード要否の判定にサーバへの問い合わせ（HEAD・条件付き GET）が要らない。

## 方式

**ページ（クライアント）主導の並列ダウンロード + Cache Storage への直接 put**。SW への postMessage も、ビルド統合も行わない。

### 1. 音源 URL 一覧（manifest）の提供

- サービス層 `src/lib/audio-manifest.ts`（server-only）
  - `listAudioUrlsForUser(userId)`: `scopedOwnerIds(userId)` で `Meaning.pronunciationAudioUrl` と `RelatedWord.pronunciationAudioUrl` の非 null を引き、重複排除・ソートした `string[]` を返す。
  - `countAudioUrlsForUser(userId)`: 同条件の件数（画面初期表示用。URL 本体を送らずに「対象 N 件」を出すため）。
- 取得口 `src/app/api/audio/manifest/route.ts`（`GET`）
  - `getCurrentSession()` で未ログインは 401。`Response.json({ urls })` を `Cache-Control: no-store` で返す。
  - Server Action ではなく Route Handler にするのは、**クライアント JS が押下時に取得する読み取り**だから（`api/words/search/route.ts` と同じ役回り）。ページの RSC ペイロードに常時 ~1,900 件の URL を載せない。

### 2. 実行フロー（ダウンロードボタン押下時）

1. `GET /api/audio/manifest` で URL 一覧を取得し、**絶対 URL に正規化**する。dev では相対 key（`/api/dev-blob/...`）が返るが、SW のキャッシュキーは `request.url`（絶対）のため、`new URL(url, location.href).href` で揃える。
2. `cache.keys()` で端末内の既存エントリを列挙し、manifest と突き合わせる。
   - **manifest に無いエントリ = 掃除対象**。先に削除して容量を戻す（後述「キャッシュの掃除」）。
   - **manifest にあってキャッシュに無い URL = 未取得**。これだけをダウンロード対象にする。
3. 未取得分を**同時 6 本**で取得する。各件 `fetch(url, { mode: "cors", credentials: "omit", signal })` → 200 なら `cache.put(url, res)`。
   - SW 制御下では同 fetch を SW が横取りして自ら put するため、put 前に `cache.match(url)` を見て**二重書きを避ける**。
   - 個々の失敗（ネットワークエラー・非 200）は失敗件数に数えて**続行**する。全体を止めない。
4. 進捗を `{ done, total, failed, bytes }` でコールバックし、UI が件数と実測バイト数を表示する。
5. 完了・中止時に結果を toast で知らせ、「端末に保存済み」件数を更新する。

### 3. 取得済み音源を再ダウンロードしない（中断・再開）

手順 2 の突き合わせだけで成立する。

- `cache.keys()` は「実際に端末にあるエントリ」そのもの。推測や別途の進捗記録を持たない。
- 中断・失敗した音源は `cache.put` が完了せずキャッシュに入らないため、半端なエントリが残らない。次回実行時に自動で再取得対象になる。
- したがって**中断・再開のための進捗の永続化（localStorage 等）は不要**。2 回目以降の実行は「前回以降に増えた音源 + 前回失敗した分」だけを取りに行く。

### 4. キャッシュの掃除（エントリ上限）

キャッシュ設計 v1 で先送りした論点（issue #157 が「#154 とまとめて検討」としていたもの）をここで決める。

- **manifest 差分によるプルーニングを採用する**。ダウンロード実行時、manifest に無いエントリ（削除された音源・差し替え前の旧 URL）を削除する。manifest が権威なので、判定に曖昧さがない。
- **LRU・件数上限・TTL は導入しない**。エントリ数の実質上限は語彙数（~1,900）であり、1 件数十 KB で総量 20〜60MB に収まる。上限管理を入れると「プリフェッチしたのに追い出される」矛盾が生じる。
- 同一端末を別ユーザーが使った場合、後から実行した側の manifest で前ユーザー分のエントリが消える。キャッシュは再取得で自己修復するため許容する（むしろ他人の音源が端末に残らない点で望ましい）。
- issue #157 本体（削除・差し替え操作の**直後**に旧エントリを消す即時性）は別対応のまま。本設計は「次にプリフェッチしたときに揃う」保証を与える。

### 5. UI（設定 → 単語全般）

`/settings/general` に「発音音源のダウンロード」セクションを追加する（新規画面は作らない）。

- 表示: 「対象 N 件」（server から props）/「端末に保存済み M 件」（`cache.keys()` の件数）、全件でおよそ 20〜60MB になる旨と **Wi-Fi 接続時を推奨**する案内。
- 操作: `[ダウンロード]`（実行中は進捗と `[中止]`、中止は `AbortController`）、`[端末から削除]`（確認のうえ `caches.delete("audio-v1")`。容量を戻す手段）。
- 既存の「音声」セクションは保存ボタン型の設定だが、本セクションは**その場で実行される操作系**。枠線で区切り、「『保存』とは独立にその場で実行される」旨を明記して混同を防ぐ。
- Cache Storage 非対応環境（`typeof caches === "undefined"`）ではセクション自体を表示しない。従来動作のまま。

### 6. モジュール構成

| ファイル | 役割 |
| --- | --- |
| `src/lib/audio-manifest.ts` | server-only。scope 内の音源 URL 一覧・件数 |
| `src/app/api/audio/manifest/route.ts` | 認証付き GET |
| `src/lib/audio-cache.ts` | client-safe。`AUDIO_CACHE_NAME` / URL 正規化 / 差分計算 / 並列取得 / プルーニング |
| `src/app/settings/general/_components/audio-prefetch-section.tsx` | `"use client"`。進捗・中止・削除の UI |
| `src/app/settings/general/page.tsx` | 対象件数を渡してセクションを配置 |

`AUDIO_CACHE_NAME = "audio-v1"` は `public/sw.js` の `AUDIO_CACHE` と**二重管理になる**。sw.js は静的配信物でありビルド工程を持ち込まない方針（audio-local-cache）のため import で共有できない。両ファイルに相互参照コメントを置いて明示する（issue #157 でも同じ論点が挙がっている）。

## 採らなかった代替案

- **SW に postMessage して SW 側でダウンロードさせる** — ページを離れても継続できる利点はあるが、進捗の往復通知・中止指示・SW 未制御時のフォールバックが必要で実装が倍増する。設定画面を開いている間に完了する規模（20〜60MB）なので、ページ主導で足りる。
- **`cache.addAll(urls)` で一括投入** — 進捗が取れず、1 件でも失敗すると全体が reject する。1,900 件では実用にならない。
- **サーバで zip にまとめて 1 リクエストで配る** — 転送効率は上がるが、展開して個別 URL で `cache.put` する処理が要るうえ、URL 単位の cache-first という既存設計の単純さ（SW 側の無変更）を壊す。
- **サイズを事前に HEAD で集計して表示する** — 1,900 回の HEAD は本末転倒。概算レンジの案内と、実行中の実測バイト数で足りる。
- **`navigator.storage.estimate()` で使用量を表示する** — オリジン全体の概算でありキャッシュ以外も含むため、件数表示より誤解を招く。採らない。
- **バックグラウンド自動プリフェッチ（訪問時に黙って全件取得）** — 従量課金の通信をユーザーの同意なく発生させる。明示操作に限る。

## 影響・注意

- **ユーザー向け機能の追加**にあたるため、`docs/features/settings.md` の更新と `settings-general.png` の再撮影を同じ PR で行う（`pnpm e2e:capture-docs --only <section>`）。
- **Blob Data Transfer（従量課金）**が 1 実行あたり 20〜60MB／ユーザー・端末で一気に発生する。継続的なコストは下がる（以後ローカル応答）が、初回はまとまった転送になる。UI で Wi-Fi 推奨を案内する。
- `public/sw.js` の**ロジックは変更しない**（キャッシュ名の相互参照コメントを 1 行足すだけ）。プリフェッチは既存のキャッシュに書き込むだけで、再生経路は従来どおり。
- ブラウザのサイトデータ削除でキャッシュは消える。再実行で復旧する。
- 採用確定時の ADR は、音源ローカルキャッシュ本体の ADR（audio-local-cache の宿題。Android 実機検証の成立後に起票）に**プリフェッチを含めてまとめる**。本ドキュメントは実装完了時に削除する。

## 検証計画

- **ユニット**（`src/lib/audio-cache.unit.test.ts`）: URL の絶対化、差分計算（未取得・掃除対象の抽出）、並列ランナー（`fetch` / `caches` をスタブし、取得済みスキップ・失敗件数・中止時の途中終了・二重 put 回避を検証）。
- **インテグレーション**（`src/lib/audio-manifest.integration.test.ts`）: scope（system + 本人が入る／他ユーザーの音源が漏れない）、null 除外、重複排除、関連語の音源も含むこと。
- **dev での E2E**（`pnpm e2e:audio-prefetch`、`scripts/e2e/verify-audio-prefetch.ts`）:
  1. test1 で音源付きの単語を複数作成する
  2. 設定 → 単語全般 → ダウンロード → `audio-v1` に全件入る
  3. `.dev-blob` の実体を消しても `fetch` が 200（＝ローカルから応答している）
  4. 音源を 1 件外して再実行 → 該当エントリが掃除で消える／既取得分は再ダウンロードされない
- **実機（Android アプリ）**: 一括ダウンロード → 機内モードで単語テストを通し、未再生だった単語も音源が鳴ること。
  **本番リリース後に行う**。Cache Storage / Service Worker はセキュアコンテキスト限定のため、`http://` の
  LAN 越しでは機能ごと無効になり検証にならない（`adb reverse` で `http://localhost` に見せるか、`chrome://flags`
  の "Insecure origins treated as secure" が必要）。加えて WebView シェルの `APP_URL`
  （`android/app/.../MainActivity.kt`）は本番 URL 固定で、debug バリアントも無い。

## 実装タスク（1 PR 想定）

1. `src/lib/audio-manifest.ts` + `src/app/api/audio/manifest/route.ts`
2. `src/lib/audio-cache.ts`（定数・正規化・差分・並列取得・プルーニング）
3. `audio-prefetch-section.tsx` と `settings/general/page.tsx` への配置
4. ユニット / インテグレーション / E2E スクリプト
5. `docs/features/settings.md` 更新 + スクリーンショット再撮影
6. dev 動作確認・Android 実機確認
