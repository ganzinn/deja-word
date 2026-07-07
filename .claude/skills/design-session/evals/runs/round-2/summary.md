# Round 2 — 2026-07-08 — skill: round-1 修正後（bd483d4 の SKILL.md）+ 修正後ハーネス

前史: 本ラウンドは 3 回目の試行。1 回目は permission 拒否 3 件で INFRA（`runs/round-2-infra/`）、2 回目は s2 シナリオの前提バグで eval 欠陥（`runs/round-2-eval-defect/`）。いずれもラウンド非消費とし、ハーネス修正（bypassPermissions 化）と s2 差し替え（word-memo → word-reminder）の後に全シナリオを再実行した。

| scenario | exec | mech-checks | judge-artifact | judge-hesitation | 完走 |
| --- | --- | --- | --- | --- | --- |
| s1-new-word-tags | 0 | PASS | 省略 | 省略 | （判定不要: ラウンド不成立） |
| s2-continue-word-reminder | 0 | PASS | 省略 | 省略 | （判定不要: ラウンド不成立） |
| s3-overturn-word-bookmark | 0 | FAIL (c1_hub_old_remains, c3_premise03_old_remains) | 省略 | 省略 | ✗ |

cost: s1 $0.92 / s2 $2.37 / s3 $1.63。AskUserQuestion 0 件・permission_denials 0 件・全 run success。
judge は s3 の機械 fail でラウンド不成立が確定したため本ラウンドでは省略（トークン節約。round 3 で全シナリオに実施する）。

## Fail 詳細

- **s3 c1_hub_old_remains / c3_premise03_old_remains**: 覆しの伝播自体は全ファイルで行われた（新決定はサマリ・01・03 前提・04 前提すべてに反映済み）。ただし旧決定の文字列 `/bookmarks` が、ハブのサマリ行と 03 の前提行に**改訂注記**（「2026-07-08 に `/bookmarks` から覆した」）として残った。
  - skill の哲学ではハブのサマリ = 結論のみ・「前提」= 現行決定のみで、覆しの経緯は決定元トピック（01 の却下案・改訂履歴）に残る。今回の成果物でも 01 には経緯が正しく残っており、サマリ・前提への注記は履歴情報の重複配置。
  - round-1 の s3 は同じ skill 記述で旧文字列を完全に除去しており、書き方が実行ごとに揺れる（skill が注記の置き場所を規定していないため）。

## 迷い記録

- （本ラウンド固有の新規観測なし。s3 の注記問題は「迷い」ではなく書き場所の規定欠如）

## 本ラウンドの修正方針（SKILL.md / templates のみ）

1. c1/c3 対応: 終了処理の「覆し」手順に、覆しの経緯・旧決定の値は決定元トピックにのみ残し、ハブのサマリと各ファイルの「前提」には現行の結論だけを書く（旧値・改訂注記を持ち込まない）ことを理由付きで明記する。check は凍結のまま変更しない。
