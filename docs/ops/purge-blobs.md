# Purge Blobs（発音音源 Blob を全削除）

DB に記録された**すべての発音音源 Blob**（`Meaning.pronunciationAudioUrl` / `RelatedWord.pronunciationAudioUrl`）をまとめて削除する運用スクリプト。`pnpm db:purge-blobs` が単一エントリポイント。既定はドライラン（件数表示のみ・無変更）で、`--execute` 指定時のみ実削除する。

```sh
pnpm db:purge-blobs             # ドライラン（件数表示のみ・無変更）
pnpm db:purge-blobs --execute   # 実削除
```

## 背景・仕様

`prisma migrate reset` は DB を全削除して再構築するが、**Blob の実体は消さない**（DB には URL 文字列だけが入る）。DB を消した後では URL を辿れず孤児 Blob が残るため、**reset の前段で**本スクリプトを実行し、URL がまだ読めるうちに Blob を消しておく。

- **対象は全件**: オーナーや掲載箇所を問わず、`Meaning` / `RelatedWord` に記録された発音音源 URL を全件収集し、重複排除して `blob.del` で一括削除する。
- **ベストエフォート**: Blob 削除に失敗してもログを出すだけ（DB を真実とする方針）。失敗時は孤児 Blob が残るが整合性は保たれる。
- **DB は変更しない**: 本スクリプトは Blob 実体のみを消す。DB レコードの削除は後続の `prisma migrate reset` 等が担う。

> ⚠️ **不可逆**。実削除前に必ず**同一接続先**でドライランして件数を確認すること。

## 構成

| ファイル | 役割 |
|---|---|
| `scripts/purge-blobs.ts` | CLI（dotenv + PrismaPg、ドライラン/`--execute`、件数レポート） |
| `src/lib/blob-purge.ts` | コアロジック（prisma / blob を引数注入、`server-only` 非依存） |
| `src/lib/blob-client-impl.ts` | Blob ドライバ選択の実体（本番=Vercel Blob / dev=ディスク）。スクリプトはここを直接 import |

接続先は `DIRECT_URL → DATABASE_URL_UNPOOLED → DATABASE_URL` の順で解決する。Blob ドライバは「`NODE_ENV=production` もしくは `BLOB_READ_WRITE_TOKEN` あり → Vercel Blob、それ以外 → ローカルディスク（`.dev-blob/`）」で選ばれる。

## ローカル（dev DB）を最小状態にリセットする手順

ローカルで蓄積した単語・掲載箇所・発音音源をすべて消し、system ユーザーだけの初期状態に戻す:

```sh
# 0) docker の deja-word-db が起動していること
pnpm db:purge-blobs             # 1) 削除対象 Blob 件数を確認（ドライラン）
pnpm db:purge-blobs --execute   # 2) Blob を実削除（DB はまだ無傷 = URL を読めるうちに消す）
pnpm prisma migrate reset --force   # 3) DB を全削除 → migration 再適用 → 最小 seed（system ユーザーのみ）
```

> 注: `migrate reset` で **ユーザーアカウント（better-auth）も消える**。再ログインには新規登録、または `pnpm db:set-system-password` で system ユーザーに credential を再設定する。

確認（任意）:

```sh
docker exec deja-word-db psql -U dejaword -d dejaword -c \
  'select id,email from "user"; select count(*) from word; select count(*) from occurrence;'
# → user は system 1 行のみ、word / occurrence は 0
```

`.dev-blob/` 配下が空になっていることも併せて確認する。

## 本番（Neon + Vercel Blob）での注意

本スクリプトは**全件削除**のため、本番で安易に使わない。本番で特定の単語セットを撤去したい場合は掲載箇所単位の [`purge-occurrence`](./purge-occurrence.md) を使うこと。どうしても本番 Blob を全削除する場合は、`DIRECT_URL`（直結）と `BLOB_READ_WRITE_TOKEN`（実 Vercel Blob 経路にするため必須）を設定し、必ずドライランで件数を確認してから実行する。

```sh
pnpm dotenv -e .env.production.local -- pnpm db:purge-blobs            # 本番ドライラン
pnpm dotenv -e .env.production.local -- pnpm db:purge-blobs --execute  # 本番実削除
```
