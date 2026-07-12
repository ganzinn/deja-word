# ADR-0017: インターフェースは Server Action に統一（Route Handler は例外4件のみ）

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

quiz 設計時に、クライアント ↔ サーバのインターフェースを Server Action と Route Handler（REST 風 API）のどちらに寄せるかが検討された。

## 決定内容

**インターフェースは Server Action に統一**する。quiz は 11 の Server Action を `src/app/quiz/actions.ts` に集約。Route Handler は以下の 4 件のみ:

- `api/auth/[...all]` — Better Auth の catch-all（ライブラリ要件）
- `api/dev-blob/[...key]` — ローカル Blob 配信（[ADR-0043](0043-blob-di-driver-switching.md)）
- `api/words/search` / `api/words/headword-exists` — 既存の例外 2 件（`getSession` 直呼びを含め「修正対象のバグではない」と規約に明記）

## 採らなかった代替案

- **GET Route Handler での quiz 生成 API** — 「キャッシュも URL 共有も不要（毎回ランダム生成）」として却下（quiz-05 決定 2 の却下案）

## 影響

- 型のついた入出力（zod スキーマ共有）と Result 型（[ADR-0016](0016-server-action-result-type.md)]）が全インターフェースで一貫する
- Server Action の body 上限に依存するため、音源アップロードのために `experimental.serverActions.bodySizeLimit: "4.5mb"` を設定している（Vercel Function の上限 4.5MB、アプリ検証は 4MB。`next.config.ts` のコメント）

## 根拠（コード・コミット・文書参照）

- インターフェースを Server Action に統一する決定（元 design ドキュメントは実装完了に伴い削除。本 ADR が一次情報）
- `src/app/CLAUDE.md` — Route Handler 例外 2 件の明記
- `src/app/quiz/actions.ts` — quiz の Server Action 集約
- `next.config.ts` — bodySizeLimit 設定とコメント
