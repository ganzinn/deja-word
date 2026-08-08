# quiz-result-bulk-bookmark 設計ドキュメント（ハブ）

単語テスト結果画面で「間違えた問題だけ表示」チェック時に対象単語を一括ブックマークできる機能の設計ドキュメント群の入口。
**quiz-result-bulk-bookmark の設計に関わるセッションは、必ずこのファイルから読み始めること。**

## 目的・スコープ

テスト結果で間違えた単語をまとめてブックマークし、後からブックマーク絞り込み（一覧・テスト範囲指定）で復習しやすくする。既存のブックマーク機能（1 件ずつのトグル）を補完する一括操作であり、ユーザーが明示的にボタンを押したときだけ実行する（自動登録はしない）。

スコープの詳細（何をやる / やらない）は [01-requirements.md](01-requirements.md) で定義する。

## 確定事項サマリ

結論のみを記載する。採用理由・却下した代替案は各トピックファイルを参照。

- **「間違えた問題だけ表示」チェック ON のときだけ、明示ボタンで一括ブックマーク登録できる**。自動登録はしない。チェック OFF では一括操作を提供しない。→ [01](01-requirements.md)
- **全モード共通（TEST / DRILL / DRILL_RETRY）**。結果画面を使う全モードで同じ仕様・挙動とする。→ [01](01-requirements.md)
- **対象単語 = チェック ON 時に表示されている行の単語（削除済みを除く）**。定義の正は絞り込み条件 `result !== "CORRECT"`。対象 wordId 群はクライアントから渡す。→ [01](01-requirements.md)
- **一括操作は履歴送信の成功後のみ**。「成功」は `success`（TEST / DRILL_RETRY）と `drill-success`（DRILL）の両方。→ [01](01-requirements.md)
- **既ブックマーク済みも対象に含め、冪等に扱う**。→ [01](01-requirements.md)
- **一括操作は登録のみ**。一括解除・Undo はスコープ外（誤操作時は既存の行トグルで個別解除）。→ [01](01-requirements.md)
- **UseCase は `addBookmarksForUser(userId, wordIds)`**。scoped 検証を通った分だけ `createMany({ skipDuplicates: true })` で一括登録し、弾かれた分はスキップして返す。UseCase が `$transaction` を所有し、失敗は常に全体失敗（部分適用なし）。→ [02](02-server-action.md)
- **Server Action は `addBookmarks({ wordIds })`**。成功時 `bookmarkedWordIds` / `skippedWordIds` を返し、エラーは `unauthorized | invalid | unknown`。`revalidatePath` は呼ばない。→ [02](02-server-action.md)
- **入力スキーマは `min(1).max(BOOKMARK_WORD_IDS_MAX_COUNT)`**。上限定数は既存 3000 を流用し doc コメントを汎用化。追加先は `src/lib/schema/bookmark.ts`（スキーマの配置のみ 02 で確定）。→ [02](02-server-action.md)
- **一括ボタンは「間違えた問題だけ表示」チェックボックスの直下、ラベルは件数入り「N語をまとめてブックマーク」**（N = 表示行から削除済みを除いた対象数）。チェック OFF・誤答 0 件・`bookmarkStates` 未取得時は非表示、送信未成功・対象 0 件・実行中は disabled。→ [03](03-ui.md)
- **押下後は既存トグルと同型の楽観的更新で対象行のトグルを即時 ON にする**。実行本体は `bookmarkStates` を所有する `QuizFlow` 側に置く。成功は toast で件数通知（一部スキップは除外件数も通知、全件スキップは info 通知＋表示を戻す）、失敗は `toast.error` ＋全件ロールバック。リトライ導線は設けず再押下で対応、多重押下は実行中フラグで防止。→ [03](03-ui.md)
- **UseCase は `src/lib/bookmark-settings.ts` へ、action は `src/app/words/actions.ts` へ追加**。エラーは action 内分岐（error-map 不使用。単一 action 専用変換のため ADR-0063 の線引きに適合）で、UseCase の handler 分割もしない。設計判断の長期記録として実装 PR で新規 ADR を 1 本起票する。→ [04](04-architecture.md)
- **UI はボタン描画を `result-list.tsx`、対象算出を純関数 `bulk-bookmark-targets.ts`（新規）、実行本体を `quiz-flow.tsx` に置く**。→ [04](04-architecture.md)
- **テストは unit（スキーマ追記・対象算出・action 分岐）＋ integration（`addBookmarksForUser` の冪等性・scoped skip）**。UI コンポーネントのレンダリングテストは書かず、結合確認は e2e-verify で行う。→ [04](04-architecture.md)
- **機能紹介は bookmark.md の「テスト結果からの付け外し」節を主に更新し、word-quiz.md に補足 1 文**。既存画像は変えず、一括ボタン用の新規画像 `bookmark-quiz-result-bulk.png` を `--only bookmark` で追加撮影（撮影スクリプトへのチェック ON 手順追加込み）。→ [04](04-architecture.md)

## トピック状態表

状態: `未着手` → `議論中` → `確定`

