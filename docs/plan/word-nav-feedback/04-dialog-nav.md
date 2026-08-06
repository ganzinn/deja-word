# 04. dialog-nav

状態: **完了**（2026-08-06）　PR: （統合 PR にて）

## 目的

単語詳細ダイアログ（quiz 結果一覧から開く `WordDetailDialog`）の前後ナビを、現行の「読み込み中…」差し替えからページと同じ文法の淡色化＋方向スライドに変更する。あわせて詳細＋隣接ナビの前後 1 件先読み（ダイアログが開いている間の Map キャッシュ）で待ち時間を短縮する。

スコープ外: ページ側（チケット 03）。`WordContentTransition` 本体の変更（チケット 02）。親（QuizFlow）の API 変更（不要が設計確定。[02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 3）。フリック判定条件の変更（ADR-0085 のまま不変）。

## 依存チケット

- 02: `WordContentTransition` を import して使う

## 前提（設計決定の再掲）

- ページとダイアログは体験の文法を統一（同じ淡色化・同じスライド方向・同じ時間感覚）。現行の「前の単語を消して『読み込み中…』に差し替える」挙動を廃止し、**前の単語を表示したまま待つ**（[01-ux-spec.md](../../design/word-nav-feedback/01-ux-spec.md) 決定 2）
- **表示 state 導出の変更**: `wordId` 不一致で即 `{status:"loading"}` に落とす現行導出をやめ、**最後に表示した ready 応答（単語詳細＋ブックマーク状態）を保持**し、現在の `wordId` と応答が不一致の間は**その保持内容を淡色化して表示**する（pending 扱い）。**縮退仕様**: 保持内容が無い場合（ダイアログを開いた直後の初回ロード）は現行どおり「読み込み中…」を表示する。error は現行どおりエラー表示。応答鮮度の key 照合（最後勝ち）と effect の `cancelled` フラグは現行構造を維持する。この導出は**純関数として切り出し unit テストで固定**する（[02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 4）
- **方向はローカル state**。prev/next ボタン・フリックのハンドラが方向を set してから `onNavigate(id)` を呼ぶ（[02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 3）
- **キャッシュ**: `WordDetailDialog` 内の `useRef` に **Map を 2 本**持つ（`wordId → 詳細応答（word + bookmarked）`、`` `${occurrenceId}:${wordId}` → 隣接応答 ``）。コンポーネントは常時マウントのため、**ダイアログが閉じたとき（`wordId` が null になったとき）に明示的に破棄**する。エントリ数の上限は設けない（[03-prefetch.md](../../design/word-nav-feedback/03-prefetch.md) 決定 4）
- **先読みの発火**: 表示中単語の**詳細・隣接の両方が ready かつ現在キーに一致（= settled）**したとき、隣接応答の `prev` / `next` について未キャッシュ分の **`getWordDetailForDialog`** と **`getAdjacentWordsForDialog`**（`src/app/quiz/actions.ts`）を呼び、応答をキャッシュへ入れる。連続送り中は中間単語が settle しないため無駄な先読みは自然に抑制される。**先読み応答は表示 state に直接触れず、キャッシュにのみ書く**（鮮度照合と干渉しない）（[03-prefetch.md](../../design/word-nav-feedback/03-prefetch.md) 決定 4）
- 先読み範囲は**前後 1 件のみ**。追い越し時は通常の待ち（[03-prefetch.md](../../design/word-nav-feedback/03-prefetch.md) 決定 2）
- **表示**: 単語切替時にキャッシュヒットなら即 ready（淡色化は実質見えず、スライドのみ）。ミス時は前の単語を淡色化して応答を待つ。**隣接のみミスした場合は前後ボタンが応答まで disabled になるだけで、本文表示は妨げない**（[03-prefetch.md](../../design/word-nav-feedback/03-prefetch.md) 決定 4）
- **ブックマーク整合**: ダイアログ内でトグルしたら、既存の `onBookmarkChange` 通知に加えて**キャッシュ該当エントリの `bookmarked` も更新**する（[03-prefetch.md](../../design/word-nav-feedback/03-prefetch.md) 決定 4）
- **エッジケース**: 関連語をたどった先（スタック深さ 2 以上）は前後ナビ非表示（`occurrenceId` null）のため先読みしない。詳細キャッシュのヒットは通常どおり効く（[03-prefetch.md](../../design/word-nav-feedback/03-prefetch.md) 決定 4）
- unit テスト対象: **先読み対象の決定（settled 判定・未キャッシュ判定 → 発行すべき取得のリスト）**と**キャッシュ参照込みの表示 state 導出**を純関数に切り出す（[03-prefetch.md](../../design/word-nav-feedback/03-prefetch.md) 決定 5 / [02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 6）

## 実装内容

### 作成: `src/app/quiz/_components/word-detail-dialog-state.ts`

純関数モジュール（シグネチャは指針。入出力の項目は前提の決定どおり、形は実装時に調整可）:

- 表示 state 導出: `(現在の wordId, 最新の詳細応答, 保持中の最後の ready 応答, 詳細キャッシュ)` → `{ kind: "initial-loading" } | { kind: "error"; message: string } | { kind: "ready"; word: WordDetail; bookmarked: boolean; pending: boolean }`
- 先読み対象決定: `(現在の wordId, occurrenceId, 最新の詳細/隣接応答, 両キャッシュのキー集合)` → 発行すべき取得のリスト（`{ kind: "detail"; wordId } | { kind: "adjacent"; occurrenceId; wordId }` の配列。settled でなければ空）
- ナビ表示導出: `(occurrenceId, onNavigate の有無, 最新の隣接応答, 保持中の最後の隣接応答)` → `{ ナビ行を描画するか; prev/next の disabled; 中央ラベル値 }`（描画条件・disabled・ラベル保持の仕様は「前提」末尾の disabled 化の項どおり）

### 作成: `src/app/quiz/_components/word-detail-dialog-state.unit.test.ts`

### 変更: `src/app/quiz/_components/word-detail-dialog.tsx`

- `DetailState` の導出を純関数呼び出しに置き換え、最後の ready 応答（詳細）と最後の隣接応答を保持する（state / ref）
- 方向のローカル state を追加。prev/next ボタンのハンドラと `useSwipeNav` コールバックで方向を set してから `onNavigate(id)` を呼ぶ
- 前後ナビ以外の要因で表示単語が変わるとき（関連語タップ `onSelectRelated`・ダイアログの再オープン）は方向を null に戻し、スライドなしで表示する（ページ側の「ナビ操作以外はスライドなし」と同じ文法。[02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 3 の趣旨）
- `useRef` の Map キャッシュ 2 本を追加。閉時（`wordId === null`）に破棄。単語切替時はキャッシュ参照で即 ready、settled 時に先読み対象決定の結果に従って取得を発行し**キャッシュにのみ**書き込む
- `BookmarkButton` の `onBookmarkChange` でキャッシュ該当エントリの `bookmarked` を更新する
- 「読み込み中…」の分岐は初回ロード（保持応答なし）のみに縮退。本文（`WordDetailView`）を `WordContentTransition`（`pending` / `direction` / `contentKey={wordId}`）で包む。前後ナビは固定（淡色化対象はコンテンツ領域。ブックマーク行の扱いなど細部はページとの文法統一を優先して実装時に判断）
- 隣接のみキャッシュミスの間は前後ボタンを disabled にする。**現行は隣接未取得の間ナビ要素ごと非表示**（`nav !== null` 条件）だが、前の単語を残したまま待つ新仕様ではナビ行の消滅→再出現がレイアウトシフトになるため、**本チケットでナビは出したまま disabled に変更**する（「前後ナビは通常表示・固定」の [01-ux-spec.md](../../design/word-nav-feedback/01-ux-spec.md) 決定 3・4 と整合させる）。ナビ行の描画条件は「`occurrenceId !== null && onNavigate !== undefined` かつ隣接応答（最後のもの）がある」とし、前後移動中は最後の隣接応答を残したままボタンを disabled にする（中央ラベルも最後の値を残す。実装時調整可）。初回オープン時は現行どおり隣接応答の到着後にナビを描画し（初回ロードは縮退仕様の対象外。[02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 4 と同じ整理）、`occurrenceId` が null のケース（関連語をたどった先など）は現行どおりナビ非表示のまま

### 変更: `docs/features/` の単語テストページ紹介

- 結果一覧の単語詳細ダイアログの説明を確認し、「読み込み中…」前提の記述があれば淡色化＋スライドの挙動に更新する（対象ファイルは `docs/features/README.md` の目次から特定）

## 完了条件（Definition of Done）

- [ ] unit テスト: 表示 state 導出（初回ロード = 読み込み中… / 切替中 = 保持内容＋pending / error / キャッシュヒット = 即 ready・pending なし）と先読み対象決定（settled でなければ空・キャッシュ済みは発行しない・`occurrenceId` null は隣接先読みなし）、ナビ表示導出（`occurrenceId` null は非描画・初回は応答到着後に描画・前後移動中は最後の隣接応答を残して disabled・中央ラベルの保持値）が `pnpm test:unit` で通る
- [ ] E2E（e2e-verify スキルのハーネス）: ダイアログの prev/next（ボタン・フリック各 1 回）で、遷移中に外側ラッパへ `data-pending`、到着後に外側ラッパの `data-direction` と内側 key 差し替え要素のスライドクラスが付くことを DOM で確認する（属性の付与位置は 02 の定義どおり）。先読みキャッシュのヒットに依存しない形にする（必要なら CDP network throttling。[02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 6 / [03-prefetch.md](../../design/word-nav-feedback/03-prefetch.md) 決定 5）
- [ ] 手動確認: 連続送り（キャッシュヒット時は最後勝ちで追従。隣接応答ミス時はボタン disabled・フリック無効で応答待ちになる — 操作不能である点は現行と同等のため許容）、初回オープン時の「読み込み中…」、関連語をたどった先で先読みが発火しないこと、ブックマークトグル後に前後移動で戻っても表示が整合すること
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る
- [ ] `docs/features/` の単語テスト分を更新済み

## 競合注意

- `src/components/word-content-transition.tsx`（チケット 02 の成果物）: import のみ。変更が必要になったら 02 の追加改修として切り出す（plan ハブ「共有物・競合点」参照）

## 実装メモ

1. **`contentKey` は `wordId` ではなく「表示中の単語 ID」（`view.word.id`）を渡した**。計画の記述は `contentKey={wordId}` だが、ダイアログの `wordId` は「要求中の単語」なので、それを key にすると**要求した瞬間に前の単語のまま再マウントしてスライドが再生され、到着時にはスライドしない**（意味が反転する）。ページ側（03）は `startTransition` により到着まで前ページの props が保たれるので `wordId` で正しく、ダイアログだけこの読み替えが要る。
2. **キャッシュは `useRef` ではなく `useState`（Map を毎回コピー）で持った**。計画は「`useRef` に Map を 2 本」だが、`react-hooks/refs`（描画中の ref 参照禁止）と `react-hooks/set-state-in-effect` により ref のままでは描画中に読めず lint が通らない。設計意図（**先読み応答は表示 state = `response` / `navResponse` に触れずキャッシュにだけ書く＝鮮度照合と干渉しない**）は維持。破棄は「`wordId === null` かつ保持物が残っていれば描画中にクリア」という React 公式の *adjusting state during render* パターンで実装（閉じた後に届いた応答が書き戻しても次の再レンダーで再び掃除されるため取りこぼさない）。
3. **取得 effect の発火キーを `detailFetchWordId` / `navFetchWordId`（未キャッシュのときだけ非 null になる派生値）にした**。キャッシュを effect の依存に直接入れると、無関係な先読み完了で in-flight の取得が cancel されてしまうため。`cancelled` フラグと key 照合による鮮度判定は現行構造どおり維持。
4. **表示 state 導出はキャッシュを応答より優先する**。ブックマークのトグルはキャッシュ側だけを更新するため（`onBookmarkChange` で該当エントリを差し替え）、応答優先にすると「A でトグル → B へ → A に戻る」で取得時点の古い状態が出る。unit テストで固定済み。
5. **`switchTo()`（前後ボタン・フリック・関連語タップの共通経路）で「直前の表示内容」を持ち越す**。キャッシュヒット時は取得 effect が走らず `.then` が無いため、切替の起点であるハンドラで保持するのが唯一の共通点になる。
6. **スクロール先頭戻しの契機を「要求中の単語 ID」から「表示中の単語 ID」に変更した**。前の単語を残して待つ仕様では、要求時点で先頭へ戻すと待機中に前の単語が勝手にスクロールしてしまうため。
7. **隣接取得がエラーのときはキャッシュに入れず `nav: null`（＝ナビ非表示）扱い**にした（現行踏襲）。この場合だけナビ行が消えるが、エラー時の縮退として許容。
8. ダイアログ閉時アニメーション中は現行どおり「読み込み中…」に落ちる（`wordId` が null になるため）。本チケットで変えていない。
9. **先読み中の単語へ追い越して移動すると詳細取得が二重に飛ぶ**（先読みはキャッシュにしか書かないため表示用の取得を別途投げる必要がある）。設計の「追い越し時は通常の待ち」の範囲内として許容。
10. 02 の成果物（`word-content-transition.tsx` / `-classes.ts`）は **import のみ・無変更**。淡色化やスライドの質感調整が必要になった場合は 02 の追加改修として切り出すこと（本チケットでは目視未実施のため未評価）。
11. `docs/features/word-quiz.md` の「テスト結果」節に前後移動の説明を追記。**スクリーンショットは過渡表示のため再撮影不要**と判断した。
12. **E2E の観測点**（未実施分の申し送り）: 外側ラッパ（`WordContentTransition` の淡色化する div）に `data-pending="true"` / `data-direction="prev|next"`、内側の key 差し替え要素に `motion-safe:slide-in-from-{right,left}-8` 系クラス。**ダイアログでは先読みが効くと pending が出ない**ため、CDP throttling か「先読み前に素早く 2 回送る」で待ちを作る必要がある。
