# 05. アーキテクチャ

状態: **未着手**

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- 既存の words / quiz は「UseCase を `src/lib/` 直下フラット、支援モジュール（純関数・クエリ・handler・error-map）を `src/lib/<feature>/` 配下、zod は `src/lib/schema/`、インターフェースは Server Action」に統一。認可は `scopedOwnerIds` の where 句注入（EditorContext / row-policy は words 側で使用）。
- 単語一覧クエリは `src/lib/words-list.ts`（`listWordsForUser` / `listWordsByOccurrence`）。タグ絞り込みはここへ合成する想定。
- テストは Vitest コロケート（`*.unit.test.ts` / `*.integration.test.ts`）。integration は `tests/setup/tx-mock.ts` の delegate と `fixtures.ts` を利用。
- （02 のスキーマ・03 のフィルタ規則が確定したらここに再掲する。形式: 「- {決定の要約}（NN 確定）。」）

## 検討事項リスト

- [ ] モジュール配置（`src/lib/tags-*.ts` UseCase ＋ `src/lib/tags/` 支援、`src/lib/schema/tag.ts`。words 相似形の踏襲可否）
- [ ] インターフェース（タグ CRUD・付け外し・一覧用のタグ候補取得を Server Action で。Action 一覧と入力/認可の付与）
- [ ] 単語一覧クエリへのタグ絞り込み合成方法（`words-list.ts` の where 注入 / total の再計算 / 2 モード両対応）
- [ ] 認可・テナント分離（タグは私的所有＝self のみ。共有単語 + 私的タグの where 条件の整合、`scopedOwnerIds` との使い分け）
- [ ] 入力検証（zod スキーマ、正規化＝03 の適用箇所、一意制約違反（P2002）のエラーマップ）
- [ ] キャッシュ / 再検証（一覧・詳細の revalidate、Server Action 後の反映）
- [ ] テスト戦略（正規化・フィルタ条件生成は unit、クエリ合成・認可・一意性は integration。完了条件に転記できる粒度）

## 議論・決定

（未着手。採用理由と却下した代替案もここに残す。見出しは「決定 N: タイトル」形式で番号を振る。）