| ファイル | 状態 | 要約 |
| --- | --- | --- |
| [01-requirements.md](01-requirements.md) | 確定（2026-08-08） | 要求・対象の定義・スコープ外 |
| [02-server-action.md](02-server-action.md) | 確定（2026-08-08） | 一括登録の Server Action / UseCase / 入力スキーマ |
| [03-ui.md](03-ui.md) | 確定（2026-08-08） | ボタン配置・表示条件・フィードバック・失敗時挙動 |
| [04-architecture.md](04-architecture.md) | 確定（2026-08-08） | ファイル配置・テスト戦略 |

データモデルは既存 `Bookmark` テーブル（userId × wordId 複合 PK）をそのまま使う前提のため独立トピックを立てない。

**全トピック確定済み（2026-08-08）。設計は完了**。後続工程は「実装への引き継ぎ」を参照。

## 実装への引き継ぎ

チケット分割はこのセクション＋確定事項サマリだけで開始できる（詳細が必要な場合のみ各トピックの「決定 N」を参照）。

### 変更対象の一覧

- スキーマ変更・マイグレーション: **なし**（既存 `Bookmark` テーブルをそのまま使用）
- `src/lib/schema/bookmark.ts`: `addBookmarksInputSchema` 追加＋既存上限定数の doc コメント汎用化（[02 決定参照](02-server-action.md)）。対の `bookmark.unit.test.ts` に追記
- `src/lib/bookmark-settings.ts`: UseCase `addBookmarksForUser(userId, wordIds)` 追加。対の `bookmark-settings.integration.test.ts` に追記
- `src/app/words/actions.ts`: Server Action `addBookmarks({ wordIds })` 追加。`src/app/words/actions.unit.test.ts` 新設
- `src/app/quiz/_components/bulk-bookmark-targets.ts`: 新規（対象算出の純関数）＋ unit テスト新設
- `src/app/quiz/_components/result-list.tsx`: 一括ボタンの描画・表示/disabled 条件・新規 props 2 つ（実行用コールバック・実行中フラグ）の受け口
- `src/app/quiz/_components/quiz-flow.tsx`: 一括実行の本体（スナップショット・`useTransition`・ロールバック・toast・`bookmarkStates` の一括更新）
- `docs/features/bookmark.md`（主）・`docs/features/word-quiz.md`（補足 1 文）・`scripts/e2e/capture-docs-screenshots.ts`（`sectionBookmark` のセクション末尾にダイアログを閉じる → チェック ON → 一括ボタン撮影の手順）＋新規画像 `bookmark-quiz-result-bulk.png` の追加撮影（既存画像は変更しない）
- `docs/adr/`: 新規 ADR を 1 本起票（skip 方式の非対称・error-map 不使用の ADR-0063 線引き適用・`bookmark-settings.ts` 相乗りの命名逸脱。[04 決定 2 参照](04-architecture.md)）

### 着手順序のヒント

スキーマ（zod）→ UseCase → action → 対象算出の純関数 → UI（`result-list.tsx` / `quiz-flow.tsx`）→ 機能紹介ドキュメント、の依存方向。並行実装する場合、`src/lib/schema/bookmark.ts` と `src/app/words/actions.ts` は本機能の複数チケットが同時に触れやすい共有物。

### テスト戦略の要点（チケットの完了条件に転記できる粒度）

- unit: `addBookmarksInputSchema`（min(1)・上限・型違反）／`computeBulkBookmarkTargetIds`（誤答絞り込み・`skippedWordIds` / `remaining` 除外・送信未成功時）／`addBookmarks` の分岐（unauthorized / invalid / unknown / 成功パススルー）
- integration: `addBookmarksForUser` の一括登録・冪等性（再実行で件数不変）・scoped 外 skip（DB 副作用なし）・system 所有単語の登録可
- UI コンポーネントのレンダリングテストは書かず、e2e-verify スキルの手順で結合の動作確認を行う

### 後続工程

チケット分割は ticket-split スキルで行う（チケットの置き場は `docs/plan/quiz-result-bulk-bookmark/`、形式は ticket-split 側で定義）。

## セッション運用ルール

1. **読み込みは「ハブ + 対象トピック1ファイル」に限定する**。他のトピックファイルは原則読まない。依存する決定は各ファイル冒頭の「前提」に再掲されている。
2. **仕様書・設計書に記載した後は、毎回必ず整合性レビューを実施する**（成立しない記述・二重定義・決定間の矛盾・曖昧なシグネチャ等。観点は design-session スキル参照）。修正してから次へ進む。
3. **セッション終了（クリア）前に、このファイルの状態表と確定事項サマリを必ず更新する**。これが次セッションへの引き継ぎとなる。
4. **議論の過程・却下案・採用理由はトピックファイルに残し、ハブには昇格させない**。ハブには結論のみ（各1〜3行）を書く。
5. **既存の確定事項を覆す場合は、ハブのサマリと元トピックファイルの両方を更新する**。あわせて、その決定を「前提」に再掲している他ファイルも更新する。
6. 全トピック確定後、ハブに「実装への引き継ぎ」セクションを追記して設計を閉じる。実装フェーズの分割計画は別途 `docs/plan/` で扱う（このディレクトリは設計のみ）。
