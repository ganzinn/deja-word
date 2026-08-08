# 04. アーキテクチャ・テスト戦略

状態: **未着手**

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- 一括操作は登録のみ（解除なし）・冪等な登録（既ブックマーク済みも対象に含める）で全モード共通。シグネチャの形は 02 の管轄（01 確定）。
- 削除済み単語の除外はクライアント側の判定（送信応答由来）で行い、対象 wordId 群はクライアントから渡す（01 確定）。
- 既存ブックマーク機能の仕様変更（データモデル・絞り込み・既存トグルの挙動）はスコープ外（01 確定）。
- UseCase は `addBookmarksForUser(userId, wordIds)`（`$transaction` 内で scoped 検証 → `createMany({ skipDuplicates: true })`）、action は `addBookmarks({ wordIds })`、入力スキーマは `addBookmarksInputSchema`（`BOOKMARK_WORD_IDS_MAX_COUNT` 流用・doc コメント汎用化）。エラーは action 内分岐で error-map 不使用（ADR-0016 逸脱の既存踏襲。適合の再確認は本トピックの検討事項）（02 確定）。
- UseCase 内の層の切り方（handler を分けるか UseCase 直書きか）は本トピックの 3 層適合確認の管轄（02 確定）。
- 一括ボタンは結果画面のチェックボックス直下（`ResultList` の描画範囲）に置く。対象算出とボタン描画は `ResultList`、一括実行の本体（スナップショット・action 呼び出し・ロールバック・toast・実行中フラグ）は `bookmarkStates` Map を所有する `QuizFlow` 側に置き、`ResultList` へ実行用コールバックと実行中フラグを新規 props で渡す（03 確定）。
- Map への先行反映は `QuizFlow` 内部の処理として 1 回の Map コピーで対象全件を更新する（`ResultList` へ渡す新規 props は実行用コールバックと実行中フラグの 2 つのみ）。行の表示反映は既存の key 再マウントをそのまま使う（03 確定）。
- 押下フローは既存 `BookmarkButton` と同型の楽観的更新（スナップショット + `useTransition` + 失敗時全件ロールバック）で、成功・一部スキップ・全件スキップ・失敗を toast で通知する（03 確定）。
- ボタンの表示条件はチェック ON かつ誤答行あり かつ `bookmarkStates` 取得済み、disabled 条件は送信未成功・対象 0 件・実行中。対象件数 N（ラベル表示・action 引数）は表示行から削除済みを除いてクライアントで算出する（03 確定）。

## 検討事項リスト

- [ ] ファイル配置（候補: UseCase は `src/lib/bookmark-settings.ts`、action は `src/app/words/actions.ts` への追加。スキーマの配置は `src/lib/schema/bookmark.ts` で 02 確定済み。シグネチャ・スキーマ内容は 02 の管轄）。ADR-0014 の UseCase 動詞プレフィクス命名規約と、名詞形の既存 `bookmark-settings.ts`（純 per-user 設定）へ相乗りするかの整理を含む
- [ ] 3 層構成（Server Action → UseCase → handler / 純関数）・Result 型規約（ADR-0014/0016）への適合確認
- [ ] unit テスト（スキーマ・純関数）と integration テスト（UseCase の scoped 検証・冪等性）の分担
- [ ] `docs/features/` の機能紹介ドキュメント更新の要点（bookmark.md / word-quiz.md のどこに載せるか）

## 議論・決定

（未着手。見出しは「決定 N: タイトル」形式で番号を振り、本文に「採用理由:」「却下した代替案:」のラベル付き行を置く。）
