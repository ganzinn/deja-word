# ADR-0041: DRILL_RETRY — 残数・roundCount に影響しない再演習

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

drill のラウンド直後に「同じ問題でもう一度確かめたい」という要求があった。ただし再演習の結果で残数が動くと、定着判定（[ADR-0036](0036-drill-remaining-count-model.md)）が意図せず進んだり戻ったりする。

## 決定内容

- 「同じ問題で再テスト」を **QuizMode.DRILL_RETRY** として追加する
- **残数・roundCount・completedAt は一切変更しない**（不変条件としてコミットに明記）。履歴は `mode = DRILL_RETRY` の QuizAnswer として残す

## 採らなかった代替案

本 ADR に記録した却下案:

- **ラウンドメンバーシップの永続化**（再演習用に問題保存）— 却下
- **mode = DRILL の再利用** — 却下（本番ラウンドと区別できず残数計算を汚染する）
- **retry でも残数に影響させる** — 却下

## 影響

- QuizMode が TEST / DRILL / DRILL_RETRY の 3 値になり、履歴集計時に mode の区別が必要
- CAS（[ADR-0033](0033-drill-round-count-cas.md)）は DRILL_RETRY では発動しない（roundCount を進めないため）

## 根拠（コード・コミット・文書参照）

- commit `2f925c8` "feat: 定着モードに「同じ問題で再テスト」（drill retry）を追加"（PR #87）
- drill retry の決定（元 design ドキュメントは実装完了に伴い削除。本 ADR が一次情報）
- `src/lib/drill-retry-generate.ts` / `src/lib/drill-retry-submit.ts`
- `prisma/schema.prisma` — QuizMode enum
