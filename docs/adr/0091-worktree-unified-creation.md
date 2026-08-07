# ADR-0091: worktree 作成を wt-new.sh に一本化し、置き場を ../deja-word-worktrees/ に統一する（ADR-0054 の部分置き換え）

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-08-07

## 背景

ADR-0054 で worktree の作成・撤去を `scripts/wt-new.sh` / `wt-rm.sh` に定型化した（branch `feat/<name>`、dir `../deja-word-<name>`）。その後、design-session / ticket-split / ticket-implement のスキル管理 worktree は `../deja-word-worktrees/` 配下に置く別系統となり、手動 `git worktree add` → `wt-env.sh` → `mise trust` → `pnpm install` の手順テキストを AGENTS.md「スキル管理 worktree」節に集約して運用していた（PR #231）。

手動 add を選んでいた理由は「ブランチ名を規約どおりに制御する」「失敗時に worktree を残して検査する」だったが、前者はスクリプトのパラメータ化で、後者は `set -e` の性質（途中失敗でも作成済み worktree は残る）で両立できる。2 系統の並存は手順テキストの重複と置き場の分裂を残すだけになっていた（issue #233）。

## 決定内容

1. **worktree の作成は用途を問わず `scripts/wt-new.sh` に一本化する**。そのための拡張: `--branch <branch>`（ブランチ名の自由化。既定 `feat/<name>`）、既存ブランチの checkout モード（`-b` なしの `git worktree add`。design-session のシリーズ継続で必要）、`--no-install`（ドキュメント作業のみの worktree 用に `mise trust`・`pnpm install` を省略）、base `origin/*` 指定時の自動 `git fetch`（本体の checkout を動かさず最新 main 起点にするため）
2. **置き場を `../deja-word-worktrees/<name>` に統一し、`wt-rm.sh` も追随する**（ADR-0054 決定のうち dir `../deja-word-<name>` を本 ADR で置き換える。DB・`.dev-blob` の本体共有、`node_modules` 等の独立、drift 対処はそのまま維持する）
3. **作成・撤去の方法は共通スキル `.claude/skills/worktree/` に記述する**。各スキル（design-session / ticket-split / ticket-implement）はブランチ名・ディレクトリ名・起点・撤去タイミングの宣言と wt-new.sh の呼び出し行だけを持つ（スキル記述規約 2「実体は一次置き場、スキルは参照」）。AGENTS.md「スキル管理 worktree」節は廃止し Worktree 節へ統合する
4. mise の trust は置き場の親 `../deja-word-worktrees/` の信頼 1 つに集約できる（`docs/ops/devman.md`）

## 採らなかった代替案

- **2 系統の維持** — 手動 add の 2 つの理由（背景参照）はどちらも wt-new.sh 側で満たせるため、残るのは手順テキストの重複だけ
- **置き場を従来の `../deja-word-<name>` 側に統一** — 兄弟ディレクトリに worktree が散らばり、mise / Claude Code の trust をディレクトリ単位で集約できない。`../deja-word-worktrees/` なら親 1 つの信頼で全 worktree をカバーできる

## 影響

- devman は worktree をディレクトリ basename で解決するため置き場統一の影響はない（`docs/ops/devman.md` の記載のみ更新）
- 旧置き場 `../deja-word-<name>` の worktree が残っている環境では、撤去して wt-new.sh で作り直す（`git worktree move` でも可だが、作り直しの方が env 供給まで揃う）
- `wt-rm.sh` の `--delete-branch` は `git branch -d`（マージ済みのみ）のまま。squash マージ後の削除手順は worktree スキルに記載

## 根拠（コード・コミット・文書参照）

- issue #233（意図・対応案の一次記録）
- `scripts/wt-new.sh` / `scripts/wt-rm.sh` / `.claude/skills/worktree/SKILL.md`
- [ADR-0054](0054-worktree-shared-db-blob.md) — 置き換え元（DB・blob 共有は維持）
