# quiz-result-bulk-bookmark 実装プラン（チケット一覧）

単語テスト結果画面で「間違えた問題だけ表示」チェック ON 時に対象単語を一括ブックマークできる機能を PR 単位のチケットに分割した実装プランの入口。
**quiz-result-bulk-bookmark の実装セッションは、必ずこのファイルと対象チケット 1 ファイルから読み始めること。**

## 設計ドキュメントとの関係

設計の一次情報は [docs/design/quiz-result-bulk-bookmark/README.md](../../design/quiz-result-bulk-bookmark/README.md)。本プランはそれを PR 単位に分割したもの。
各チケットには実装に必要な設計決定が再掲済みのため、原則として設計ドキュメントを読み直す必要はない（再掲の出典参照を深掘りしたい場合のみ「決定 N」を参照する）。
設計が改訂された場合は、ticket-split スキルの見直し・追加モードで影響チケットを更新する。

## チケット一覧

番号 = 推奨着手順。状態: `未着手` → `実装中` → `完了`（日付付き）。

| チケット | 概要 | 依存 | 状態 | PR |
| --- | --- | --- | --- | --- |
| [01-server-bulk-add.md](01-server-bulk-add.md) | 一括登録のサーバ側一式（入力スキーマ・UseCase・Server Action）＋新規 ADR 起票 | なし | 完了（2026-08-08） | [#246](https://github.com/ganzinn/deja-word/pull/246) |
| [02-ui-bulk-button.md](02-ui-bulk-button.md) | 結果画面の一括ボタン（対象算出の純関数・ボタン描画・楽観的更新の実行本体） | 01 | 完了（2026-08-08） | [#246](https://github.com/ganzinn/deja-word/pull/246) |
| [03-feature-docs.md](03-feature-docs.md) | 機能紹介ドキュメント更新＋一括ボタンの新規画像撮影 | 02 | 完了（2026-08-08） | [#246](https://github.com/ganzinn/deja-word/pull/246) |

## 依存関係図

```mermaid
graph LR
  T01[01 server-bulk-add] --> T02[02 ui-bulk-button] --> T03[03 feature-docs]
```

並行着手可能なグループ: なし（全チケット直列。01 → 02 → 03 の順に着手する）

## チケット横断の共通事項

### 共有物・競合点

なし（同一ファイルを複数チケットが触らないよう分割済み。設計ハブが共有物として挙げていた `src/lib/schema/bookmark.ts` と `src/app/words/actions.ts` はチケット 01 に集約した）。

### 共通規約

- テストは AGENTS.md の規約に従う（`*.unit.test.ts` は `pnpm test:unit`、`*.integration.test.ts` は `pnpm test:integration`。SUT の隣にコロケート）
- マージ前に `pnpm format`（整形）→ `pnpm format:check` / `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` を通す。`pnpm test:integration` は共有 DB を使うため実装エージェントは実行せず、オーケストレーターが直列で実行する
- スキーマ変更・マイグレーションは本機能全体で**なし**（既存 `Bookmark` テーブル（userId × wordId 複合 PK）をそのまま使用）
- UI コンポーネント（`.tsx`）のレンダリングテストは書かない。結合の動作確認は e2e-verify スキルの手順で行う（担当はチケット 02）

## ブランチ・PR 運用

実装モードは ticket-implement スキルが選択する（デフォルトは単一ブランチ統合モード）。共通: チケットの作業ブランチ名は `feature/quiz-result-bulk-bookmark-NN-<チケット名>`、コミット / PR タイトルは `quiz-result-bulk-bookmark: NN <チケット名>`、着手・マージは依存順。

- **単一ブランチ統合モード（デフォルト）**: 統合ブランチ `feature/quiz-result-bulk-bookmark` に 1 チケット = 1 squash コミットで取り込み、機能全体で 1 PR。「実装中」= worktree 作成時、「完了」= 統合ブランチへのマージ。PR 列は統合 PR 作成時に全行へ同一 URL を一括記載する
- **チケット単位 PR モード（--pr）**: 1 チケット = 1 PR。「完了」= PR マージ。PR 作成済み・未マージは「実装中」＋PR リンクで表現する

運用メモ: 単一ブランチ統合モードで実装中（統合ブランチ `feature/quiz-result-bulk-bookmark`）

## ステータス運用ルール

1. **実装セッションは、着手時・PR 作成時・マージ時に、本ファイルのチケット一覧表と対象チケット冒頭の状態行の両方を更新する**（「実装中」「完了」の意味と PR 列の記載タイミングは上の「ブランチ・PR 運用」の実装モードに従う）。
2. 実装時に計画との差分・後続チケットへの申し送りが生じたら、チケットの「実装メモ」に記入する。
3. **計画の変更（チケットの追加・削除・依存や順序の組み替え・設計改訂の反映）は ticket-split スキルで行う**。実装セッションで勝手にチケットを書き換えない。
