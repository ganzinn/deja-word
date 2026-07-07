# Round 3 — 2026-07-08 — skill: round-2 修正後（258e534 の SKILL.md）

| scenario | exec | mech-checks | judge-artifact | judge-hesitation | 完走 |
| --- | --- | --- | --- | --- | --- |
| s1-new-word-tags | 0 | PASS | PASS | PASS | ✓ |
| s2-continue-word-reminder | 0 | PASS | PASS | PASS | ✓ |
| s3-overturn-word-bookmark | 0 | PASS | PASS | PASS | ✓ |

cost: s1 $1.16 / s2 $2.22 / s3 $1.44。AskUserQuestion 0 件・permission_denials 0 件・全 run success。

**ループ用シナリオ全 pass → Phase 2（holdout）へ。**

round-2 で fail した s3 の「覆し履歴の書き場所」は、skill への明記（元トピックのみに残す）が効いた: 今回の成果物は `/bookmarks` を 01 の却下案・改訂履歴にのみ残し、ハブサマリ・各前提は現行結論だけになった（executor 自身が「the only remaining mention of `/bookmarks` is the intentional overturn history in 01」と grep 確認している）。

## 迷い記録（fail ではない残存観測）

- **委譲と自前調査の二重化が残存**（s2・s3）: round-1 で「委譲した調査と同じ対象を自分でも読み進めない」を skill に追記したが、挙動は完全には消えていない。s2 では待機手段の迷走（sleep ポーリング連鎖）も観測。完走への影響はなく、H 基準では PASS の範囲。skill 記述のさらなる強化は、機械判定できる fail が出ていない現状では過適合リスクの方が大きいため見送り（記録のみ）。
- 推奨案採用の判断はいずれも許可条項の範囲内で、無断決定の観測なし。
