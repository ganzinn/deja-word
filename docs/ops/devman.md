# devman（worktree 並行開発の補助ツール・使う場合）

[devman](https://github.com/ganzinn/devman) は git worktree 内でのプロセス管理（Procfile 風）・タスク実行・ログ操作 MCP を束ねた個人ツール。**deja-word の開発に必須ではない**（AGENTS.md には常設しない）。worktree 並行開発（ticket-implement 工程など）で使うと、dev サーバの worktree 間切替とタスクログの参照が定型化できる。

設定はすべて `~/.config/devman/config.yml`（repo 外・個人設定）にあり、リポジトリには devman 固有のファイルをコミットしない。ログ出力先 `log/` だけが gitignore 済み。

## セットアップ（再現手順）

1. devman を導入する（`go install github.com/ganzinn/devman/cmd/devman@latest` または release バイナリ＋`devman update`）
2. `~/.config/devman/config.yml` に deja-word エントリを追加する（`devman init` でキーを確認できる）:

```yaml
repos:
  github.com/ganzinn/deja-word:
    log_dir: log
    exec_wrapper: ["mise", "exec", "--"]
    # worktree に .env / .env.test を供給（既存は保持、DEV_BLOB_ROOT を保証）
    setup:
      - "./scripts/wt-env.sh ."
    processes:
      web:
        cmd: "pnpm dev -p {{.PortBase}}"
    tasks:
      lint: "pnpm lint"
      typecheck: "pnpm typecheck"
      format: "pnpm format"
      "format:check": "pnpm format:check"
      "test:unit": "pnpm test:unit"
      "test:integration": "pnpm test:integration"
      "db:migrate": "pnpm db:migrate"
      "db:seed": "pnpm db:seed"
```

3. Claude Code の MCP 登録（user スコープ。worktree ディレクトリで開いたセッションでもログ操作ツールが使えるように）:

```sh
claude mcp add --scope user devman -- devman mcp
```

4. mise の trust プロンプト対策: worktree を新規作成するたびに `.mise.toml` が未信頼になるため、グローバル設定（`~/.config/mise/config.toml`）で置き場ごと信頼しておく:

```toml
[settings]
trusted_config_paths = ["~/rep/github.com/ganzinn/"]
```

これを設定しない場合は worktree ごとに `mise trust` が必要（`scripts/wt-new.sh` は実行してくれるが、手動 `git worktree add` では忘れやすい）。

## 運用

### worktree の認識

devman は `<worktree>` 引数を **git worktree のディレクトリ basename** で解決する。置き場はどこでもよい（`../deja-word-<name>` でも `../deja-word-worktrees/<機能名>-NN-<チケット名>` でも可）。basename が重複すると ambiguous エラーになる。

### dev サーバ（1 つを worktree 間で切替）

**サーバは repo につき同時 1 つ**（devman の仕様: 新しい `devman server` が先行サーバを停止してから起動する）。並列に dev サーバは張れないため、動作確認したい worktree へ切替える運用になる:

```sh
devman server -b <worktree>   # 旧サーバを停止し、指定 worktree で起動（バックグラウンド）
devman server -b              # 本体（メイン worktree）に戻す
devman server stop            # 停止
```

起動前に `setup:` が走り、`scripts/wt-env.sh` が worktree へ `.env` / `.env.test` を供給する（既存ファイルは保持、`DEV_BLOB_ROOT` は本体 `.dev-blob` 共有に保証される）。

**ポートは 3000 固定**（`--port-base` 既定値）。サーバが同時 1 つなので衝突せず、`BETTER_AUTH_URL` の上書きも不要。2 つの dev を同時に見比べたい例外時のみ、devman を使わず手動で `PORT=3001 pnpm dev` ＋ `BETTER_AUTH_URL` 上書き（AGENTS.md の Worktree 節を参照）。

### タスク実行とログ

タスクは並行安全なものなら worktree ごとに同時実行できる:

```sh
devman run <worktree> typecheck     # worktree でタスク実行（mise exec 経由）
devman tasks                        # タスク一覧
devman logs                         # 直近サーバのログ一覧
devman logs <worktree> web -f       # プロセスログを follow
```

**`log/` に残るのは `devman server` のプロセスログのみ**（`server.log` / `web.log`）。`devman run` のタスク出力は stdout に流れ、ファイルには残らない（devman v0.1.0 時点）。Claude Code からは MCP ツール（`list_logs` / `tail_log` / `search_log` / `truncate_log`）でサーバログを参照できる。

## 注意

- **DB は単一 `dejaword` を共有**するため、migration を伴うチケットは並行させず直列依存にする（ticket-split 時の考慮事項。AGENTS.md の drift 注意と同根）。`devman run <worktree> db:migrate` は「アクティブに使う worktree を切替えた直後」にのみ実行する
- `pnpm test:integration` は共有 DB `dejaword_test` を TRUNCATE するため**並行実行不可**（ticket-implement の検証分担どおり直列で）
- `setup:` は `devman server` 起動時のみ実行される。`devman run` しかしない worktree に `.env` が要る場合は `scripts/wt-env.sh <worktree-dir>` を手動実行する
