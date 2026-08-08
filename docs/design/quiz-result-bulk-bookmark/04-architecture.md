# 04. アーキテクチャ・テスト戦略

状態: **確定**（2026-08-08）

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- 一括操作は登録のみ（解除なし）・冪等な登録（既ブックマーク済みも対象に含める）で全モード共通。シグネチャの形は 02 の管轄（01 確定）。
- 削除済み単語の除外はクライアント側の判定（送信応答由来）で行い、対象 wordId 群はクライアントから渡す（01 確定）。
- 既存ブックマーク機能の仕様変更（データモデル・絞り込み・既存トグルの挙動）はスコープ外（01 確定）。
- UseCase は `addBookmarksForUser(userId, wordIds)`（`$transaction` 内で scoped 検証 → `createMany({ skipDuplicates: true })`）、action は `addBookmarks({ wordIds })`、入力スキーマは `addBookmarksInputSchema`（`BOOKMARK_WORD_IDS_MAX_COUNT` 流用・doc コメント汎用化）。エラーは action 内分岐で error-map 不使用（既存踏襲。規約上の位置づけは本トピック決定 2 で確定）（02 確定）。
- UseCase 内の層の切り方（handler を分けるか UseCase 直書きか）は本トピックの 3 層適合確認の管轄（02 確定）。
- 一括ボタンは結果画面のチェックボックス直下（`ResultList` の描画範囲）に置く。対象算出とボタン描画は `ResultList`、一括実行の本体（スナップショット・action 呼び出し・ロールバック・toast・実行中フラグ）は `bookmarkStates` Map を所有する `QuizFlow` 側に置き、`ResultList` へ実行用コールバックと実行中フラグを新規 props で渡す（03 確定）。
- Map への先行反映は `QuizFlow` 内部の処理として 1 回の Map コピーで対象全件を更新する（`ResultList` へ渡す新規 props は実行用コールバックと実行中フラグの 2 つのみ）。行の表示反映は既存の key 再マウントをそのまま使う（03 確定）。
- 押下フローは既存 `BookmarkButton` と同型の楽観的更新（スナップショット + `useTransition` + 失敗時全件ロールバック）で、成功・一部スキップ・全件スキップ・失敗を toast で通知する（03 確定）。
- ボタンの表示条件はチェック ON かつ誤答行あり かつ `bookmarkStates` 取得済み、disabled 条件は送信未成功・対象 0 件・実行中。対象件数 N（ラベル表示・action 引数）は表示行から削除済みを除いてクライアントで算出する（03 確定）。

## 検討事項リスト

- [x] ファイル配置（UseCase / action / UI。スキーマの配置は 02 で確定済みのため対象外）と `bookmark-settings.ts` への相乗り整理 → 決定 1・2・3
- [x] 3 層構成（Server Action → UseCase → handler / 純関数）・Result 型規約（ADR-0014/0016）への適合確認 → 決定 2
- [x] unit テスト（スキーマ・純関数）と integration テスト（UseCase の scoped 検証・冪等性）の分担 → 決定 4
- [x] `docs/features/` の機能紹介ドキュメント更新の要点 → 決定 5

## 議論・決定

### 決定 1: UseCase `addBookmarksForUser` は既存 `bookmark-settings.ts` に追加する（新規 flat ファイルを作らない）

`addBookmarksForUser(userId, wordIds)` は `src/lib/bookmark-settings.ts` に追加する。既存 `setBookmarkForUser` の doc コメントが示す責務「本人の単語ブックマークを冪等に付け外しする（純 per-user 設定）」の範囲に一括登録も収まる（scoped 検証・書き込み先は本人行のみ、の性質も同じ）。既存関数の doc コメントは変更せず、新関数に独自の doc コメントを書く。`scopedOwnerIds` による検証パターンを同ファイル内で共有する。相乗りは ADR-0014 の動詞プレフィクス命名（`words-create.ts` 等）からの明示的逸脱であり（名詞系 settings ファイル群の既存踏襲）、決定 2 の ADR 起票に含めて記録する。

採用理由: ブックマークの書き込み系（1 件 set / 一括 add）と read が 1 ファイルに凝集し、scoped 検証パターンの共有が自然。名詞系ファイルが `$transaction` を所有する先例として `quiz-default-settings.ts` があり、ADR-0014「UseCase は flat ファイル」の趣旨（発見性）も満たす。

却下した代替案: ADR-0014 の動詞プレフィクス命名に従い `bookmarks-add.ts` を新設する案 — 命名規約には忠実だが、既存 `setBookmarkForUser`（実質 1 件版の UseCase）と責務が二分し、行数も小さく分割の凝集度メリットがない。

