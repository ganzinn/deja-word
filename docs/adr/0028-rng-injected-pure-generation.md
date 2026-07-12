# ADR-0028: 問題生成は RNG 注入の純関数 + Fisher–Yates、シード非永続

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

出題順・選択肢のシャッフルなど乱数を使う生成ロジックは、素朴に `Math.random()` を埋め込むと決定的なテストが書けない。

## 決定内容

- 問題生成は**純関数**とし、乱数は **`() => number` の RNG を引数注入**する。シャッフルは Fisher–Yates
- unit テストではシード付き RNG（`tests/setup/seeded-rng.ts`）を注入して決定的に検証する
- **シードは永続化しない**（中断 = 破棄、[ADR-0023](0023-batch-submit-discard-on-abort.md) と整合。同じテストの再現は要求されていない）

## 採らなかった代替案

- `Math.random()` 直呼び —（推定）テスト不能になるため。設計は最初から RNG 注入で確定しており、比較の記録は無い

## 影響

- `src/lib/quiz/generation/` 配下の各形式ビルダーはすべて `.unit.test.ts` を併設した DB 非依存の純関数になっている
- 生成関数は client からも import できるよう `server-only` を付けない配置規約と連動している（`src/lib/quiz/CLAUDE.md` の server-only 境界）

## 根拠（コード・コミット・文書参照）

- RNG 注入・Fisher–Yates・シード非永続の決定（元 design ドキュメントは実装完了に伴い削除。本 ADR が一次情報）
- `src/lib/quiz/CLAUDE.md` — 「シードは永続化しない（中断 = 破棄）」
- `src/lib/quiz/generation/shuffle.ts` / `tests/setup/seeded-rng.ts`
