# GitHub リポジトリ設定（コードに残らない設定の記録）

GitHub の Web UI / API でのみ管理される設定の**期待状態**を記録する。設定が消えた・変わったときはこのドキュメントとの差分をドリフトとして検知し、記載の手順で復旧する。

> Actions の Secrets（`VERCEL_TOKEN` 等）は [release-deploy.md](release-deploy.md#初期セットアップ一度だけ) を参照。

## Ruleset: `protect-main`（main への直接 push 禁止）

`main` への変更を PR 経由に限定する branch ruleset。作業ディレクトリが main のまま誤って直接 push した事故（[#149](https://github.com/ganzinn/deja-word/issues/149)）の再発防止として 2026-08-01 に設定した。

設定場所: Settings → Rules → Rulesets → `protect-main`

### 期待状態

| 項目 | 値 | 理由 |
|---|---|---|
| Enforcement status | `Active` | |
| Bypass list | **空（bypass なし）** | 防ぎたい相手が管理者自身の誤 push なので、管理者にも完全適用する |
| Target branches | Default branch (`main`) | |
| Restrict deletions | 有効 | |
| Block force pushes | 有効 | |
| Require a pull request before merging | 有効 | 直接 push をブロックする本体 |
| └ Required approvals | `0` | ソロ開発のため。1 以上にすると自分の PR を approve できずマージ不能になる |

- タグ作成はブロックされない（対象は branch のみ）。`create-release.yml` はタグと Release を作るだけで main へ push しないため影響なし
- 緊急で直接 push が必要な場合は Enforcement status を一時的に `Disabled` にし、作業後に必ず `Active` へ戻す

### 確認コマンド

```sh
gh api repos/ganzinn/deja-word/rulesets                  # 一覧（id を確認）
gh api repos/ganzinn/deja-word/rulesets/<id>             # 詳細
```

### 復旧手順（ruleset が消えた場合）

以下の JSON をそのまま流し込めば再作成できる。

```sh
gh api repos/ganzinn/deja-word/rulesets --method POST --input - <<'EOF'
{
  "name": "protect-main",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": {
    "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "required_reviewers": [],
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["merge", "squash", "rebase"]
      }
    }
  ]
}
EOF
```

再作成後の動作確認:

```sh
git switch main
git commit --allow-empty -m "test: direct push should be rejected"
git push   # push declined due to repository rule violations で弾かれれば OK
git reset --hard origin/main
```
