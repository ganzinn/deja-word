# M5: デプロイ準備 実装計画

## Context

基盤整備フェーズ M1〜M4 が完了し、認証 UI・ルート保護までローカルで動く状態。M5 の目的は、これを **Vercel 本番環境でも成立** させ、「サインアップ → ログイン → 保護ページ閲覧」を本番 URL で通すこと。併せて、デプロイ失敗の事前検知のための CI（GitHub Actions）も同セッションで整える。

本計画はプランニングセッション（2026-04-20〜21）で Manual Connection + Terraform 方針で詳細化し、**2026-04-22 の Phase 1 着手時に方針転換**して Vercel-Managed Integration + `vercel.ts` 方針に差し替えた。

### 方針転換の経緯（2026-04-22）

当初は「Neon は Dashboard 手動、Vercel のみ Terraform 化」で進める予定だったが、Neon 新規アカウントが **Vercel 連携組織に自動紐付けされ、Neon Console からの直接 Project 作成が不可**（メッセージ: "To create a new project, use the Neon Postgres integration in Vercel"）だったため、以下を検討:

| 選択肢 | 概要 | 判断 |
|---|---|---|
| A-1: 別 Neon アカウント（Email + Password）で直接 Project 作成 | 当初計画維持 | 不採用 |
| A-2: Vercel-Managed Integration 経由で Neon を Install | 計画改訂 | **採用** |
| B-1: A-2 採用時、Terraform を撤廃し `vercel.ts` + Dashboard に置換 | IaC を軽量化 | **採用** |
| B-2: A-2 採用時、Terraform は残す | ドリフト検知目的 | 不採用（残す旨味が薄い） |

A-2 + B-1 を採用した理由:
- Terraform 管理対象が `BETTER_AUTH_SECRET` 1 本だけに縮み、tfstate の secret 平文・Vercel Access Token 管理コストに見合わない
- Integration が `DATABASE_URL` / `DATABASE_URL_UNPOOLED` を自動注入するため、env var の二重管理（Terraform vs Integration）を回避できる
- `vercel.ts` は 2026 年時点で Vercel が推奨する TypeScript ベースのプロジェクト設定ファイル。`fluid: true` / `regions: ['sin1']` など計画書の要件を型安全に表現できる

## 確定した方針

| 項目 | 採用 | 備考 |
|---|---|---|
| 本番 DB | **Neon**（Vercel-Managed Integration 経由で作成） | PG 17 系、無料枠 |
| DB 接続方式 | **Integration 自動注入の `DATABASE_URL`（pooled）＋ `DATABASE_URL_UNPOOLED`（direct）** | Neon 標準。コード側で `DIRECT_URL ?? DATABASE_URL_UNPOOLED ?? DATABASE_URL` の優先フォールバック |
| Preview 環境 | **作らない**（Vercel Dashboard で Preview Deployments OFF） | 無料枠 Storage 0.5 GB を本番データで使い切れるよう温存。`vercel.ts` では指定不可のため Dashboard 操作 |
| CI | **M5 に含める**。GitHub Actions で `pnpm lint` + `pnpm typecheck` | PR / main push で走らせる |
| IaC | **なし**（Terraform 撤廃）。`vercel.ts` でビルド・ランタイム挙動を管理 | プロジェクト作成・env var・Integration は Vercel Dashboard 一撃で完結 |
| リージョン | **Vercel Function: `sin1` (Singapore) / Neon: `aws-ap-southeast-1` (Singapore)** | 日本ユーザー体感最速（~75ms）。Function↔DB が同一リージョンで ~5ms |

### Neon Free プラン上限と本プロジェクトでの評価（2026-04 時点の公式ドキュメント）

| 項目 | Free 上限 | 本プロジェクトの割当 |
|---|---|---|
| Storage | 0.5 GB / project（全 branch 合算） | 全量を production で使用 |
| Branches | 10 / project | production 1 本のみ（Preview branching 無効化） |
| Compute | 100 CU-hours/month | production 1 本に全量 |
| Egress | 5 GB / month | 余裕 |

## 事前にユーザー側で準備するもの

| 項目 | 内容 | 備考 |
|---|---|---|
| Vercel アカウント | https://vercel.com/signup（GitHub ログイン） | Hobby プラン、無料 |
| **Vercel GitHub App インストール** | https://github.com/apps/vercel → `ganzinn/deja-word` のみに権限付与 | Vercel Dashboard から Import する前に済ませておく |