### 決定 2: action は `words/actions.ts` に追加し、エラーは action 内分岐（error-map 不使用）を踏襲する。handler 分割もしない

- `addBookmarks({ wordIds })` は `src/app/words/actions.ts` に追加する（`toggleBookmark` / `getBookmarkStates` と同居）。呼び出し元は quiz 結果画面だが、置き場は対象機能（ブックマーク）側に揃える既存構成に従う（`quiz-flow.tsx` が `getBookmarkStates` を import する先例あり）。
- エラー → Result の変換は既存 2 action と同じ try/catch の action 内分岐とし、error-map は導入しない。`addBookmarksForUser` は scoped 外を throw ではなく skip で返す（02 確定）ため、action の分岐は `unauthorized`（セッションなし）／`invalid`（スキーマ違反）／`unknown`（catch）の 3 つだけで、複数 action から共有されるドメインエラーを持たない。これは ADR-0063（エラー → Result 変換の集約線引き: 共有ドメインエラーのみ error-map へ集約し、単一 action 専用の変換は action 内でよい）の提案線引きに**適合**するため、ADR-0016 からの逸脱ではなく 0063 の適用例として扱う。
- **記録先**: `docs/design/` は実装後に削除される運用のため、この機能の設計判断（02 確定の「1 件版は範囲外を拒否・一括は skip」の非対称、error-map 不使用が 0063 線引きの適用例であること、決定 1 の相乗り＝命名逸脱）は実装 PR で新規 ADR を 1 本起票して長期記録とする（ADR-0063 と相互参照を張る）。
- UseCase 内の層分割（handler / policy）はしない。処理は「scoped `findMany` → `createMany({ skipDuplicates: true })`」の 2 ステップで、`bookmark-settings.ts` 既存関数と同じ直書き規模。

採用理由: 同ファイル既存 action・既存 UseCase と作りを揃え、規模に対して層を増やさない（凝集度・変更理由で判断）。

却下した代替案: `src/lib/bookmark/error-map.ts` を新設して ADR-0016 に適合させる案 — 変換対象のエラー型が実質存在せず、ファイルが形骸化する。

### 決定 3: UI は `result-list.tsx` にボタン描画、対象算出は隣接の純関数ファイル、実行本体は `quiz-flow.tsx`

03 で確定した役割分担を実ファイルに落とす:

- 一括ボタンの描画（表示条件・disabled 条件・ラベル）は `result-list.tsx` に直接追加する。新規コンポーネントファイルは作らない（ボタン 1 個＋ラベルで、`wrongOnly` や `submitState` 由来の表示条件と密結合のため、分離しても凝集度が上がらない）。
- 対象 wordId 群（= ラベルの N の内訳）の算出は純関数 `computeBulkBookmarkTargetIds(rows, submitState): string[]` として `src/app/quiz/_components/bulk-bookmark-targets.ts`（result-list 隣接）に切り出す。誤答絞り込み（`result !== "CORRECT"`）と削除済み除外（`skippedWordIds` / `remaining`）を関数内で行う。引数型 `ResultRow` / `SubmitState` は `result-list.tsx` の定義を `import type` で参照する（型のみのため実行時の循環は生じない。型の移動は既存 import 箇所に変更理由がないため行わない）。
- 実行本体（スナップショット・`useTransition`・action 呼び出し・ロールバック・toast・実行中フラグ・Map 一括更新）は `quiz-flow.tsx` に追加し、新規 props 2 つ（実行用コールバック・実行中フラグ）を `ResultList` へ渡す（03 確定の具体化）。

採用理由: テスト対象になるロジック（対象算出）だけを `.ts` に切り出し、描画は state の持ち主の近くに置く既存スタイル（`word-detail-dialog-state.ts` の分離パターン）に一致させる。`.tsx` から export した純関数を直接テストする先例（`answer-feedback-overlay.unit.test.ts`）もあるが、700 行規模に肥大した `result-list.tsx` へ関数を足すより隣接ファイルへの分離が凝集度で勝る。

却下した代替案: 一括ボタンを独立コンポーネント（`bulk-bookmark-button.tsx`）にする案 — props で表示条件・件数・コールバックを全部受け取るだけの薄い箱になり、分割の変更理由（SRP）が立たない。

### 決定 4: テストは unit（スキーマ・対象算出・action 分岐）＋ integration（UseCase）。`.tsx` はテストしない

