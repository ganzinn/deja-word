# 05. アーキテクチャ

状態: **未着手**

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- 用語は bookmark（日本語名「ブックマーク」）、naming-book に登録する（01 確定）。
- 共有マスタ単語（ownerId=system）にも本人のブックマークを付けられる。ブックマークは常に本人だけのデータ（01 確定）。
- 単語一覧の「ブックマークのみ」フィルタと quiz の「ブックマークのみ」絞り込みが入る（01 確定）。
- ブックマークは per-user 設定系 side table `Bookmark`（複合 PK userId × wordId、両 FK Cascade、backfill なしの純加算 migration）。既存テーブルは無変更（02 確定）。

既存の確定済み前提（規約・ADR）:

- 3 層構成: UseCase は src/lib/*.ts 直下でトランザクションを張る（ADR-0014 / 0015）。zod スキーマは src/lib/schema/。Server Action は Result 型を返し error-map で変換（ADR-0016）
- 読み取りは scopedOwnerIds、書き込み所有検証は 2 層認可（ADR-0018 / 0019）。純 per-user 設定は本人行のみ書き込み・対象は scoped 検証（手本: src/lib/occurrence-preset-settings.ts）

## 検討事項リスト

- [ ] ブックマーク付け外しの UseCase / server action の配置と命名（トグル 1 action か add/remove 分離か、冪等性・連打耐性）
- [ ] 認可: 対象単語の scoped 検証（共有マスタ単語にも本人ブックマーク可、01 確定）とセキュリティチェックリスト（docs/reference/security-design-checklist.md）の通し
- [ ] quiz 系（quiz-source.ts ほか）への組み込み箇所の整理（03 の決定の実装配置）
- [ ] 一覧クエリ（words-list.ts 等）へのブックマーク状態の載せ方
- [ ] テスト戦略: unit（純関数・スキーマ）と integration（クエリ・UseCase、dejaword_test DB）の切り分け、E2E 確認の要点
- [ ] naming-book / ADR の起票（用語登録、主要決定の ADR 化の要否）

## 議論・決定

（未着手。見出しは「決定 N: タイトル」形式で番号を振り、本文に「採用理由:」「却下した代替案:」のラベル付き行を置く。）
