# ADR-0009: onDelete は Cascade 既定 + SetNull 2箇所の意図的例外

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

親エンティティ削除時の子データの扱いを統一する必要があった。単語が消えればその履歴・意味・例文は意味を失う一方、参照的なリンクは親が消えても残す価値がある。

## 決定内容

- FK の `onDelete` は **Cascade を既定**とする
- 例外として以下の 2 箇所のみ **SetNull** を使う。これは意図的な逸脱であり、「Cascade への『修正』をしない」と規約に明記されている:
  1. `RelatedWord.linkedWordId` — リンク先単語が消えても関連語自体（term 文字列）は残す
  2. `QuizDefaultSetting.occurrenceId` — 掲載箇所削除時は掲載箇所だけ未設定へ戻す（range / format のデフォルトは残す）。従属関係が Cascade の前提と逆であるため

## 採らなかった代替案

- 2 箇所も Cascade に統一 — 設定行や関連語行ごと消えてしまい、ユーザーの他の設定・入力まで巻き添えになるため却下（`docs/design/word-quiz/02-data-model.md` が「既存規約の Cascade からの意図的な逸脱」として理由を記録）

## 影響

- schema を見て SetNull を「規約違反」と誤認して Cascade に直すことが最大のリスク。`prisma/CLAUDE.md` が明示的に禁止している
- Blob（音源ファイル）は DB の cascade 外のため、削除はアプリ / ops 側のベストエフォートで行う（[ADR-0044](0044-blob-best-effort-delete.md)）

## 根拠（コード・コミット・文書参照）

- `prisma/CLAUDE.md` — Cascade 既定と SetNull 2 箇所の意図的例外（修正禁止の明記）
- `prisma/schema.prisma:235` — `linkedWord ... onDelete: SetNull`
- `prisma/schema.prisma:409` — `occurrence ... onDelete: SetNull`（直前コメントに理由）
- `docs/design/word-quiz/02-data-model.md` — QuizDefaultSetting の SetNull の採用理由
