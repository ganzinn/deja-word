# ADR-0063: エラー→Result 変換の集約線引き（error-map / Action 内変換の使い分け）

- ステータス: 提案
- 確信度: 低
- 起票日: 2026-07-04

> **注意**: 本 ADR は 2026-07-04 実施のコード監査からの**改善提案**であり、実装済みの決定の事後推定ではない。
> レビューを経て決定し、ステータスを更新すること。

## 背景

ADR-0016 は「Server Action は throw せず Result 型を返し、変換は error-map に集約する」と定めるが、実態は三流儀に分裂している:

1. 専用 error-map（`src/lib/words/error-map.ts` / `src/lib/quiz/error-map.ts`）
2. Action ファイル内の変換関数（`src/app/words/[id]/edit/actions.ts:56-71` の `mapAudioError`）
3. Action 内インライン instanceof 連鎖（settings 系）

さらに unknown フォールバック（`console.error` + 汎用文言）が 3 箇所に文言ごと重複し、`deleteWord` は UI 語彙（`"unauthorized"` を含む Result エラーコード union）をサービス層 `src/lib/words-delete.ts:8` で定義している。新しいカスタム Error のマップ先判断が実装者ごとにブレ、漏れは unknown へ静かに落ちる。

## 決定内容

（提案）次の線引きを規約化する:

- **error-map に集約するのは「複数 Action から共有されるドメインエラー」**。単一 Action 専用の変換（音源系など）は Action ファイル内に置いてよい
- ただし **unknown フォールバックは共有ヘルパ 1 箇所**に抽出し、各 map / Action から使う（文言・ログ書式の一元化）
- **サービス層に UI 向け Result 語彙を定義しない**: `DeleteWordError` 型は Action 側へ移し、`deleteWord` の catch は `mapWordWriteErrorToResult` へ置換（メッセージ同一のため挙動不変）
- 線引きを `src/app/CLAUDE.md` に 1 行追記する

## 採らなかった代替案

- **全変換を error-map へ集約** — 単一利用のエラーでもファイル横断の間接参照が増える。ADR-0016 の背景にある「重複散在」の解消は unknown ヘルパの共有で足りる

## 影響

- `mapAudioError` の置き場と `words-delete.ts` の型定義が移動する（挙動不変のリファクタ）
- 以後のカスタム Error 追加時の置き場判断が機械的になる

## 根拠（コード・コミット・文書参照）

- `src/app/words/[id]/edit/actions.ts:56-71`、`src/lib/words/error-map.ts:38`、`src/lib/quiz/error-map.ts:62`
- `src/lib/words-delete.ts:8`、`src/app/words/[id]/actions.ts:24`
- ADR-0016（Result 型と error-map 境界の原決定）

## 人間への確認質問

- 「共有ドメインエラーのみ error-map」という線引きでよいか、それとも全集約に倒すか？
