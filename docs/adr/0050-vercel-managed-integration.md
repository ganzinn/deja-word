# ADR-0050: Vercel-Managed Integration 採用（Terraform + Dashboard 手動方針を撤回）

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

M5（デプロイ）の当初計画は「Terraform + Vercel/Neon Dashboard の手動設定」だった。しかし Neon の新規アカウントが Vercel 連携組織に自動紐付けされ、Neon Console から直接 Project を作成できない仕様であることが判明した。

## 決定内容

- 当初方針を**撤回**し、**Vercel-Managed Integration**（Vercel Marketplace 経由で Neon をプロビジョニングし、接続情報 env を Vercel が管理する方式）を採用する
- あわせて Postgres を PG17（Neon で GA）に揃える

## 採らなかった代替案

- **Terraform + Dashboard 手動**（当初計画） — 上記の Neon 側仕様を踏まえ撤回（commit `cd6ad29` に撤回理由が明記された、方針転換の記録が残る決定）

## 影響

- DB 接続情報（`DATABASE_URL` 系）は Vercel の Integration 管理下にあり、手動の IaC 管理対象ではない
- ローカルの docker-compose Postgres（開発用）と Neon（本番）の二本立てになり、接続文字列の解決順 `DIRECT_URL → DATABASE_URL_UNPOOLED → DATABASE_URL` が両対応の要になっている（[ADR-0003](0003-prisma7-driver-adapter-generated-client.md)）

## 根拠（コード・コミット・文書参照）

- commit `cd6ad29` "M5 Phase 1 とデプロイ計画を Vercel-Managed Integration 方針に差し替え" — 撤回理由の明記
- `docker-compose.yml` — ローカル PG17（postgres:17-alpine）
