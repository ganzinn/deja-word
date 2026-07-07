# Holdout（2 本目: launch01-word-goal）— 2026-07-08 — skill: holdout1 fail 修正後

| scenario | exec | mech-checks | judge-artifact | judge-hesitation | 完走 |
| --- | --- | --- | --- | --- | --- |
| holdout2-launch01-word-goal | 0 | **FAIL (c4_adoption_reason)** | 省略（機械 fail で不成立確定） | 省略 | ✗ |

cost $2.06。AskUserQuestion 0 件・denials 0 件。c4_adoption_reason 以外の機械判定（立ち上げ + 01 確定 + 前提再掲 + 推奨 02 + コミット + スコープ）は全て pass。

## Fail 詳細

- **c4_adoption_reason**: 01 の決定 7 件に「決定 N:」見出しと「却下案」ラベルはあるが、採用理由が「採用理由:」ラベルなしの地の文として決定本文に溶け込み、決定セクションに「採用」の文字列が存在しない。
- 原因分析: 継続系シナリオ（s2/s3/holdout1）では fixture 内の既存決定がラベル付き（採用理由: / 却下した代替案:）の手本になり文体が揃っていた。holdout2 は**新規立ち上げのため手本となる既存決定が存在せず**、SKILL.md の「採用理由と却下案も必ず残す」だけではラベル形式が規定されないため文体が漂流した。round-1 で観測した「形式の明示不足」と同クラスで、ループシナリオが（fixture の手本により）触れられなかった欠落。

## 対処（Phase 2 の規定どおり）

1. skill 修正: 決定の記録手順にラベル付き形式（採用理由: / 却下した代替案:）を明記し、topic テンプレートのプレースホルダにも形式を記載する。
2. 新しい holdout を別の機能名 × 別モード組合せで作成: `holdout3-complete-word-archive`（設計完了セッション。holdout2 の「新規立ち上げ→01」とは別モード。機能 archive は src/prisma と衝突しないことを grep で確認済み）。
3. s1〜s3 を再実行して全 pass を確認した上で、新 holdout を 1 回だけ実行する。**holdout3 も fail した場合は再挑戦を打ち切り、skill の分割・前提見直しを提案して停止する。**
