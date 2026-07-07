# Holdout（1 本目: complete-word-export）— 2026-07-08 — skill: round-2 修正後（258e534）

| scenario | exec | mech-checks | judge-artifact | judge-hesitation | 完走 |
| --- | --- | --- | --- | --- | --- |
| holdout-complete-word-export | 0 | PASS | **FAIL (A2)** | PASS | ✗ |

cost $2.21。AskUserQuestion 0 件・denials 0 件。機械判定（設計完了・実装への引き継ぎ・ticket-split 契約）と A1/A3/A4・H1〜H4 は全て pass。

## Fail 詳細

- **A2（ハブサマリの純度）**: サマリの 1 項目「CSV 数式インジェクションのサニタイズは**本人データ→本人閲覧のため**行わない」に採用理由（〜のため）が昇格した。
- 原因分析: SKILL.md の注意事項には「採用理由はトピックファイルに残す」とあるが、executor がセッション終了時に従う**終了処理の手順文**は「議論過程・却下案は昇格しない」とだけ書かれ「採用理由」が列挙から漏れていた。ループ用シナリオでは結論が肯定形（〜する）でありサマリに理由を書く誘因が弱く、この欠落が顕在化しなかった。「〜しない」型の決定は理由を添えたくなるため、holdout で初めて露出した（ループへの過適合というより、ループが触れなかった欠落）。

## 対処（Phase 2 の規定どおり）

1. skill 修正: 終了処理のサマリ昇格手順に「採用理由」を列挙へ追加し、理由を書きたくなった場合の逃がし先（→ [NN] リンク）を明記。
2. 新しい holdout を別の機能名 × 別モード組合せで作成: `holdout2-launch01-word-goal`（新規立ち上げ → そのまま 01 の議論に入り確定まで。既存 holdout とも全ループシナリオとも異なるモード遷移）。
3. s1〜s3 を再実行して全 pass を確認した上で、新 holdout を 1 回だけ実行する。

本 holdout（word-export）は再利用しない。設計完了セッション（実装への引き継ぎ・ticket-split 契約）の機械判定と A4 が pass した事実は本 run が証跡として残る。