※ 当初計画にあった **Terraform CLI / Vercel Access Token / 個別の Neon アカウント** は不要になった（Terraform 撤廃 + Integration が Neon を自動作成）。

## 実装ステップ

### Phase 1: ローカル PG ダウングレード ✅（2026-04-22 完了）

Neon GA の最新 17 にローカルを揃える。

- `docker-compose.yml`: `postgres:18-alpine` → `postgres:17-alpine`
- 既存 volume `deja-word_dejaword_pgdata` は PG 18 フォーマットのため、`docker compose down -v` で破棄 → PG 17 で再初期化 → `pnpm db:migrate:deploy` で `20260419132900_init_auth` 再適用

Neon 本番プロジェクト作成は Phase 3 の Marketplace Install に移動。

### Phase 2: `vercel.ts` 作成

`@vercel/config` を追加し、プロジェクト設定を TypeScript で記述:

```ts
// vercel.ts（リポジトリ直下）
import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  fluid: true,          // Fluid Compute を明示（新規プロジェクトはデフォルト有効だが、将来のデフォルト変更に強くなる）
  regions: ["sin1"],    // Function を Singapore に固定。Hobby は 1 region のみ
};
```

- 依存追加: `pnpm add -D @vercel/config`
- ⚠️ `vercel.ts` **では Preview Deployments 無効化や環境変数の値は投入できない**。これらは Vercel Dashboard で設定する（Phase 3）

### Phase 3: Vercel プロジェクト作成 + Neon Marketplace Install + Secret 投入

Vercel Dashboard で 4 ステップ:

1. **プロジェクト Import**:
   - Dashboard → **Add New → Project** → `ganzinn/deja-word` を Import
   - Framework Preset は Next.js（自動検出）。Root Directory / Build Command はデフォルト
   - 初回 Deploy は **失敗してよい**（`vercel-build` script / DB env var がまだ揃っていない）。Phase 6 の Merge で自動デプロイが走るまで触らない

2. **Preview Deployments を無効化**:
   - Project → **Settings → Git → Preview Deployments** を OFF
   - こうしておかないと Neon 側で Preview branching を有効化しなくても、Vercel 上に Preview URL だけできてしまう

3. **Neon Postgres を Marketplace から Install**:
   - Project → **Storage → Connect Database → Marketplace → Neon Postgres** → **Install**
   - ダイアログで:
     - **Region**: `Singapore (ap-southeast-1)`
     - **Postgres Version**: `17`
     - **Plan**: `Free`
     - **Preview branching**: **OFF**（toggle を有効化しない）
     - Database name は任意（`dejaword` など）
   - Install 完了後、Settings → Environment Variables で `DATABASE_URL` / `DATABASE_URL_UNPOOLED` / `PGHOST` / `PGUSER` / `PGDATABASE` / `PGPASSWORD` / `POSTGRES_*` が **Production target で自動注入されている**ことを確認

4. **`BETTER_AUTH_SECRET` を手動追加**:
   - ローカルで `openssl rand -base64 32` を実行して値を生成
   - Settings → Environment Variables → Add New
     - Key: `BETTER_AUTH_SECRET`
     - Value: 生成した値
     - Environments: **Production** のみチェック
     - **Sensitive を ON**（Dashboard / API から読み取り不可にする）

### Phase 4: コード修正

1. **`prisma.config.ts`**: `datasource.url` を 3 段フォールバックに
   ```ts
   datasource: {
     url:
       process.env["DIRECT_URL"] ??
       process.env["DATABASE_URL_UNPOOLED"] ??
       process.env["DATABASE_URL"],
   },
   ```
   - 理由: `prisma migrate deploy` の advisory lock が PgBouncer transaction mode で不安定。マイグレーション経路だけ direct にする
   - ローカル: `DATABASE_URL` のみ → フォールバック
   - Vercel 本番: Integration 注入の `DATABASE_URL_UNPOOLED` を拾う
   - `DIRECT_URL` は将来の手動オーバーライド用に優先順位最上位に残す

2. **`src/lib/auth.ts`**: `baseURL` を環境変数フォールバック付きで指定
   ```ts
   baseURL:
     process.env.BETTER_AUTH_URL ??
     (process.env.VERCEL_PROJECT_PRODUCTION_URL
       ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
       : undefined),
   ```
   - Vercel の `VERCEL_PROJECT_PRODUCTION_URL` は protocol 抜きで自動注入される system env var。`https://` を足せばそのまま `baseURL` に使える
   - ローカル: `BETTER_AUTH_URL=http://localhost:3000` を `.env.local` に設定（Vercel 変数はローカルで undefined）

