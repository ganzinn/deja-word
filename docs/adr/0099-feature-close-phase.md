# ADR-0099: 機能開発パイプラインにクローズ工程を新設し、ADR 引き継ぎを工程の担当に割り当てる（0096 追補）

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-08-15

## 背景

`docs/adr/README.md` は「`docs/design/` は実装済みの設計文書を削除していく運用のため、design/ 由来の決定は該当 ADR が長期の引き継ぎ先になる」と定め、AGENTS.md は「新しい判断をしたら ADR を起票する」と定めているが、機能開発パイプライン（design-session → ticket-split → ticket-implement）のどのスキルもそれを手順に落としていなかった。結果として次の 3 つが欠けていた（issue #263）。

- **「ADR が要るか」を問う手順がどこにも無い**。起票の実績はいずれも設計時に人が気づいた結果で、仕組みではない
- **統合 PR マージ後の作業に実行主体がいない**。ticket-implement のセッションは PR を作った時点で終わるため、設計・計画ドキュメントの削除や worktree の撤去は構造的に実行できない
- **起点 worktree の寿命がクローズ工程を含んでいない**。ticket-implement が統合 PR マージ後の撤去を案内していたため、クローズ作業のたびに worktree を作り直すことになる（word-create-from-search で実際に踏んだ）

## 決定内容

1. **パイプラインに 4 つ目の工程 feature-close を新設する**。統合 PR マージ後に起動し、(a) 設計・計画の全ファイルからの決定の棚卸しと ADR 引き継ぎの再確認、(b) 未起票分の起票、(c) `docs/design/<機能名>/` と `docs/plan/<機能名>/` を削除する PR の作成、(d) マージ後の起点 worktree・関連ブランチの一括撤去、を担う。(d) がパイプライン全体の終端になる。

2. **ADR 要否の判定は工程ごとに担当を割り当てる**: design-session が**決定時**に判定して設計ハブの「ADR 引き継ぎ候補」に残す（決定が最も新鮮で、却下案が手元にある場所）→ ticket-split が終端のドキュメントチケット（`NN-docs-and-adr`）に落とす → ticket-implement は通常のチケットとして実装エージェントに書かせる（**ADR が実装と同じ PR で main に入る**）→ feature-close が削除前の安全網として再確認する。

3. **判定基準は `docs/adr/README.md`「ADR に書く判断の線引き」に一元化し、各スキルからは参照する**。ADR に残すのは「なぜかがコードから復元できない」かつ「影響が対象機能の外へ及ぶ / 前例になる」判断で、実装の形そのものが答えになるもの・既存規約の適用・現状維持・期限付きの見送り・既存 ADR への例外はコードまたは既存の受け皿で足りる、という線引き。

4. **起点 worktree の寿命をクローズ完了まで延ばす（[ADR-0096](0096-feature-origin-worktree-model.md) 決定 1・3 の追補）**。フェーズのブランチ切替に `chore/<機能名>-cleanup` を加え、`docs/<機能名>-design-plan` → `feature/<機能名>` → `chore/<機能名>-cleanup` の 3 段にする。ticket-implement は最終報告で撤去を案内せず、feature-close へ誘導する。

5. **ADR 起票は実装 PR、ドキュメント削除はクローズ PR と分ける**。起票は実装と同じ PR に含め、削除だけを別 PR にする。

## 採らなかった代替案

- **ADR 起票もクローズ PR にまとめる** — 決定と実装が別 PR・別タイミングで main に入り、実装 PR のレビュー時に決定の記録が無い状態になる。既存実績（word-view-nav）も実装 PR 内での起票。
- **設計・計画ドキュメントの削除も実装 PR に含める** — レビュー中・不具合対応中に設計書を参照できなくなり（git 履歴には残るが実質のコストがある）、実装 diff にドキュメント削除が混ざってノイズになる。
- **クローズ工程を ticket-implement の末尾に足す** — 統合 PR のマージ後に走る作業であり、PR 作成で終わるセッションからは構造的に実行できない。
- **ADR 要否の判定を ticket-split に置く** — 決定から時間が空き、却下案の温度感が落ちる。判定のために設計トピックを読み直すコストも増える（ticket-split はハブだけで開始する設計）。
- **判定基準を各スキルの本文に書く** — design-session・feature-close の 2 か所以上で重複し、更新のたびに乖離する。

## 影響

- ticket-implement の最終報告から「起点 worktree・関連ブランチの一括撤去」の案内が消え、`/feature-close <機能名>` の誘導に変わる。
- 設計ハブに「ADR 引き継ぎ候補」節が増える（テンプレート更新済み）。候補ゼロの機能でも「判定した上で無し」と明記する。
- 機能あたりのドキュメント削除 PR が 1 本増える。レビュー対象は削除差分と、PR 本文に書く「何を ADR に移し、何はコードで足りるとしたか」の分類。
- 設計判断の受け皿が明文化されたことで、ADR は「機能実装のたびに増えうるもの」になる。増やしすぎを防ぐのは決定 3 の線引き。

## 根拠（コード・文書参照）

- issue #263 — 欠落の一次記録と工程別担当の提案、および最初の適用（word-create-from-search）の実フロー記録
- PR [#264](https://github.com/ganzinn/deja-word/pull/264) — 最初の適用例。判断基準の言語化はここが初出
- `.claude/skills/feature-close/SKILL.md` — クローズ工程の手順（実体）
- `.claude/skills/design-session/SKILL.md`（トピック終了処理の ADR 要否判定）/ `templates/hub.md`（「ADR 引き継ぎ候補」節）
- `.claude/skills/ticket-split/SKILL.md`（終端ドキュメントチケット・ADR 起票チケットの記載ルール）/ `.claude/skills/ticket-implement/SKILL.md`（最終報告の誘導先）
- `.claude/skills/worktree/SKILL.md`（フェーズ移行・クローズ完了時の一括撤去）
- `docs/adr/README.md`「ADR に書く判断の線引き」— 決定 3 の実体
- [ADR-0096](0096-feature-origin-worktree-model.md) — 起点 worktree モデル。本 ADR が寿命とフェーズ構成を追補する
- [ADR-0098](0098-word-create-from-search-link.md) — クローズ工程の手順で起票した最初の ADR
