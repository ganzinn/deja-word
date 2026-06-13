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

> `GITHUB_TOKEN` で作成した Release は `release: published` を**再発火しない**（GitHub の無限ループ防止仕様）。そのため `create-release.yml` は `release-deploy.yml` を `workflow_call` で直接呼び出してデプロイをつなぐ。

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

問題があれば Vercel Dashboard → Deployments → 直前の安定デプロイで **Instant Rollback**（1 click）。