3. **`src/lib/prisma.ts`**: `PrismaPg` に `connectionTimeoutMillis: 15_000` を追加
   ```ts
   const adapter = new PrismaPg({
     connectionString: process.env.DATABASE_URL,
     connectionTimeoutMillis: 15_000,  // Neon Scale-to-Zero cold start 対策
   });
   ```
   - Integration 注入の `DATABASE_URL` には `?sslmode=require` のみで `connect_timeout` が含まれないため、`pg.Pool` オプション側でタイムアウトを延ばす
   - ローカルは Docker 即応なので影響なし

4. **`package.json`**: `"vercel-build": "prisma migrate deploy && next build"` を scripts に追加
   - Vercel は `vercel-build` が存在すれば自動で `build` の代わりに使う
   - ローカル `pnpm build` は無変更
   - ⚠️ `prisma migrate deploy` が失敗するとビルド全体が失敗し、production は直前の stable デプロイにロールバックされる（= 破壊的 migration は慎重に）

5. **`.env.example`**: コメントで「ローカル開発のみ必須」の旨を追記（`DATABASE_URL` / `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL`）。本番は Integration + Dashboard が供給

### Phase 5: GitHub Actions CI

`.github/workflows/ci.yml`（新規）:
- トリガ: `push`（main）, `pull_request`
- ジョブ（ubuntu-latest）:
  1. `actions/checkout@v4`
  2. `jdx/mise-action@v2`（`.mise.toml` から Node / pnpm を自動解決）
  3. `pnpm install --frozen-lockfile`（`postinstall` の `prisma generate` で生成クライアント復元）
  4. `pnpm lint`
  5. `pnpm typecheck`
- DB / 認証 env 不要

### Phase 6: 初回デプロイ

1. Phase 2 + 4 + 5 のコード修正を **1 PR** にまとめて main に merge
2. Vercel が自動デプロイ → `vercel-build` で `prisma migrate deploy` が走り、Neon production に `20260419132900_init_auth` が適用される
3. `baseURL` は `VERCEL_PROJECT_PRODUCTION_URL` から自動生成されるため、URL 再投入 → Redeploy の二重デプロイは不要

### Phase 7: 本番動作確認

本番 URL で:
1. `/`, `/sign-up`, `/sign-in` が 200
   - 初回アクセスが遅い場合は Neon の Scale-to-Zero からの cold start（数百 ms 〜 数秒）。2 回目以降が速ければ正常
2. `/sign-up` 登録 → `/dashboard` 200、`/api/auth/get-session` が DB セッション返却
3. Cookie `better-auth.session_token` が `Secure` / `HttpOnly` / `SameSite=Lax`（Secure が付かない場合 `auth.ts` に `advanced: { useSecureCookies: true }` 追加）
4. ログアウト → `/dashboard` で 307 `Location: /sign-in?redirect=%2Fdashboard`
5. **Cookie 偽装**: 任意値の session cookie で `/dashboard` → 307（proxy は通すが DB 照合 null）
6. Neon Console（Vercel 組織配下）で `user` / `session` / `account` のレコード作成を確認
7. Vercel Dashboard → Deployments で **Instant Rollback が 1 click で可能なことを目視確認**（操作はしない。運用知識の素振り）

### Phase 8: 計画書更新

- `docs/plan/foundation-milestones.md` に M5 実装結果を追記（M1〜M4 と同フォーマット）
- マイルストーン一覧の M5 を ✅ 完了に
- 基盤整備フェーズ完走を記載

## Critical Files（修正対象）

| パス | 操作 | 内容 |
|---|---|---|
| `docker-compose.yml` | ✅ edited (Phase 1) | `postgres:18-alpine` → `postgres:17-alpine` |
| `.mise.toml` | edit | `terraform = "1.14.9"` の行を削除（撤廃方針のため） |
| `vercel.ts` | new | `framework: "nextjs"` / `fluid: true` / `regions: ["sin1"]` |
| `package.json` | edit | `@vercel/config` を devDependencies に追加 / `vercel-build` script 追加 |
| `prisma.config.ts` | edit | `datasource.url` を `DIRECT_URL ?? DATABASE_URL_UNPOOLED ?? DATABASE_URL` に |
| `src/lib/auth.ts` | edit | `baseURL` に `BETTER_AUTH_URL ?? https://${VERCEL_PROJECT_PRODUCTION_URL}` フォールバック実装 |
| `src/lib/prisma.ts` | edit | `PrismaPg` に `connectionTimeoutMillis: 15_000` |
| `.env.example` | edit | ローカル専用である旨のコメント追記 |
| `.github/workflows/ci.yml` | new | lint + typecheck |
| `docs/plan/foundation-milestones.md` | edit | M5 結果追記 |
| `package.json` の `engines` / `packageManager` | 無変更 | exact pin の 3 箇所同期は維持 |

