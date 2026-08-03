# ADR-0075: 発音音源は SW cache-first で端末に残し、一括プリフェッチでオフライン利用を成立させる

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-08-03

## 背景

発音音源（`pronunciationAudioUrl`、mp3）は再生のたびに Vercel Blob から取得していた。これには 2 つの問題がある。

- **Blob Data Transfer（従量課金）が再生回数に比例する**。単語テストは同じ単語を何度も出題するため、同一ファイルを繰り返し取りに行く。
- **オフラインで再生できない**。Android アプリ（WebView シェル、[ADR-0073](0073-webview-android-app.md)）は移動中の利用が主で、圏外・機内モードでは音源が鳴らない。

設計成立の前提は調査で確認済み。

1. **音源 URL は不変**。`addRandomSuffix: true`（`src/lib/blob-client-impl.ts`）で発行し、差し替え時は新 URL・旧 URL は best-effort 削除（[ADR-0044](0044-blob-best-effort-delete.md)）。→ **URL をそのままキャッシュキーにでき、無効化ロジックが要らない**。
2. **公開 Blob 配信は CORS 許可・Range 対応**（実測で `access-control-allow-origin: *` / `accept-ranges: bytes`）。→ cors モードで取得でき、opaque レスポンスによるクォータ水増し（Chrome で 1 件 ≒ 7MB 換算）を避けられる。
3. **規模が収まる**。本番の単語 1,900 件強が全件音源を持っても mp3 は 1 件 10〜30KB、合計 20〜60MB。Cache Storage のオリジンクォータにも端末のデータ領域にも収まる。
4. **再生経路は 2 つとも media リクエスト**（`<audio src>` と quiz 先読みの `new Audio()`、[ADR-0047](0047-quiz-audio-autoplay-preload.md)）。どちらも Service Worker の fetch イベントで横取りできる。

## 決定内容

**静的な `public/sw.js` による音源だけの cache-first + 設定画面からの一括プリフェッチ**を採用する。ビルド統合・依存追加はしない。

### キャッシュ本体（Service Worker）

- `public/sw.js` を root layout 配下の `SwRegister`（描画なし client component）から `navigator.serviceWorker.register("/sw.js")` で登録する。`navigator.storage.persist()` も best-effort で呼ぶ。SW 非対応環境では何もしない。
- **横取りするのは音源リクエストだけ**。ホストが `*.public.blob.vercel-storage.com`、または同一オリジンで `/api/dev-blob/` 始まり（dev のローカルディスク配信。dev でも同一コードパスを検証できる）。それ以外は `respondWith` せず素通しし、ページ・Server Action・API には一切触れない。
- cache-first: `caches.open("audio-v1")` を URL でマッチ → ヒットならキャッシュ応答、ミスなら `fetch(url, { mode: "cors", credentials: "omit" })` で**全量**取得し 200 なら `put` してから返す。media リクエストは no-cors で届くが、SW 内で cors に差し替えて非 opaque のまま保存する。
- **Range リクエストはキャッシュ全量から 206 を組み立てる**（WebView / Safari の media 再生対策）。対応は `bytes=start-` / `bytes=start-end` / `bytes=-suffix` の単一範囲のみで、多重範囲・不正値は全量 200 で返す（media スタックは許容する）。
- キャッシュ名は `audio-v1` 固定。`activate` で `audio-v` 始まりの旧バージョンを削除する（フォーマット変更時の移行口）。更新は `skipWaiting()` + `clients.claim()` で即時有効化する（同一 URL は同一バイト列なので再生中の切り替えも無害）。

### 一括プリフェッチ（設定 → 単語全般）

- 対象一覧は Route Handler `GET /api/audio/manifest`（`src/lib/audio-manifest.ts`）が返す。`scopedOwnerIds`（system + 本人）で Meaning / RelatedWord の音源 URL を引く。押下時にだけ読むため Server Action ではなく Route Handler にし、ページの RSC ペイロードに ~1,900 件を常時載せない。
- **実行はページ（window）主導**で、SW に postMessage せず `src/lib/audio-cache.ts` から Cache Storage を直接読み書きする。window と SW は同じ `audio-v1` を共有するため、**SW 未制御の状態でも成立する**。同時 6 本で取得し、個別の失敗は数えて続行、中止は `AbortSignal`、容量超過（`QuotaExceededError`）は途中で打ち切る。
- **取得済みは再ダウンロードしない**。`cache.keys()` と manifest の突き合わせだけで未取得を確定できる（前提 1 より「キャッシュにある = 取得済み」）。中断・失敗分は `cache.put` が完了せずキャッシュに入らないため次回に再取得される。→ **進捗の永続化も HEAD / 条件付き GET も不要**で、中断・再開がこの仕組みだけで成立する。
- SW 制御下では同じ fetch を SW が横取りして自ら put するため、put 前に `match` を見て二重書きを避ける。

### キャッシュの掃除（エントリ上限）

- **manifest 差分によるプルーニングを採用する**。プリフェッチ実行時、manifest に無いエントリ（削除された音源・差し替え前の旧 URL）を削除する。manifest が権威なので判定に曖昧さがない。
- **LRU・件数上限・TTL は導入しない**。エントリ数の実質上限は語彙数であり、上限管理は「プリフェッチしたのに追い出される」矛盾を生む。
- 同一端末を別ユーザーが使った場合、後から実行した側の manifest で前ユーザー分が消える。再取得で自己修復するため許容する（他人の音源が端末に残らない利点もある）。
- 削除・差し替え操作の**直後**に旧エントリを消す即時性は本 ADR の範囲外（issue #157）。本 ADR は「次にプリフェッチしたときに揃う」ことを保証する。

