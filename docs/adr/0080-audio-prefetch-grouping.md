# ADR-0080: 一括プリフェッチは見出し語・関連語／例文のグループ別にダウンロードする（Cache Storage は 1 つ・掃除は和集合）

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-08-04

## 背景

発音音源は設定画面から一括プリフェッチして端末に残せる（[ADR-0075](0075-audio-local-cache-and-prefetch.md)）。対象は manifest（`GET /api/audio/manifest`）が返す全音源で、ボタンは「ダウンロード」1 つだった。

ここに例文の音源（[ADR-0079](0079-example-pronunciation-audio.md)）が加わる。例文音源は 1 件あたりの再生時間が語より長く、件数の伸び方も登録の仕方次第で読めない。1 ボタンのままだと「見出し語だけ端末に持ちたい」「例文は Wi-Fi のときだけにしたい」という選び方ができず、通信量・容量の判断をユーザーから奪う（ユーザー要望）。

## 決定内容

**manifest と件数をグループ別に返し、ダウンロード操作をグループ単位にする。ただし Cache Storage は 1 つのまま維持し、掃除（prune）と「端末から削除」はグループをまたいで行う**。

- グループキーは `AudioGroup = "word" | "example"`。`word` = Meaning ＋ RelatedWord（従来の対象そのまま）、`example` = Example。UI ラベルは「見出し語・関連語」「例文」。
- `listAudioUrlsForUser` は `Record<AudioGroup, string[]>`、`countAudioUrlsForUser` は `Record<AudioGroup, number>` を返す。重複排除はグループ内で足りる（blob key の接頭辞が分かれ、`addRandomSuffix` で URL が一意なのでグループ間で同じ URL は現れない）。
- **`/api/audio/manifest` は常に両グループを返す**。クライアントは「ダウンロードする対象＝選んだグループ」「prune の判定対象＝両グループの和集合（`unionAudioUrlGroups`）」と使い分ける。
- 設定画面は 1 セクション内に 2 行を並べる。進捗バーと「中止」は実行中の行にだけ出し、実行中はもう一方の「ダウンロード」を無効化する（同時実行はしない）。「端末から削除」は従来どおり 1 つで、両グループまとめて消す。
- **グループ別の「端末に保存済み n 件」を出すため、設定画面はマウント時にも manifest を 1 回読む**。保存済みは「キャッシュ済み URL ∩ そのグループの URL 集合」でしか出せず、クライアントがグループ別の URL 集合を持つ必要があるため（blob key の接頭辞での振り分けは上記のとおり却下）。「対象 n 件」はサーバ側の `countAudioUrlsForUser` から即時に渡る。RSC ペイロードに URL を載せない（Route Handler にした）方針自体は維持する。
- 「ダウンロード」ボタンが 2 つ並ぶため、各行に `role="group"` + `aria-label`（グループ名）を、各ボタンに `aria-label="<グループ名>をダウンロード"` を付ける（可視テキストは「ダウンロード」のまま）。

## 採らなかった代替案

- **manifest にグループを持たせず、クライアントが blob key の接頭辞（`audio/example/`）で振り分ける** — サーバ側の変更は最小だが、blob key の規約が UI の分類ロジックに漏れる。key 規約を変えた瞬間に分類が壊れ、しかもテストで気づきにくい。
- **グループごとに別エンドポイントを用意する／manifest を 2 回 fetch する** — prune の和集合を作るのに結局どちらも取ることになり、往復が増える。片方が失敗すると不完全な和集合で prune が走る。
- **グループごとに Cache Storage を分ける** — prune の事故は防げるが、`audio-cache.ts` の全 API（`listCachedAudioUrls` / `clearAudioCache` / 再生時のヒット判定）にキャッシュ名の引き回しが波及する。再生側は「この URL がキャッシュにあるか」しか要らないため、保存先を分ける利点がない。
- **設定セクションを 2 つに割る** — 説明文・進捗バー・削除ダイアログが 2 重になり、「どちらの削除を押したのか」の取り違えリスクが生まれる。
- **削除もグループ別にする** — 例文だけ容量を空ける選択肢は作れるが、ダイアログとグループ別 prune の実装が増える。必要になってから足せる（片方向の拡張なので後戻りしない）。
- **TG例文だけをプリフェッチ対象にする** — manifest の where に `kind` 条件が入り、単語詳細では他種別だけキャッシュ未ヒットという説明しにくい差が出る。
- **保存済み件数のグループ別表示をやめてマウント時の manifest 取得を避ける** — 転送は減るが、「対象 n 件」だけでは自分がどこまで保存済みかが分からず、グループを分けた目的（どちらを落とすか選ぶ）に対して情報が足りない。

## 影響

- **設定画面（単語全般）を開くたびに manifest を 1 回 fetch する**（本番想定 1,900 件強、dev DB 実測 ~1,907 URL）。押下時にのみ読む従来より通信が増える。転送量が問題になったら「件数だけの軽量エンドポイント」への分割が次の一手になる。
- 現在の実装では、この manifest 取得が終わるまで**「発音音源のダウンロード」セクション全体が描画されない**（Cache Storage 対応判定と manifest 取得を同じ非同期の折り返しで確定させているため）。取得が遅い環境では、対象件数を出せる状態でもセクションが数秒遅れて現れる。段階表示（対象件数を先に出し、保存済みだけ `…` にする）は後から入れられる。
- ダウンロードは 2 回に分かれる（片方ずつ）。片方だけ実行しても、もう一方のキャッシュは prune で消えない。
- 「すべて保存済み」のトーストはグループ名入りになる（例文だけ完了して「すべての発音音源が」と出るのを避けるため）。
- `countAudioUrlsForUser` の戻り値が `number` → `AudioCountGroups` に変わるため、設定ページからの受け渡しも追随している。将来グループを増やす場合は、この 2 関数の戻り値・UI の行定義・prune の和集合の 3 箇所で完結する。
- E2E（`pnpm e2e:audio-prefetch`）はグループ別 2 行の UI に追随済み。

## 根拠（設計・コード・文書参照）

- `src/lib/audio-manifest.ts`（`AudioGroup` / `listAudioUrlsForUser` / `countAudioUrlsForUser`）、`src/app/api/audio/manifest/route.ts`
- `src/lib/audio-cache.ts`（`unionAudioUrlGroups`）、`src/app/settings/general/_components/audio-prefetch-section.tsx`、`src/app/settings/general/page.tsx`
- 検証: `src/lib/audio-cache.unit.test.ts` / `src/lib/audio-manifest.integration.test.ts`、`pnpm e2e:audio-prefetch`（`scripts/e2e/verify-audio-prefetch.ts`）
- [ADR-0075](0075-audio-local-cache-and-prefetch.md)（一括プリフェッチ本体・manifest 差分による掃除）の追補。supersede しない
- [ADR-0079](0079-example-pronunciation-audio.md)（グループを分ける契機になった例文音源）
- issue #170
