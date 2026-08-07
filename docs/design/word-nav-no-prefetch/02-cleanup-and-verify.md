# 02. 周辺整理と検証計画

状態: **未着手**

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- 前後ナビの `<Link>` は `prefetch={false}` の明示で前後ナビの先読みを全廃する（ダイアログ側・詳細ページの他リンクは対象外）。`<Link>` intercept・遷移中フィードバック（ADR-0086 決定 1・2）は維持する（01 確定）。
- `staleTimes` 既定（dynamic 0 秒）により、フルプリフェッチ廃止後はクライアント遷移（前後ナビの `router.push`・戻る / 詳細リンク等の `<Link>` クリック。ブラウザ back/forward の履歴復元を除く）の前後移動・一覧との往復が毎回サーバー取得になる。ルーターキャッシュに残るのは (a) back/forward キャッシュ復元（`staleTimes` の対象外。削除済み単語の stale 表示・404 到達窓が残るが許容）と (b) 共有レイアウトセグメント（partial rendering。レイアウトに載るデータ取得は `SiteHeader` のセッション参照のみで単語データ・隣接ナビを含まず、鮮度問題には無関係）（01 確定）。
- 新 ADR に `revalidatePath` 群（ADR-0086 決定 4）の扱い（本トピックの結論）を含める（01 確定）。

## 検討事項リスト

- [ ] `revalidatePath` 群（ADR-0086 決定 4）の要否精査: `words/new/actions.ts`（createWord）・`words/[id]/actions.ts`（deleteWord）・`words/[id]/edit/actions.ts`（updateWord・音源アップロード/削除系）の計 5 箇所。フルプリフェッチ廃止後もクライアントルーターキャッシュ対策として必要な分と不要な分の切り分け
- [ ] `revalidatePath` を削除する場合の付随物の扱い: 呼び出しを固定している unit テスト（`words/new/actions.unit.test.ts`・`words/[id]/actions.unit.test.ts`・`words/[id]/edit/actions.unit.test.ts` の revalidatePath アサーション）の削除・修正
- [ ] `toggleBookmark` の楽観的更新方針（revalidatePath を呼ばない。ADR-0086 決定 4）への影響有無の確認
- [ ] CDP throttling（本番相当の遅延）での遷移中フィードバック単独の体感確認計画（skill e2e-verify の過渡状態観測レシピ）
- [ ] 削除→一覧→隣接移動で削除済み単語がナビに出ない・404 に到達しないことの E2E シナリオ（一覧への戻りは詳細ヘッダの戻るリンク経由 = `ScreenHeader`、`aria-label="戻る"`、`href` はコンテキスト付き一覧 URL（全デフォルトの単語ビューでは `/words`）を対象とする。ブラウザバック復元経由の stale 表示は 01 決定 2 で許容済みのため対象外）
- [ ] `docs/features/` の機能紹介ドキュメント更新要否（ユーザー向け挙動の変化が説明に影響するか）

## 議論・決定

（未着手。見出しは「決定 N: タイトル」形式で番号を振り、本文に「採用理由:」「却下した代替案:」のラベル付き行を置く。）
