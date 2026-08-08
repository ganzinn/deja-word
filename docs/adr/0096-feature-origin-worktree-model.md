# ADR-0096: 機能開発は起点 worktree モデルで行い、チケット単位 PR モードを廃止する

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-08-08

## 背景

機能開発パイプライン（design-session → ticket-split → ticket-implement）は随所で本体の checkout（メイン worktree）を前提にしていた。特に ticket-implement は本体でしか起動できず、実装中は本体の checkout を統合ブランチへ切り替えて専有するため、その間ほかの機能の設計・実装・調査の足枷になっていた。また設計〜計画はフェーズごとの worktree（`<機能名>-design` / `<機能名>-plan-update`）を作成・撤去する運用で、「worktree の存在＝フェーズ状態」とみなす残骸検出・撤去ロジックが各スキルに分散していた（issue #242）。

## 決定内容

1. **機能ごとにフェーズ横断の起点 worktree `../deja-word-worktrees/<機能名>` を作り、設計開始〜実装完了まで保持する**。フェーズは worktree 内のブランチ切替（`docs/<機能名>-design-plan` →〔設計＋計画 PR マージ後〕`feature/<機能名>`）で進める。フェーズごとの worktree の作成・撤去はやめる
2. **本体の checkout は常に main のまま保つ**。main の参照が必要な操作は `git fetch origin main`＋`origin/main` で行い、起点 worktree から main を checkout しない
3. **進行状態の正は「checkout 中のブランチ＋PR の状態」に一本化する**。worktree の存在をフェーズ状態とみなす残骸検出・撤去ロジックは廃止する。チケット worktree（`<機能名>-NN-<チケット名>`）のマージ成功時の即削除は維持し（検査用に残した失敗分との区別）、機能完了時に起点＋残存物を機能名 prefix で一括撤去する（起点自身の撤去は自分の cwd を消すことになるため本体側から行う）
4. **チケット単位 PR モード（ticket-implement の `--pr`）を廃止する**。チケット単位のレビュー粒度が必要になった場合は GitHub の stacked pull request（統合ブランチへ base を向けたチケット PR の連鎖）で代替する前提とし、専用モードは持たない（stacked PR は GitHub 標準では手動運用のため、代替手順の具体化は必要になった時点で行う）
5. `scripts/wt-new.sh` / `wt-rm.sh` のパス解決を `git rev-parse --path-format=absolute --git-common-dir` の親（= 本体 root。`scripts/wt-env.sh` と同方式）に置き換え、**worktree 内からの実行を正式サポートする**（起点 worktree のセッションがチケット worktree を作成・撤去するため）

## 採らなかった代替案

- **フェーズごとの worktree の維持** — 「worktree の存在＝フェーズ状態」の前提が残骸検出・撤去ロジックを各スキルに分散させ、design worktree 内から起動すると自分の足場を消す自己撤去ハザードも抱えていた。起点 worktree の保持方式ではパイプライン途中の撤去自体が無くなり、ハザードは機能完了時の「最後の 1 回」（本体側から実行）に局所化される
- **チケット単位 PR モードの維持** — 起点 worktree から main へステータスコミットできない（main を checkout するのは本体だけ）ため、PR モードの「ステータス更新を main へ直接コミットする」運用が成立しない。利用実績も乏しく、stacked PR での代替を前提に廃止した

## 影響

- どの機能のどのフェーズが進行中でも、本体と他機能の作業を妨げない（複数機能の並行開発が可能になる）
- 並行しても直列のまま残る制約: `pnpm test:integration`（共有 `dejaword_test` を TRUNCATE するため同時に 1 箇所のみ）と、共有 dev DB `dejaword` への migration 適用（実装中は worktree から適用しない。手動確認時にアクティブな checkout で `pnpm db:migrate`）。dev サーバも 1 つずつの運用のまま
- 並行開発の同時機能数はスキル側で制限せず、共有 DB・dev サーバ・worktree ごとの `node_modules` のコストが実質上限になる
- 旧モデルで進行中の機能の移行: 対象ブランチ（統合ブランチ・`docs/<機能名>-design-plan`）を本体の checkout や旧命名 worktree（`<機能名>-design` 等）が保持したままでは起点 worktree を作れない（checkout 済みブランチとして git がエラーにする）。本体を main へ戻し、旧命名 worktree を撤去してから起点 worktree を作れば、統合ブランチと plan ハブの状態はそのまま新フローの再開判定に乗る

## 根拠（コード・コミット・文書参照）

- issue #242（要求・決定方針・調査メモの一次記録）
- `.claude/skills/worktree/SKILL.md`「機能開発の命名族とライフサイクル」（共通定義の実体）
- `scripts/wt-new.sh` / `scripts/wt-rm.sh`（パス解決の git-common-dir 方式）
- [ADR-0091](0091-worktree-unified-creation.md) — worktree 作成の wt-new.sh 一本化（本 ADR の前提。置き場・作成手順は 0091 のまま）
