# Release Deploy（リリースタグ運用）

production への反映は **「Create Release」ワークフローの手動実行** が単一エントリポイント。実行すると `rel-YYYYMMDDHHmm` 形式のタグで GitHub Release を作成し、続けて production にデプロイする。`main` へのマージ自体ではデプロイされない。

## 背景

Vercel の Git Integration は **ブランチベース** で、git タグや GitHub Release を直接トリガにできない（production = production branch への merge）。そのため:

- `vercel.ts` の `git.deploymentEnabled` を **全ブランチ false** にして Git push 起点の自動デプロイを停止
- production デプロイは GitHub Actions → Vercel CLI(`vercel deploy --prod`) で実行

ビルドは `--prebuilt` を使わず **リモートビルド**（ソースを Vercel にアップロードして Vercel 側でビルド）。これにより Sensitive な `BETTER_AUTH_SECRET` や Neon Integration の env が Vercel 側で揃い、`vercel-build`（`prisma migrate deploy && next build`）が従来の main-merge デプロイと同一に走る。

## ワークフロー構成

| ファイル | 役割 |
|---|---|
| `.github/workflows/create-release.yml` | **エントリポイント**。手動実行で `rel-YYYYMMDDHHmm` タグの Release を作成し、deploy を呼び出す |
| `.github/workflows/release-deploy.yml` | デプロイ本体（reusable）。`create-release` からの呼び出し、または手動 UI の Release Publish で起動 |
| `.github/workflows/prune-deployments.yml` | 古い production デプロイの**手動掃除ツール**（`workflow_dispatch`）。→ [デプロイ履歴の掃除](#デプロイ履歴の掃除prune) |

> `GITHUB_TOKEN` で作成した Release は `release: published` を**再発火しない**（GitHub の無限ループ防止仕様）。そのため `create-release.yml` は `release-deploy.yml` を `workflow_call` で直接呼び出してデプロイをつなぐ。

`release-deploy.yml` はデプロイ時に GitHub の **Deployments（`production` 環境）** を `actions/github-script` で明示的に作成・更新する（CLI デプロイは GitHub Deployments を作らないため）。完了するとリポジトリの Environments / Deployments パネルに履歴が積まれ、`environment_url`（View deployment のリンク先）には当該デプロイの Vercel URL が入る。この更新には `deployments: write` 権限が必要で、reusable は呼び出し元の権限を超えられないため `create-release.yml` 側にも同権限を付与している。

## 初期セットアップ（一度だけ）

GitHub リポジトリの Settings → Secrets and variables → Actions に以下を登録する。

| Secret | 値 / 取得元 |
|---|---|
| `VERCEL_TOKEN` | Vercel Account Settings → Tokens で発行 |
| `VERCEL_ORG_ID` | `.vercel/repo.json` の `orgId`（例: `team_...`） |
| `VERCEL_PROJECT_ID` | `.vercel/repo.json` の `projects[].id`（例: `prj_...`） |

ID の確認手順（ローカル）:

```sh
pnpm exec vercel login
pnpm exec vercel link --repo   # 既存の deja-word プロジェクトを選択
cat .vercel/repo.json          # orgId / projects[].id を確認
```

`.vercel/` は `.gitignore` 済み。commit しないこと。

## リリース手順（通常運用）

1. 変更を `main` に merge する（この時点ではデプロイされない）
2. GitHub → **Actions** → 左の **Create Release** → **Run workflow**
   - Branch: `main`（既定）
   - 補足ノート（任意）を入力 ※ リリースノートは UI の「Generate release notes」と同じ内容が自動生成される（`--generate-notes`）。補足を入力した場合はその先頭に追記される
   - **Run workflow**
3. `create-release` が `rel-YYYYMMDDHHmm`（JST）タグの Release を作成 → `deploy` が lint / typecheck / test:unit → `vercel deploy --prod` で production 反映
4. Actions のログとデプロイ URL で反映を確認

タグはタイムスタンプなので辞書順 = 時系列順。タイムゾーンは JST 固定（`create-release.yml` の `TZ=Asia/Tokyo`）。

### 手動で Release を作る場合（代替経路）

GitHub → Releases → Draft a new release で任意タグを **target=main** で Publish すると、`release-deploy.yml` が `release: published` で起動して同様にデプロイされる。

## ロールバック

問題があれば Vercel Dashboard → Deployments → 直前の安定デプロイで **Instant Rollback**（1 click）。Instant Rollback は**過去の production デプロイが残っていること**が前提。後述の掃除で消しすぎると戻り先が無くなるため、直近数件は残す運用にする（消した場合でも過去タグから Create Release で再デプロイすれば戻せる）。

## デプロイ履歴の掃除（prune）

リリースごとに production デプロイが積み上がる。各デプロイ固有 URL（`deja-word-<hash>-...vercel.app`）は Deployment Protection(SSO) 下だが、削除するまで**無期限に残る**（Vercel は自動失効・個数上限なし）。リポジトリ公開後は GitHub Deployments 履歴から URL が列挙可能になるため、不要になった古いデプロイは削除して攻撃面と SSO 設定への依存を減らす。

**自動では消さない**（クリティカルなバグ時に Instant Rollback で戻せるよう履歴を残す）。掃除は `prune-deployments.yml` を**任意のタイミングで手動起動**して行う。

手順:

1. GitHub → **Actions** → 左の **Prune Vercel Deployments** → **Run workflow**
2. `keep` に**残す最新 production デプロイ件数**（current を含む・最小 1）を入力して実行
   - `keep=3`（既定）: current + 直近 2 件を Instant Rollback 用に残し、それ以前を削除
   - `keep=1`: current 1 件だけ残して全削除（攻撃面最小・Instant Rollback バッファ無し）
3. ログで削除件数を確認

挙動: production デプロイを新しい順に並べ、新しい方から `keep` 件を残して残りを `vercel remove <deploymentId>` で削除する。current（最新・本番 alias 付き）は常に保持されるため、公開入口（本番ドメイン）は影響を受けない。削除した URL は 404 になり、GitHub の Deployments レコードは履歴として残るがリンクは無効化される。

> Secret は release-deploy と共通（`VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`）。追加登録は不要。
