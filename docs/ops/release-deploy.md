# Release Deploy（リリースタグ運用）

production への反映は **GitHub Release の Publish** をトリガに、GitHub Actions（`.github/workflows/release-deploy.yml`）が Vercel CLI でデプロイする。`main` へのマージ自体ではデプロイされない。

## 背景

Vercel の Git Integration は **ブランチベース** で、git タグや GitHub Release を直接トリガにできない（production = production branch への merge）。そのため:

- `vercel.ts` の `git.deploymentEnabled` を **全ブランチ false** にして Git push 起点の自動デプロイを停止
- production デプロイは GitHub Release(Publish) → Actions → `vercel deploy --prod` で実行

ビルドは `--prebuilt` を使わず **リモートビルド**（ソースを Vercel にアップロードして Vercel 側でビルド）。これにより Sensitive な `BETTER_AUTH_SECRET` や Neon Integration の env が Vercel 側で揃い、`vercel-build`（`prisma migrate deploy && next build`）が従来の main-merge デプロイと同一に走る。

## 初期セットアップ（一度だけ）

GitHub リポジトリの Settings → Secrets and variables → Actions に以下を登録する。

| Secret | 取得元 |
|---|---|
| `VERCEL_TOKEN` | Vercel Account Settings → Tokens で発行 |
| `VERCEL_ORG_ID` | `vercel link` 後の `.vercel/project.json` の `orgId` |
| `VERCEL_PROJECT_ID` | 同 `.vercel/project.json` の `projectId` |

ID の確認手順（ローカル）:

```sh
npx vercel login
npx vercel link        # 既存の deja-word プロジェクトを選択
cat .vercel/project.json   # orgId / projectId を確認
```

`.vercel/` は `.gitignore` 済み。commit しないこと。

## リリース手順

1. 変更を `main` に merge する（この時点ではデプロイされない）
2. GitHub → Releases → **Draft a new release**
   - タグ `vX.Y.Z`（SemVer）を **target=main** で新規作成
   - リリースノートを記入
   - **Publish release**
3. `release-deploy.yml` が起動 → lint / typecheck / test:unit → `vercel deploy --prod` で production 反映
4. Actions のログとデプロイ URL で反映を確認

> リリースタグは **必ず main にマージ済みの commit** に付ける。前段の lint/typecheck/test はあくまで保険。

## ロールバック

問題があれば Vercel Dashboard → Deployments → 直前の安定デプロイで **Instant Rollback**（1 click）。
