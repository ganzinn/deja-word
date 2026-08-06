# 02. 単語一覧 → 詳細ページの URL コンテキスト設計と隣接クエリ

状態: **未着手**

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- 単語ビュー → 詳細ページに前後ナビを新設し、`sort` / `q` / `match` / `bookmarked` を引き継いでその集合・順序の隣へ移動する（01 確定）。
- 掲載箇所コンテキストに `bookmarked` を追加する。他のパラメータ（`occ` / `q` / `match` / `from` / `to` / `order`）は引き継ぎ済み（01 確定）。
- スコープ外: 一覧ソート機能自体の追加・変更、ナビ順序と無関係な既存挙動の変更（01 確定）。

## 検討事項リスト

- [ ] 単語ビューコンテキストの URL 設計（sort / q / match / bookmarked をどう載せるか、ビュー種別の判別方法。デフォルト値は URL に含めない既存方針との整合）
- [ ] `WordDetailOccurrenceContext` / `parseOccurrenceContext` / `buildWordDetailHref` の一般化（union 型で 2 コンテキストを表すか、既存型の拡張か）
- [ ] 掲載箇所コンテキストへの `bookmarked` 追加（`findAdjacentWordsByOccurrence` の where への反映を含む）
- [ ] 単語ビュー用の隣接クエリ設計（`recent` = `createdAt desc, id desc` / `headword` = `headword asc, id asc` のタプル比較。`createdAt` 同値がありうるため 2 キー比較必須）
- [ ] 詳細画面でブックマークを外す等、閲覧中に自分が絞り込み集合から外れた場合の挙動（既存は集合外なら nav 非表示）
- [ ] 「一覧へ戻る」リンクと編集持ち回り（`buildWordEditHref`）の単語ビュー対応

## 議論・決定

（未着手。見出しは「決定 N: タイトル」形式で番号を振り、本文に「採用理由:」「却下した代替案:」のラベル付き行を置く。）
