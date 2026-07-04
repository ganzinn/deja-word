# ADR-0007: system ユーザー = 共有マスタ所有者 = 管理者（role カラム不採用）

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

共有マスタデータの所有者と、管理機能（ユーザー招待・削除等）の実行権限者をどう表現するかを決める必要があった。

## 決定内容

固定 ID `"system"` のユーザー 1 件（表示名「共通」）に 2 つの役割を兼ねさせる:

1. **共有マスタの所有者**: `ownerId = "system"` の行が全ユーザーに読める共有データ
2. **管理者**: 管理者判定は `session.user.id === SYSTEM_USER_ID` のみ。**role カラムや admin フラグは存在しない**

## 採らなかった代替案

- `User.role` カラムや admin フラグの追加 — 採られていない。（推定）管理者が system ユーザー 1 人で足りる規模のため、カラム追加より判定の単純さを優先したと考えられる。明示的な理由の記録は無いが、「role カラムや admin フラグは存在しない」ことは規約として明記されている
- 共有マスタ所有者と管理者を別エンティティにする — naming-book に「system ユーザー = 共有マスタ所有者 = 管理者」として一体である旨が確定記載されている

## 影響

- 管理者を複数にする・権限を細分化する場合はこの前提が崩れ、role 導入のスキーマ変更が必要になる
- `SYSTEM_USER_ID` の直接参照は `src/lib/words/policy/` に局所化されている（[ADR-0019](0019-two-layer-write-authorization.md)、commit `2b71e8b`）
- system ユーザーのパスワードは ops スクリプト（`pnpm db:set-system-password`）で設定する

## 根拠（コード・コミット・文書参照）

- `src/app/CLAUDE.md` — 「管理者判定は `session.user.id === SYSTEM_USER_ID`。role カラムや admin フラグは存在しない」
- `docs/reference/naming-book.md` — system ユーザーの定義（共有マスタ所有者 = 管理者、表示名「共通」）
- `docs/ops/admin-user-invite.md` — 管理者 = system ユーザーで運用する招待フロー
- `src/lib/system-user.ts` — `SYSTEM_USER_ID` 定義
