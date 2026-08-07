---
name: worktree
description: git worktree の作成・撤去を scripts/wt-new.sh / wt-rm.sh で行う共通手順。機能開発・設計/計画/チケット実装スキル・手動作業を問わず、worktree を作る/消すときに参照する。
argument-hint: "[worktree名]"
---

# worktree

worktree はすべて `../deja-word-worktrees/<name>`（リポジトリ外）に置き、作成は `scripts/wt-new.sh`・撤去は `scripts/wt-rm.sh` で行う。手動 `git worktree add` はしない（env 供給・mise trust・置き場統一が漏れるため）。DB・発音音源の本体共有と drift 対処は AGENTS.md「Worktree」節を参照。

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
scripts/wt-new.sh quiz-timer                                            # 機能開発（feat/quiz-timer, main 起点）
scripts/wt-new.sh foo-design origin/main --branch docs/foo-design-plan --no-install  # ドキュメント作業
scripts/wt-new.sh foo-01-schema my-integration --branch feature/foo-01-schema        # チケット実装（統合ブランチ起点）
```

## 撤去

```sh
scripts/wt-rm.sh <name> [--delete-branch]
```

撤去のタイミングは呼び出し元の規約（各 SKILL.md など）に従う。`--delete-branch` はマージ済みブランチのみ削除できる（`git branch -d`）。squash マージ後など `-d` が通らないブランチは、`scripts/wt-rm.sh <name>` で worktree だけ撤去してから `git branch -D <branch>` で削除する。
