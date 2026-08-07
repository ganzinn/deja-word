# 01. prefetch-removal

状態: **完了（2026-08-07）**　PR: [#234](https://github.com/ganzinn/deja-word/pull/234)

## 目的

単語詳細の前後ナビの `prefetch={true}` を `prefetch={false}` に変更してフルプリフェッチを全廃し、ナビ・詳細を常にリクエスト時の DB 状態と同期させる（issue #229）。あわせて、虚偽になる説明コメントの書き換え・新 ADR の起票・既存 ADR への改訂注記・機能紹介ドキュメントの更新を同一 PR で行う。

スコープ外:

- テスト結果ダイアログの詳細先読み（ADR-0088 決定 6）は変更しない（変更する場合は別 issue）
- 遷移中フィードバック（ADR-0086 決定 1・2）・フリック判定（ADR-0085）は変更しない
- `revalidatePath` 5 箇所の呼び出しと対応 unit テスト 3 ファイル（`words/new/actions.unit.test.ts`・`words/[id]/actions.unit.test.ts`・`words/[id]/edit/actions.unit.test.ts` のアサーション）は変更しない（説明コメントのみ書き換える）
- 別端末での削除・変更のリアルタイム反映（サーバープッシュ）は追わない。描画〜タップ間の削除競合は原理的に残る（issue #229 で対象外と明示済み）
- 恒久の自動テストは追加しない（検証は e2e-verify の一回きり実施。[02-cleanup-and-verify.md](../../design/word-nav-no-prefetch/02-cleanup-and-verify.md) 決定 4）

## 依存チケット

なし（並行着手可）

## 前提（設計決定の再掲）

- 前後ナビの `<Link>` 2 箇所は `prefetch={false}` を**明示**する（プロパティ削除でデフォルト `auto` に戻すのではない）。`<Link>` 自体（anchor semantics と `onNavigate` intercept）は維持する。詳細ページの他の `<Link>`（戻る・編集・関連語）は prefetch 未指定（デフォルト `auto`）のままとする（[01-prefetch-removal.md](../../design/word-nav-no-prefetch/01-prefetch-removal.md) 決定 1）
- クライアント遷移（前後ナビの `router.push`・戻る等のリンククリック。back/forward 履歴復元を除く）は `staleTimes` 既定 dynamic 0 秒により毎回サーバー取得となり、追加実装なしで「一覧の表示順と常に同期した隣接移動」が成立する。描画〜タップ間の削除競合と back/forward キャッシュ復元経由の stale 表示・404 到達は残る（許容）。共有レイアウトセグメント（`src/app/layout.tsx`）は partial rendering によりナビゲーション毎には再取得されないが、単語データ・隣接ナビを含まないため本件の鮮度問題には無関係（[01-prefetch-removal.md](../../design/word-nav-no-prefetch/01-prefetch-removal.md) 決定 2）
- 遷移待ちの体感は既存の遷移中フィードバック（ADR-0086 決定 1・2）が単独で担う。issue #200 の再発防止もフィードバック側で担う（[01-prefetch-removal.md](../../design/word-nav-no-prefetch/01-prefetch-removal.md) 決定 3）
- `revalidatePath` 5 箇所（createWord / deleteWord / updateWord・音源アップロード / 削除系）は呼び出し・unit テストとも維持し、維持理由を「変更（作成・編集・削除・音源変更）を実行した同一タブ（同一ルーターインスタンス）で、back/forward 履歴復元により変更前の内容が出るのを防ぐ」に再定義する（[02-cleanup-and-verify.md](../../design/word-nav-no-prefetch/02-cleanup-and-verify.md) 決定 1）
- `toggleBookmark` は現行方針（楽観的更新・`revalidatePath` なし。`src/app/words/actions.ts` 冒頭コメント）のまま変更しない。ブックマーク初期表示の stale 窓は「最大 5 分」から「back/forward 復元経由のみ」に縮む（[02-cleanup-and-verify.md](../../design/word-nav-no-prefetch/02-cleanup-and-verify.md) 決定 2）

## 実装内容

### 変更: `src/app/words/[id]/_components/adjacent-word-nav.tsx`

- 前後 2 箇所の `<Link>` の `prefetch={true}` を `prefetch={false}` に変更する（[01-prefetch-removal.md](../../design/word-nav-no-prefetch/01-prefetch-removal.md) 決定 1）
- prefetch コメント（「前後 1 件はフルルートを先読みする」）を新方針（先読みしない・毎回サーバー取得で一覧と同期。`<Link>` は anchor semantics と `onNavigate` intercept のために維持）の説明に書き換える（[01-prefetch-removal.md](../../design/word-nav-no-prefetch/01-prefetch-removal.md) 決定 4）

### 変更: `src/app/words/new/actions.ts`・`src/app/words/[id]/actions.ts`・`src/app/words/[id]/edit/actions.ts`

- `revalidatePath` 呼び出しに付く説明コメント 3 件（「プリフェッチ済みのルーターキャッシュを無効化する」等）を、再定義した維持理由「変更を実行した同一タブで、back/forward 履歴復元により変更前の内容が出るのを防ぐ」に書き換える（[02-cleanup-and-verify.md](../../design/word-nav-no-prefetch/02-cleanup-and-verify.md) 決定 1）
- createWord の 1 件には「効果は現行の全パージ挙動（暫定）に依存する」旨を併記する（createWord が渡すのは作成直後の新規 ID の詳細パスのため、全パージが指定パスのみに狭められた時点で効果が残らない）（[02-cleanup-and-verify.md](../../design/word-nav-no-prefetch/02-cleanup-and-verify.md) 決定 1）
- `revalidatePath` の呼び出し自体と unit テストは変更しない

### 作成: 新 ADR `docs/adr/00XX-word-nav-no-prefetch.md`（00XX は実装着手時に docs/adr/ の最新番号 +1 で採番。2026-08-07 時点の最新は 0089 のため 0090 見込み）

新 ADR を 1 本起票する。本文は既存 ADR 共通の構成（冒頭にステータス・確信度・起票日、見出しは背景／決定内容／採らなかった代替案／影響／根拠。既存 ADR の実ファイル 0088 / 0089 等に倣う）とする。内容の構成（[01-prefetch-removal.md](../../design/word-nav-no-prefetch/01-prefetch-removal.md) 決定 4 ＋ [02-cleanup-and-verify.md](../../design/word-nav-no-prefetch/02-cleanup-and-verify.md) 決定 1・2）:

- ADR-0086 決定 3 のうち**ページ側 `prefetch={true}` を置き換える**（前提節に再掲した決定 1〜3 の内容）。ADR-0086 決定 1・2 は維持と明記する
- ADR-0086 決定 2 の「`<Link>` は prefetch と anchor semantics のために維持」のうち prefetch 側の根拠は失効するため、「`<Link>` 維持の根拠は anchor semantics と `onNavigate` intercept のみになる」と明記する
- テスト結果ダイアログ側の詳細先読み（現行仕様は ADR-0088 決定 6。ADR-0086 決定 3 のうちダイアログの隣接ナビ先読みは同決定で既に廃止済みで、本 ADR はページ側を置き換える切り分け）は**対象外・維持**と明記する（変更する場合は別 issue）
- `revalidatePath` 群の維持理由の再定義（ADR-0086 決定 4 の置き換え）。あわせて注意を記載する: 全パージは docs 上「暫定挙動（将来は指定パスのみに狭める）」であり、5 箇所が渡すパスはいずれも `/words/<id>`（詳細）で `/words`（一覧）を渡す呼び出しは無いため、挙動が狭められた場合に確実に残るのは「変更した単語自身の詳細ページ」の効果のみ。特に createWord は狭められた時点で効果が残らないため、その時点で `/words` の revalidate 追加（createWord は追加または削除）を再検討する
- `toggleBookmark` の stale 記述の更新: 「最大 5 分の stale は許容」を「リンク遷移では毎回サーバー取得となり、残るのは back/forward 復元経由のみ」に更新する
- ADR-0085 影響節の「同じ href の `<Link>` が prefetch 済みのため、ボタン押下と同じ速さで表示される」は本置き換えで最終的に無効となる旨を 1 行記す

### 変更: `docs/adr/0086-word-nav-transition-feedback-prefetch.md`

改訂注記を追記する（[01-prefetch-removal.md](../../design/word-nav-no-prefetch/01-prefetch-removal.md) 決定 4・[02-cleanup-and-verify.md](../../design/word-nav-no-prefetch/02-cleanup-and-verify.md) 決定 1）。注記の形式は、ADR-0088 決定 6 が ADR-0086 決定 3 末尾に入れた行内注記「（改訂: ダイアログの隣接ナビ先読みは [ADR-0088](0088-quiz-dialog-list-order-nav.md) 決定 6 で廃止・置き換え。詳細の前後 1 件先読みは維持）」に揃える（[01-prefetch-removal.md](../../design/word-nav-no-prefetch/01-prefetch-removal.md) 決定 4 採用理由の前例指定）。対象:

- 決定 3（ページ側プリフェッチ。新 ADR で置き換え）
- 決定 2 の「prefetch と」の句
- 決定 4（`revalidatePath` 群。維持理由を新 ADR で再定義）
- 影響節の 3 項目（プリフェッチ命中時はほぼ即時 / 前後 2 ページ分の追加レンダリング / 編集のたびに再プリフェッチ）。「自動プリフェッチは production のみ」の項目は対象外

### 変更: `docs/adr/README.md`

- テーマ一覧に新 ADR の行を追加する。追加先は ADR-0085〜0089 と同じ「C. アーキテクチャ・レイヤリング」節で、列は既存表と同じ `ID | タイトル | 確信度 | 確認質問`。タイトル列に「0086 決定 3 のページ側プリフェッチを置き換え」と置き換え関係を含める（索引本文中は `ADR-` 接頭辞なしの、ADR-0088 の索引行の形式に倣う）（[01-prefetch-removal.md](../../design/word-nav-no-prefetch/01-prefetch-removal.md) 決定 4）
- ADR-0086 の行のタイトル列にも「ページ側プリフェッチは新 ADR で廃止」を併記する（[01-prefetch-removal.md](../../design/word-nav-no-prefetch/01-prefetch-removal.md) 決定 4）
- **ADR-0086 のステータスは「廃止」にせず、テーマ一覧からも外さない**。本件は決定 1・2 が生きたままの部分改訂であり、ADR-0088 決定 6 の前例（部分改訂は注記方式で行い、置き換え元の ADR-0086 は現役のまま索引に残っている）に倣う（[01-prefetch-removal.md](../../design/word-nav-no-prefetch/01-prefetch-removal.md) 決定 4 採用理由の前例指定）

### 変更: `docs/features/word-management.md`

- 前後ナビ節の「（前後の単語はあらかじめ読み込むため、多くの場合は待ちを感じずに切り替わります）」（現 102 行目付近）を、先読みを前提としない説明（例: 「移動のたびに最新の内容を読み込むため、切り替わるまで淡色表示のまま待ちます」）に書き換える（[02-cleanup-and-verify.md](../../design/word-nav-no-prefetch/02-cleanup-and-verify.md) 決定 5）
- 画面自体は変わらないためスクリーンショットの再撮影は不要（[02-cleanup-and-verify.md](../../design/word-nav-no-prefetch/02-cleanup-and-verify.md) 決定 5）

## 完了条件（Definition of Done）

- [ ] テストファイルに差分がないこと（`revalidatePath` アサーションは変更せず維持される）
- [ ] `pnpm format`（整形）の上で `pnpm format:check` / `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る
- [ ] skill e2e-verify で遷移中フィードバックを確認する（[02-cleanup-and-verify.md](../../design/word-nav-no-prefetch/02-cleanup-and-verify.md) 決定 3）: **dev サーバ**＋過渡状態観測レシピ（playwright-core + system Chrome、CDP throttling 目安 600ms、ポーリングではなく MutationObserver で `data-*` 属性の遷移列を記録）で次の 3 項目を確認する。廃止後は dev と production の遷移経路が一致するため、dev ＋ throttling が本番の体感を代表する
  - ボタン押下・フリックのそれぞれで、操作直後から到着まで `data-pending` が継続して観測できる
  - 到着時の `data-direction` が操作方向と一致し、方向スライドで差し替わる
  - 遷移中に連打しても最終的な表示 URL が最後の操作の意図と一致する（issue #200 の再発なし）
- [ ] skill e2e-verify で削除反映スモークを確認する（[02-cleanup-and-verify.md](../../design/word-nav-no-prefetch/02-cleanup-and-verify.md) 決定 4）:
  1. 一般ユーザー（既定の使い回し `test1@example.com`）で headword `e2e-nav-a`〜`e2e-nav-d` の 4 件を用意し、見出し順一覧（`sort=headword`。並び順トグルのボタン文言は「見出し順」）で a→b→c→d と並ぶことを前提にする（既定の新着順は作成順の逆で並ぶため、順序を一意にする目的で見出し順を使う）
  2. コンテキスト 1 で見出し順の一覧を開き、検索欄で `e2e-nav` に絞り込んでから `e2e-nav-b` の詳細を開く（以降のナビ・戻りリンクには `sort=headword` と `q=e2e-nav` が引き継がれる）
  3. 同一ユーザー（test1）で 2 つ目の context を `newContext` + `login` で開き（別端末相当。意図的な同一ユーザー 2 context であり「1 ユーザー 1 context」規約の別ユーザー混入防止とは別件。単語は owner スコープのため別ユーザーでは削除できない）、`e2e-nav-c` を削除する
  4. コンテキスト 1 で詳細ヘッダの戻るリンク（`ScreenHeader`、`aria-label="戻る"`）から一覧へ戻り、`e2e-nav-a` / `e2e-nav-b` / `e2e-nav-d` が見えて `e2e-nav-c` が無いことを確認する（戻り href は `/words?q=e2e-nav&sort=headword` だが、`buildWordsHref` の組み立て順とツールバー操作で到達した URL のクエリ順は異なりうるため、文字列一致でなく `q`・`sort` を個別に検査する）
  5. `e2e-nav-b` を開き直し、「次へ」の href が `e2e-nav-d` を指すこと・「次へ」で遷移して `e2e-nav-d` の詳細が表示される（404 にならない）ことを確認する
  - 対象経路はリンク遷移のみ（ブラウザバック復元経由の stale 表示は前提節のとおり許容済みで対象外）。変更後の期待挙動のスモーク確認であり、変更前コードとの差分判別は目的にしない（この経路は変更前でもプリフェッチ対象外のため同じ結果になる。プリフェッチが飛ばなくなったこと自体は `prefetch={false}` のコードレビューと遷移中フィードバック確認の整理で担保する）
  - 実施後に `cleanupWordsByPrefix("e2e-nav-")` で後始末し、検証スクリプトは確認後に削除する（`package.json` には追加しない）
- [ ] 恒久の自動テスト・integration テストは追加していない（[02-cleanup-and-verify.md](../../design/word-nav-no-prefetch/02-cleanup-and-verify.md) 決定 4）

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
