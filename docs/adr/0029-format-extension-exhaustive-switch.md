# ADR-0029: 形式拡張は enum + 形式別 generator + discriminated union + exhaustive switch

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

出題形式（QuizFormat、現在 10 形式）は継続的に追加される。追加時の変更箇所を型システムで漏れなく検出できる拡張点の設計が必要だった。

## 決定内容

- 形式追加の拡張点を「**QuizFormat enum + 形式別 generator ファイル + discriminated union の payload + exhaustive switch（`never` チェック）**」の組で構成する
- switch は `build-quiz.ts`（生成）と `quiz-flow.tsx`（表示）にあり、enum 追加でコンパイルエラーになり変更漏れを検出する
- 形式追加のチェックリスト（enum → generator → payload union → format-options → timeoutByFormat → question コンポーネント → backfill migration）を `src/lib/quiz/CLAUDE.md` に置く

## 採らなかった代替案

- **registry（Map ベースの動的登録）** — 却下（quiz-05 決定 6 の却下案。静的な網羅性チェックが利かない）
- **非 discriminated な共通 payload 型** — 却下（同上）

## 影響

- TG 形式追加（formats 7–10、2026-07-03/04）でこの拡張点が実運用された。ただし「素材型は将来形式でも無変更」という当初予測は TG 例文が新しい素材フィールドを要したことで部分的に破れ、その旨が設計に追記されている（quiz-05 決定 6 の 2026-07-03/04 追記）— 予測の破れも含めて記録されている点に注意
- 形式追加には推奨デフォルトの backfill migration が必須（[ADR-0013](0013-enum-addition-backfill-migration.md)）

## 根拠（コード・コミット・文書参照）

- 決定 6（追記含む。元 design ドキュメントは実装完了に伴い削除。本 ADR が一次情報）
- `src/lib/quiz/CLAUDE.md` — 形式追加チェックリスト
- `src/lib/quiz/generation/build-quiz.ts` / `src/lib/quiz/payload.ts`
- commits `39fd8f7`（TG四択追加）/ `a483884`（TG自己判定追加）— 拡張点の実運用例