- **unit（DB なし、`pnpm test:unit`）**:
  - `src/lib/schema/bookmark.unit.test.ts` に `addBookmarksInputSchema` のケースを追記（空配列の拒否 = `min(1)`、上限ちょうど許容・超過拒否、非配列・非文字列要素の拒否）
  - `src/app/quiz/_components/bulk-bookmark-targets.unit.test.ts` を新設（誤答絞り込み／TEST・DRILL_RETRY の `skippedWordIds` 除外／DRILL の `remaining` 除外／`sending`・`error` 時は削除済み判定なしで誤答全行）
  - `src/app/words/actions.unit.test.ts` を新設し、`addBookmarks` の分岐（未ログイン → `unauthorized`、スキーマ違反 → `invalid`、UseCase throw → `unknown`、成功時の `bookmarkedWordIds` / `skippedWordIds` パススルー）を検証。形式は先例 `src/app/quiz/actions.unit.test.ts`（session / UseCase のモック）に従う。既存 `toggleBookmark` / `getBookmarkStates` へのテスト追加はスコープ外
- **integration（`dejaword_test`、`pnpm test:integration`）**: `src/lib/bookmark-settings.integration.test.ts` に `addBookmarksForUser` のケースを追加 — 一括登録／既ブックマーク済み混在での冪等性（再実行で件数不変）／scoped 外混在（skip されて `skippedWordIds` 相当の戻り値に入り、DB 副作用なし）／全件 scoped 外／system 所有単語の登録可
- **UI コンポーネントのレンダリングテストは書かない**（repo に前例がなく、テストは純関数・hook 単位で行う慣習に従う）。結合の動作確認は e2e-verify スキルの手順で行い、実装チケットの完了条件に記載する

採用理由: 既存のテスト分担（スキーマ・純関数・action 分岐は unit、DB 検証は integration、UI は E2E 手動）と同じ線引きで、SUT 隣接コロケーション規約にも一致する。

却下した代替案: `result-list.tsx` のレンダリングテスト（Testing Library 等）を導入する案 — repo に前例がなく、導入判断はこの機能のスコープを超える。

### 決定 5: 機能紹介は bookmark.md を主に更新し、既存画像は変えず一括ボタン用の画像を 1 枚追加する

- `docs/features/bookmark.md` の「テスト結果からの付け外し」節に一括ブックマーク（「間違えた問題だけ表示」ON で件数入りボタン）の説明を追記し、新規画像 `bookmark-quiz-result-bulk.png`（チェック ON・一括ボタンが写る画）を追加する。既存の `bookmark-quiz-result.png` / `bookmark-quiz-result-dialog.png` と対応する本文（ON/OFF 混在の行一覧・詳細ダイアログ）は現状のまま維持する。
- 撮影スクリプト `sectionBookmark` への追加は「開いたままの単語詳細ダイアログを閉じる → チェック ON → 一括ボタンの可視待ち → 新規画像の撮影」のみ（現行スクリプトはダイアログ撮影で終わるため、閉じる操作から始める）。誤答は現行の自己判定回答（judges = 合っていた / 間違っていた / うろ覚え で 3 問完走）で既に 2 件作られるため、回答手順の変更は不要。追加はセクション末尾のため既存 2 枚の撮影へ影響しない。再撮影コマンドは `pnpm e2e:capture-docs --only bookmark`。
- `docs/features/word-quiz.md` の「テスト結果」節に一括ブックマークできる旨の 1 文と bookmark.md へのリンクを追加する。`quiz-result.png` はチェック OFF の画のため再撮影不要。

採用理由: 付け外し操作の説明は bookmark.md に集約されており（「付け外し箇所は 4 箇所」の列挙あり）、テスト結果画面の紹介は word-quiz.md から参照する現行の分担に沿う。既存画像を撮り直す方式にしないのは、チェック ON では正解と判定された行が一覧から消えるため（出題順はシャッフルされ、どの単語が正解判定になるかは実行ごとに変わる）、ON/OFF 混在を見せる既存の撮影意図と本文「各単語の行にブックマークアイコンが並びます」の対応が実行によって崩れ、ダイアログ撮影（撮影対象行のクリック）も対象行が正解判定だった回に失敗してフレーキーになるため。

却下した代替案:

- word-quiz.md 側に主説明を置く案 — ブックマークの操作説明が 2 ページに分散し、既存の「付け外しは bookmark.md」の構成と食い違う。
- `bookmark-quiz-result.png` をチェック ON で撮り直す案 — 上記のとおり既存の画・本文との対応が実行によって崩れ、後続のダイアログ撮影もフレーキーになる。
