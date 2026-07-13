# 05. アーキテクチャ

状態: **未着手**

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- 用語は bookmark（日本語名「ブックマーク」）、naming-book に登録する（01 確定）。
- 共有マスタ単語（ownerId=system）にも本人のブックマークを付けられる。ブックマークは常に本人だけのデータ（01 確定）。
- 単語一覧の「ブックマークのみ」フィルタと quiz の「ブックマークのみ」絞り込みが入る（01 確定）。
- ブックマークは per-user 設定系 side table `Bookmark`（複合 PK userId × wordId、両 FK Cascade、backfill なしの純加算 migration）。ブックマーク格納のための既存テーブル変更はなし（02 確定）。
- quiz の絞り込みは出題述語 `bookmarks: { some: { userId } }` を fetchQuizSource / countQuizTargets / countQuizSourceExclusions の 3 関数へ同一適用し、各関数に `bookmarkedOnly: boolean` 引数を追加。ダミー候補（sameOccurrenceRows / fallbackRows）には適用しない（03 確定）。
- occurrenceId を optional 化（quizRangeInputSchema・3 関数シグネチャ）。掲載箇所未指定は bookmarkedOnly=true のときのみ・範囲未指定必須をスキーマのクロスフィールド検証で拒否。全件モードは掲載番号なし単語も対象（ADR-0022 の明示的例外、実装時に ADR へ補記起票）（03 確定）。
- Drill の occurrenceId / rangeFrom / rangeTo を nullable 化し `sourceBookmarkedOnly Boolean @default(false)` を追加。QuizDefaultSetting に `bookmarkedOnly Boolean?` を追加（03 確定）。
- ブックマーク集合は開始時（再テスト含む）に再評価。drill 本体は DrillWord スナップショットでブックマーク条件を再適用しない（03 確定）。
- トグルの反映は楽観的更新（失敗時のみ巻き戻し＋エラー toast、router.refresh なし）。server action は目標状態（ON/OFF）を受け取る冪等 set とし、連打は最後の意図に収束させる（04 確定）。
- ブックマーク状態の取得は 3 経路: 単語一覧は WordListItem / WordOccurrenceListItem に `bookmarked: boolean` を追加（wordListSelect 拡張）、quiz 結果一覧は表示時に wordId 一覧で一括取得する server action を追加、単語詳細ダイアログは getWordDetailForDialog の戻りに bookmarked を並置（04 確定）。
- 単語一覧の「ブックマークのみ」フィルタは URL searchParam `bookmarked=1` で表現し、listWordsForUser / listWordsByOccurrence に閲覧ユーザーのブックマーク存在条件を追加する（04 確定）。

既存の確定済み前提（規約・ADR）:

- 3 層構成: UseCase は src/lib/*.ts 直下でトランザクションを張る（ADR-0014 / 0015）。zod スキーマは src/lib/schema/。Server Action は Result 型を返し error-map で変換（ADR-0016）
- 読み取りは scopedOwnerIds、書き込み所有検証は 2 層認可（ADR-0018 / 0019）。純 per-user 設定は本人行のみ書き込み・対象は scoped 検証（手本: src/lib/occurrence-preset-settings.ts）

## 検討事項リスト

- [ ] ブックマーク付け外しの UseCase / server action の配置と命名・シグネチャ（目標状態を受ける冪等 set は 04 確定。1 action で boolean を受けるか add/remove 2 action かはここで決める）
- [ ] quiz 結果一覧用のブックマーク状態一括取得 action（04 確定）の配置と入力上限・認可
- [ ] 認可: 対象単語の scoped 検証（共有マスタ単語にも本人ブックマーク可、01 確定）とセキュリティチェックリスト（docs/reference/security-design-checklist.md）の通し
- [ ] quiz 系（quiz-source.ts ほか）への組み込み箇所の整理（03 の決定の実装配置）
- [ ] 一覧クエリ（words-list.ts 等）の拡張（bookmarked 列追加・フィルタ条件は 04 確定）の実装配置の確認とクエリ性能の確認（wordId 単独 index は 02 で張済み、userId 側は PK 先頭）
- [ ] テスト戦略: unit（純関数・スキーマ）と integration（クエリ・UseCase、dejaword_test DB）の切り分け、E2E 確認の要点
- [ ] naming-book / ADR の起票（用語登録、主要決定の ADR 化の要否）

## 議論・決定

（未着手。見出しは「決定 N: タイトル」形式で番号を振り、本文に「採用理由:」「却下した代替案:」のラベル付き行を置く。）
