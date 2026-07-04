# ADR-0016: Server Action は throw せず Result 型を返す（error-map 境界）

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

Server Action が throw すると、クライアント側では汎用エラーバウンダリに落ち、フォーム単位のエラーハンドリング（トースト表示・フィールドエラー）ができない。またサービス層のエラー分類がアクションごとにコピペされ、3 箇所に重複していた。

## 決定内容

- **Server Action は例外を投げず、Result 型 `{ ok: true, ... } | { ok: false, error, message }` を返す**。`message` はユーザー向け日本語
- サービス層（UseCase / handler）は**カスタム Error クラスを throw** し、Result への畳み込みは Action 層の責務とする
- Error → Result の変換は機能ごとの **error-map**（`src/lib/words/error-map.ts`、`src/lib/quiz/error-map.ts`）に集約する
- Prisma の一意制約違反は `src/lib/prisma-errors.ts` の `isUniqueConstraintOn(e, "Model")` で判定する（driver adapter 構成では P2002 の meta が modelName 形式のため）

## 採らなかった代替案

- Action ごとに try/catch とメッセージを書く — リファクタ Phase 1（commit `0d90577`）で「3 箇所に散在していた重複」として集約された
- サービス層も Result を返す —（推定）層内の合成が煩雑になるため、throw / Result の変換点を Action 境界の 1 箇所に固定したと考えられる。明示的な比較記録は無い

## 影響

- クライアントのフォーム定型は「`useForm` + `zodResolver` → await Action → `result.ok` 分岐 → sonner トースト」に統一されている（`src/app/CLAUDE.md`）
- 新機能のエラー追加は「カスタム Error 追加 + error-map に 1 行」で完結する

## 根拠（コード・コミット・文書参照）

- `src/app/CLAUDE.md` — 「Server Action は throw しない」規約と Result 型・フォーム定型
- `src/lib/CLAUDE.md` — サービス層はカスタム Error を throw、畳み込みは Action 層
- commit `0d90577` "Prisma エラー判定と Server Action のエラーマッピングを集約"（Phase 1）
- `src/lib/words/error-map.ts` / `src/lib/quiz/error-map.ts` / `src/lib/prisma-errors.ts`
