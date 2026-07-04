# ADR-0043: Blob クライアントの DI 境界と env による driver 切替（dev はローカルディスク）

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

発音音源の保存先は本番では Vercel Blob だが、ローカル開発を外部 SaaS に依存させたくない（トークン取得・課金・オフライン不可の回避）。

## 決定内容

- `BlobClient` インターフェース（`put` / `del`）を DI 境界とし、driver を 2 つ持つ:
  - `vercelBlobClient`（実 Vercel Blob、`addRandomSuffix: true`）
  - `createLocalDiskBlobClient`（`.dev-blob/` へのローカルディスク保存。root は `DEV_BLOB_ROOT` で差し替え可能）
- **driver 選択は「`NODE_ENV !== "production"` かつ `BLOB_READ_WRITE_TOKEN` 未設定ならローカルディスク、それ以外は Vercel Blob」**。本番でトークン未設定の場合はディスクに落とさず実 Blob 経路のまま明示エラーにする（サイレントなローカル保存を防ぐ。実装コメントに明記。「Rails の environments/*.rb での service 選択に相当」とも注記）
- DB には**相対 key**（`/api/dev-blob/<key>`）だけを保存し、ローカル配信は Route Handler `api/dev-blob/[...key]` が担う。パストラバーサルは `resolveDevBlobPath` でガード
- `blob-client.ts` は `server-only` を付けた再エクスポートのみとし、実装 `blob-client-impl.ts` は server-only 非依存（tsx の ops スクリプトから再利用するため。[ADR-0052](0052-ops-scripts-di-core.md)）

## 採らなかった代替案

- ローカル開発でも Vercel Blob を使う — dev でもトークンを入れれば実 Blob を使える選択肢は残しつつ、既定では外部 SaaS 非依存とした（commit `72a7358` の「ローカルはディスク driver で Vercel 非依存」）
- MinIO 等の S3 互換エミュレータ —（推定）put/del の 2 メソッドで足りるため、コンテナ追加より薄い自前 driver を選んだと考えられる。比較の記録は無い

## 影響

- DB に相対 key しか入らないため、worktree 間で `.dev-blob/` を共有しないと「DB に URL はあるが実体が無い → 404」が起きる。`wt-new.sh` が `DEV_BLOB_ROOT` を本体に向けて共有させる（[ADR-0054](0054-worktree-shared-db-blob.md)）
- 「ローカル開発は外部 SaaS に依存させない」方針の代表実装として、他機能（AI ドラフト等）の判断の参照点になっている

## 根拠（コード・コミット・文書参照）

- `src/lib/blob-client-impl.ts:96-101` — driver 選択と理由コメント
- `src/lib/blob-client.ts` — server-only 境界
- commit `72a7358` "単語の発音/意味音源 機能を追加（ローカルはディスク driver でVercel非依存）"（PR #8）
- `src/app/api/dev-blob/[...key]/route.ts`
