---
name: worktree
description: git worktree の作成・撤去を scripts/wt-new.sh / wt-rm.sh で行う共通手順。機能開発・設計/計画/チケット実装スキル・手動作業を問わず、worktree を作る/消すときに参照する。
argument-hint: "[worktree名]"
---

# worktree

worktree はすべて `../deja-word-worktrees/<name>`（リポジトリ外）に置き、作成は `scripts/wt-new.sh`・撤去は `scripts/wt-rm.sh` で行う。手動 `git worktree add` はしない（env 供給・mise trust・置き場統一が漏れるため）。両スクリプトは worktree 内から実行してもよい（パスは本体基準で解決される）。DB・発音音源の本体共有と drift 対処は AGENTS.md「Worktree」節を参照。

## 作成

```sh
scripts/wt-new.sh <name> [base-branch] [--branch <branch>] [--no-install]
```

- `<name>`: ディレクトリ名（`../deja-word-worktrees/<name>` になる）
- `[base-branch]`: 新規ブランチの起点（既定 `main`）。`origin/*` を指定すると自動で `git fetch` する（本体の checkout を動かさず最新 main 起点にしたいとき）
- `--branch <branch>`: ブランチ名の明示（既定 `feat/<name>`）。**既存ブランチなら base を無視してそのブランチを checkout する**（継続作業。別 worktree で checkout 済みなら git がエラーにする）
- `--no-install`: `pnpm install` を省略（ドキュメント作業のみの worktree 用。コードの実行・検証が必要になったら worktree 内で `pnpm install` する）

セットアップ内容（env 供給・mise trust・install）はスクリプト冒頭のコメントを参照。途中で失敗しても作成済み worktree は残るので、検査してから撤去する。

代表的な組み合わせ:

```sh
scripts/wt-new.sh quiz-timer                                            # 単発の作業（feat/quiz-timer, main 起点）
scripts/wt-new.sh foo origin/main --branch docs/foo-design-plan --no-install   # 機能の起点 worktree（設計フェーズ開始）
scripts/wt-new.sh foo-01-schema feature/foo --branch feature/foo-01-schema     # チケット実装（統合ブランチ起点）
```

## 機能開発の命名族とライフサイクル

機能開発パイプライン（design-session → ticket-split → ticket-implement → feature-close）の worktree は、機能名を prefix にした命名族で運用する。並行開発する機能の見分けと、機能単位の一括掃除のための共通定義:

| worktree | ブランチ | ライフサイクル |
| --- | --- | --- |
| 起点 `<機能名>` | `docs/<機能名>-design-plan` →（実装フェーズ移行時）`feature/<機能名>` →（統合 PR マージ後）`chore/<機能名>-cleanup` | 設計開始〜クローズ完了までフェーズ横断で保持する。フェーズはこの worktree 内のブランチ切替で進む |
| チケット `<機能名>-NN-<チケット名>` | `feature/<機能名>-NN-<チケット名>` | 統合ブランチ起点。マージ成功時に即削除する（検査用に残した失敗分と区別するため） |
| 臨時 `<機能名>-plan-update` | `docs/<機能名>-plan-update` | main 起点の計画見直し専用。PR マージ後に撤去する |

- 進行状態は「checkout 中のブランチ＋PR の状態」で判断する（worktree の存在の有無をフェーズ状態とみなさない）
- **フェーズ移行は起点 worktree 内でのブランチ切替**で行う（worktree を作り直さない）。前フェーズの PR がマージ済みなら、次フェーズのブランチは `origin/main` から作る:

  ```sh
  git fetch origin main
  git switch -c <次フェーズのブランチ> origin/main   # 既存ブランチへ戻る場合は -c を外す
  ```

  実装フェーズの統合ブランチだけは ticket-implement の実装フロー（分岐元は設計＋計画 PR の有無で決まる。以降 main を取り込まない）に従う
- 起点 worktree を `--no-install` で作った場合は、実装フェーズ移行時に worktree 内で `pnpm install` を実行する（設計期間が長く `node_modules` が陳腐化した場合も同様）
- 並行開発の同時機能数は、共有 DB・dev サーバ 1 つずつの運用・worktree ごとの `node_modules` のディスクコストが実質の上限になる

## 撤去

```sh
scripts/wt-rm.sh <name> [--delete-branch]
```

撤去のタイミングは呼び出し元の規約（各 SKILL.md など）に従う。`--delete-branch` は `git branch -d` のため、取り込み済みと判定できるブランチしか削除できない。squash マージで取り込んだブランチ（ticket-implement のチケットブランチ）や、統合 PR がマージ済みでも本体の main を更新していない段階のブランチは `-d` が通らない。その場合は `scripts/wt-rm.sh <name>` で worktree だけ撤去してから `git branch -D <branch>` で削除する。

撤去対象の worktree 自身の中から実行すると、撤去は成功するが自分の cwd が消えた状態になり以降のコマンドが失敗する。撤去は必ず対象の外から実行する。

### 機能完了時の一括撤去（クローズ PR マージ後）

feature-close スキルの終端で実行する。起点 worktree の撤去は本体から実行し、本体の main を先に最新化しておく（取り込み済みと判定でき `-d` が通るようになる）:

```sh
git pull --ff-only                         # 本体で実行。クローズ PR のマージを取り込む
git worktree list | grep <機能名>          # 残存の確認（起点＋残存するチケット・plan-update worktree）
scripts/wt-rm.sh <機能名>                  # 起点 worktree の撤去（残存 worktree も検査後に同様に撤去）
git branch -d chore/<機能名>-cleanup feature/<機能名> docs/<機能名>-design-plan   # ローカルブランチの削除（残存していれば docs/<機能名>-plan-update・feature/<機能名>-NN-* も。`-d` が通らないものは `-D`）
```