### テスト方式

`public/sw.js` は自己完結のプレーン JS のままとし、Range パース・206 組み立て・対象 URL 判定の pure 関数を `self.__swInternals` で公開する。`src/lib/sw.unit.test.ts` が **`public/sw.js` をファイルとして読み込み**スタブした `self` で評価して検証する。出荷物そのものを評価するため「テスト用ソース」と「配信物」の乖離が構造的に起きない。テストを SUT の隣（`public/`）に置けないのは Vitest の include が `src/**` のためという制約による例外。

## 採らなかった代替案

- **WebView の `shouldInterceptRequest` によるネイティブキャッシュ** — Android アプリにしか効かない。Web も対象にする要件では SW 一本が実装・保守とも小さい。**WebView 上で SW が動かないと判明した場合のフォールバックとして温存**する（実機で成立を確認済み）。
- **Workbox / Serwist の導入** — 対象 1 ホスト・戦略 1 種にビルド統合と依存追加は過剰。Range 対応込みでも自前 sw.js は小さく、exact pin 運用（[ADR-0002](0002-exact-version-pinning.md)）の管理対象も増やさない。
- **HTTP キャッシュ任せ（`cacheControlMaxAge` 延長のみ）** — 容量・追い出しを制御できず「ローカルに残る」保証がない。延長自体は本決定と独立に併用可能（URL 不変のためデメリットが無い）。
- **SW に postMessage して SW 側でダウンロードさせる** — ページを離れても継続できる利点はあるが、進捗の往復通知・中止指示・SW 未制御時のフォールバックが必要で実装が倍増する。設定画面を開いている間に終わる規模のためページ主導で足りる。
- **`cache.addAll(urls)` で一括投入** — 進捗が取れず、1 件でも失敗すると全体が reject する。~1,900 件では実用にならない。
- **サーバで zip にまとめて 1 リクエストで配る** — 転送効率は上がるが、展開して URL 単位で `put` する処理が要り、「URL 単位の cache-first」という SW 側の単純さを壊す。
- **掲載箇所ごとの部分ダウンロード** — 全件でも 20〜60MB で端末側の制約が無く、manifest の絞り込みと UI が複雑になるだけ。
- **バックグラウンド自動プリフェッチ（訪問時に黙って全件取得）** — 従量課金の通信をユーザーの同意なく発生させる。明示操作に限る。
- **`<audio crossorigin="anonymous">` をマークアップに付与** — SW 内の cors 再取得で足りる。アプリ側変更ゼロを優先。

## 影響

- **アプリ側の再生コードは無変更**。初回再生の挙動・通信は従来どおりで、2 回目以降がローカル応答になる。取得失敗は `<audio>` の `onError` と quiz 先読みの失敗無視（[ADR-0047](0047-quiz-audio-autoplay-preload.md)）が受け止める。
- **サイトに SW が常駐する**こと自体が新規要素。対象判定を音源に限定しているため、ページ更新・デプロイ反映（[ADR-0073](0073-webview-android-app.md) の「リリースだけで自動反映」特性）には影響しない。
- **一括ダウンロードは Blob Data Transfer を 1 実行あたり 20〜60MB／ユーザー・端末で消費する**。継続コストは下がるが初回はまとまった転送になるため、UI で Wi-Fi 接続時を推奨する。
- キャッシュはブラウザのサイトデータ削除で消えるが、再取得で自己修復する。設定画面の「端末から削除」で明示的に容量を戻せる。
- **Cache Storage / Service Worker はセキュアコンテキスト限定**。`http://` の LAN 越し dev では機能ごと無効になり、ボタンも表示されない（`isAudioCacheSupported()` が偽）。端末実機で確かめるには `adb reverse` で `http://localhost` に見せるか、本番・preview（https）を使う。
- キャッシュ名 `audio-v1` は `public/sw.js` と `src/lib/audio-cache.ts` の**二重管理**になる（静的配信物に import を持ち込まない方針のため）。両ファイルに相互参照コメントを置いている。

## 根拠（設計・コード・文書参照）

- `public/sw.js`（対象判定・cache-first・cors 再取得・Range/206・旧キャッシュ掃除）、`src/components/sw-register.tsx`
- `src/lib/audio-cache.ts`（URL 正規化・差分・並列取得・プルーニング）、`src/lib/audio-manifest.ts`、`src/app/api/audio/manifest/route.ts`
- `src/app/settings/general/_components/audio-prefetch-section.tsx`（UI）
- 検証: `src/lib/sw.unit.test.ts` / `src/lib/audio-cache.unit.test.ts` / `src/lib/audio-manifest.integration.test.ts`、`pnpm e2e:audio-cache` / `pnpm e2e:audio-prefetch`（`scripts/e2e/`）
- 実機確認: Android アプリで一括ダウンロード → 機内モードで単語テストを通し、未再生だった単語も音源が鳴ることを確認（2026-08-03、本番リリース `rel-202608030241` 後）
- PR #156（キャッシュ本体）/ PR #159（一括プリフェッチ）、issue #154 / #157
- [ADR-0044](0044-blob-best-effort-delete.md)（URL 不変・削除ベストエフォート）/ [ADR-0043](0043-blob-di-driver-switching.md)（dev のローカルディスク配信）/ [ADR-0047](0047-quiz-audio-autoplay-preload.md)（再生経路）/ [ADR-0073](0073-webview-android-app.md)（WebView シェル）
