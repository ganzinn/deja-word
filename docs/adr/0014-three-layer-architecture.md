# ADR-0014: 3層構成（Server Action → UseCase → Handler + Policy/Error-map）、Repository/DDD 不採用

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

単語登録機能が 376 行の `words-children.ts` に集中し、`SYSTEM_USER_ID` のマジックバリュー判定やエラーマッピングが複数箇所に散在していた。動作・スキーマを変えずに責務を単一化するリファクタリング（5 フェーズ、PR #1–#6）で到達点アーキテクチャが定義された。

## 決定内容

サーバ側の処理を次の 3 層に分ける:

1. **Server Action**（`src/app/**/actions.ts`）: セッション取得、入力検証、UseCase 呼び出し、エラー → Result 変換（[ADR-0016](0016-server-action-result-type.md)）
2. **UseCase**（`src/lib/*.ts` の flat ファイル、動詞プレフィクス命名 `words-create.ts` 等）: トランザクション所有（[ADR-0015](0015-usecase-owns-transaction.md)）、認可の起点
3. **Handler + Policy + Error-map**（`src/lib/<feature>/`）: エンティティ単位の書き込み handler、純関数の認可 policy、エラーマップ

**Repository 抽象や DDD 風クラス階層は導入しない。Prisma 自体を Repository とみなす。**

## 採らなかった代替案

本 ADR に記録した「解消しない項目」の却下案:

- **Repository 抽象（N4）**: 「薄い抽象は屋上屋」として却下
- **DDD エンティティ（N5）**: 「zod 型 + Prisma 型で十分」として却下

## 影響

- UseCase は flat ファイルで発見性を保ち、純関数群はディレクトリに逃がす配置規約（quiz でも踏襲）
- 新機能（quiz / drill）も同じ 3 層で実装され、層の責務が `src/lib/CLAUDE.md` / `src/app/CLAUDE.md` に恒久規約化された

## 根拠（コード・コミット・文書参照）

- 到達点アーキテクチャ、N1–N6 の「解消しない」表（元 refactor ドキュメントは実装完了に伴い削除。本 ADR が一次情報）
- commit `0f65fe6`（PR #1、計画）、`0d90577` / `f149c2a` / `f6fcd52` / `2b71e8b` / `b8b6c78`（Phase 1–5）
- `src/lib/CLAUDE.md` / `src/app/CLAUDE.md` — 層の責務規約