## 既存資産の再利用

- `prisma/migrations/20260419132900_init_auth/`: 無変更。Neon 本番でも `vercel-build` が `migrate deploy` する
- `src/proxy.ts`, `src/lib/session.ts`: 無変更。M4 で実装済みのセッション検証をそのまま本番へ
- `package.json` の `postinstall: prisma generate`: 無変更。Vercel / GitHub Actions 双方で生成クライアントが自動で揃う
- M2 で採用した **`@prisma/adapter-pg`** を継続（Neon 公式 Prisma ガイドは `@prisma/adapter-neon` を推奨しているが、cold start を WebSocket/HTTP で高速化する目的のもので機能的には adapter-pg でも可。cold start レイテンシが顕在化したら移行検討）

## 検証（E2E）

- **ローカル**: `pnpm lint && pnpm typecheck && pnpm format:check && pnpm build` が通ること
- **CI**: GitHub Actions が PR で GREEN
- **Production**: Phase 7 の 7 項目全通過

## 既知のリスク・運用上の注意

- **Neon プロジェクトが Vercel 組織配下にある**ため、Vercel プロジェクトを削除すると Neon も連動して削除される可能性。M5 スコープでは発動しないが、将来プロジェクト作り直しを行う際は順序に注意
- **`DATABASE_URL_UNPOOLED` は Neon Integration 固有の変数名**。`@prisma/adapter-neon` / Prisma 公式ドキュメントが `DIRECT_URL` の名前で示すことが多いので、コード側のフォールバック順（`DIRECT_URL ?? DATABASE_URL_UNPOOLED ?? DATABASE_URL`）を保つことで両方の慣例に追従できる
- **Preview Deployments を OFF にしないと Preview URL だけ残る**。Integration 側の Preview branching を有効化していない場合、Preview デプロイは production DB を指すため認証データが混ざる。Phase 3 の Dashboard 設定を忘れない
- **`prisma migrate deploy` 失敗 = デプロイ全体失敗**。`vercel-build` script 内でマイグレーションが走るため、破壊的 migration（列の rename / drop など）は慎重に分割する
- **Fluid Compute を誤って無効化すると Hobby は急速に制限される**。default 300s / max 300s から **default 10s / max 60s** に急落。`vercel.ts` の `fluid: true` を明示指定で誤操作を防ぐ
- **Neon Free プラン: Scale-to-Zero 5 分固定（無効化不可）**。5 分アクセスがないと compute が停止し、次回アクセス時に数百 ms 〜 数秒の cold start が発生。Phase 7 初回のレスポンスが遅くても 2 回目以降が速ければ正常
- **Hobby プランの Function region は 1 要素まで**。`regions` に 2 要素以上指定すると API エラー。Edge Network（CDN・静的配信）は region 指定に関係なく全世界 PoP 配信
- **Vercel Dashboard の設定変更は git 管理外**。Preview Deployments OFF や BETTER_AUTH_SECRET の投入は「人間が覚えておくもの」。本計画書がその唯一の記録なので、将来プロジェクトを作り直す際は Phase 3 を辿る

## M5 では触らない（次フェーズ以降の宿題）

- 監視・ロギング（Sentry / Vercel Logs Drain）
- Better Auth Cookie Cache プラグイン（SiteHeader の DB アクセス負荷軽減）
- カスタムドメイン / メール送信（パスワードリセット等）
- Preview 環境の導入（現状は Preview Deployments OFF。有効化する場合は Neon の Preview branching も併せて ON にする）
- **BotID Basic を `/sign-up` / `/sign-in` に導入**（全プラン無料。単語アプリ実装フェーズ以降、攻撃兆候があれば）
- **`@prisma/adapter-neon` への移行検討**（cold start レイテンシが問題化した場合）
- **Rolling Releases**（Pro 移行後、段階的ロールアウトが必要になったら）
- **IaC 再導入**: プロジェクトが増えるなら Terraform（または Pulumi）の再検討。現時点は Vercel Dashboard の手作業 + 本計画書の Phase 3 が手順書を兼ねる
- 基盤整備フェーズ完走後の「単語アプリ機能の全体設計」セッション
