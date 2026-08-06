# 03. page-nav

状態: **完了**（2026-08-06）　PR: （統合 PR にて）

## 目的

単語詳細ページ（`/words/[id]`）の前後ナビに遷移中フィードバックを配線する。遷移経路を `navigate`（`startTransition` + `router.push`）に単一化し、`isPending` による淡色化と方向ストア経由の到着時スライドを `WordContentTransition` で表示する。あわせて前後 `<Link>` に `prefetch={true}` を付け、本番の待ち時間自体も短縮する。

スコープ外: ダイアログ側（チケット 04）。`WordContentTransition` 本体の変更（チケット 02）。Server Action への `revalidatePath` 追加（チケット 01）。フリック判定条件の変更（ADR-0085 のまま不変）。

## 依存チケット

- 01: `prefetch={true}` は `revalidatePath` 追加（stale 表示対策）が前提整備のため、01 のマージ後に入れる（[03-prefetch.md](../../design/word-nav-feedback/03-prefetch.md) 決定 3）
- 02: `WordContentTransition` と `WordNavDirection` 型を import して使う

## 前提（設計決定の再掲）

- **遷移経路の単一化**: client 側に単一のナビゲーション関数 **`navigate(href, direction)`** を設け、(1) 方向ストアへ `{href, direction}` を記録し、(2) `startTransition(() => router.push(href))` で遷移する。ボタンは `<Link>` を維持し **`onNavigate` で `e.preventDefault()`** して `navigate` を呼ぶ（クライアント遷移のみ intercept される仕様のため、修飾キー付きクリック・新規タブは通常のリンクとして動く）。フリックは現行どおり `useSwipeNav` のコールバックから `navigate` を呼ぶ。淡色化のトリガは `useTransition` の **`isPending`**（[02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 2）
- **`WordNavArea`（仮称）**: 現状 `AdjacentWordNav` と `WordDetailView` は page.tsx（サーバ）直下の兄弟のため、両者を包むページ固有の client コンポーネントを新設し、`navigate` / `isPending` をここに置く。`WordDetailView` はサーバ描画のまま children として渡す（[02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 2）
- **方向ストア**: client モジュールスコープに `{ href, direction }` を保持する小さなストア。`navigate` が書き込み、到着後の新ページの `WordNavArea` が mount 時に「**現在の URL がストアの `href` と一致する場合のみ**」方向を消費（読み取り＋クリア）して表示コンポーネントへ props で渡す。不一致（直接 URL アクセス・ブラウザ back/forward・リロード）は方向なし＝スライドなしで表示する（仕様）（[02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 3）
- **多重操作は最後勝ち**（ブロックしない）。遷移中の連続操作は最後の `router.push` が勝ち、`isPending` は全遷移の完了まで true を保つ（[01-ux-spec.md](../../design/word-nav-feedback/01-ux-spec.md) 決定 5 / [02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 2）
- **`prefetch={true}`**: 前後 `<Link>` 2 箇所に付与する。dynamic ルート（`loading.tsx` なし）はデフォルトではプリフェッチされないが、`prefetch={true}` でフルルートをプリフェッチし、ルーターキャッシュに static 扱い（既定 5 分）で保持される。手動の `router.prefetch` は書かない。前後ナビは常時ビューポート内のため発火専用コードは不要。フリックはボタンと**同一の href 文字列（`buildWordDetailHref` の出力）**を使うためキャッシュを共有する。**自動プリフェッチは production ビルドのみで動作**し、dev で効かないのは仕様（[03-prefetch.md](../../design/word-nav-feedback/03-prefetch.md) 決定 1）
- プリフェッチ範囲は前後 1 件のみ。連続送りで未プリフェッチの単語に到達した場合は通常の待ち（淡色化が可視化される）（[03-prefetch.md](../../design/word-nav-feedback/03-prefetch.md) 決定 2）
- **E2E はプリフェッチに依存させない**。効果確認は `pnpm build && pnpm start` で network タブを目視（[03-prefetch.md](../../design/word-nav-feedback/03-prefetch.md) 決定 5）
- E2E の検証観点: prev/next 操作（ボタン・フリック各 1 回）→ 遷移中にコンテンツ領域へ淡色化状態が付くこと、到着後に新コンテンツへ方向に応じたスライドクラスが付くこと。DOM 検証は 02 が定義する `data-*` 属性で行う（`data-pending` / `data-direction` は `WordContentTransition` の外側ラッパ、スライドクラスは内側の key 差し替え要素に付く）。ローカルは遅延が小さく pending の捕捉が難しいため、必要に応じて CDP の network throttling で Neon 相当の遅延を模す（[02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 6）

## 実装内容

### 作成: `src/app/words/[id]/_components/word-nav-area.tsx`

`"use client"`。props 案（実装時に調整可）:

```ts
{
  prevHref: string | null;
  nextHref: string | null;
  centerLabel: string;
  wordId: string;
  children: React.ReactNode; // サーバ描画の WordDetailView
}
```

- `useTransition` を持ち、`navigate(href, direction)` を実装（方向ストアへ記録 → `startTransition(() => router.push(href))`）
- mount 時に方向ストアの `consumeNavDirection(現在の URL)` で方向を取得する。現在の URL は `buildWordDetailHref` の出力（クエリ含む href 文字列）と比較できる形で復元する（`usePathname` + `useSearchParams`。実装時に確認）
- `AdjacentWordNav` に `navigate` を渡し、`children` を `WordContentTransition`（`pending={isPending}` / `direction` / `contentKey={wordId}`）で包む

### 作成: `src/app/words/[id]/_components/word-nav-direction-store.ts`

client モジュールスコープのストア:

```ts
import type { WordNavDirection } from "@/components/word-content-transition-classes"; // 型は 02 の定義を使う（二重定義しない）

export function setNavDirection(href: string, direction: WordNavDirection): void;
export function consumeNavDirection(currentHref: string): WordNavDirection | null;
```

- `consumeNavDirection` は保持中の `href` が `currentHref` と一致する場合のみ方向を返してクリアする。不一致なら null（古いエントリは次の `setNavDirection` で上書きされる）
- DB 非依存のためストア挙動の unit テスト（`word-nav-direction-store.unit.test.ts`）を併設する

### 変更: `src/app/words/[id]/_components/adjacent-word-nav.tsx`

- props に `navigate: (href: string, direction: "prev" | "next") => void` を追加し、内部の `useRouter` / `router.push` 直接呼びを廃止する
- `useSwipeNav` のコールバック: `onPrev` → `navigate(prevHref, "prev")`、`onNext` → `navigate(nextHref, "next")`
- 前後 `<Link>`: `prefetch={true}` を付与し、`onNavigate` で `e.preventDefault()` → `navigate(href, direction)` を呼ぶ

### 変更: `src/app/words/[id]/page.tsx`

- `AdjacentWordNav` と `WordDetailView` を `WordNavArea` で包む形に組み替える（`WordDetailView` はサーバ描画のまま children で渡す）
- 前後ナビを描画しないケース（掲載箇所コンテキストなし・隣接情報なしで現行がナビを出さない条件）は現行どおり `WordDetailView` を直接描画してよい（フィードバック対象は前後ナビ操作のみ）
- 現状 `WordDetailView` は `TtsFallbackProvider` に包まれているため、children に含めて渡す際の階層を実装時に確認する

### 変更: `docs/features/` の単語詳細ページ紹介

- 前後ナビの遷移中フィードバック（淡色化・方向スライド）の説明を確認・追記する。静止画スクリーンショットは過渡表示のため原則影響なし（対象ファイルは `docs/features/README.md` の目次から特定）

## 完了条件（Definition of Done）

- [ ] unit テスト: 方向ストア（一致時のみ消費・クリア、不一致時 null）が `pnpm test:unit` で通る
- [ ] E2E（e2e-verify スキルのハーネス）: ボタン・フリック各 1 回の prev/next 操作で、遷移中に外側ラッパへ `data-pending` が付き、到着後に外側ラッパの `data-direction` と内側 key 差し替え要素のスライドクラスが付くことを DOM で確認する。pending が捕捉できない場合は CDP network throttling を使う（[02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 6）
- [ ] E2E がプリフェッチの有無に依存せず成立している（[03-prefetch.md](../../design/word-nav-feedback/03-prefetch.md) 決定 5）
- [ ] 手動確認: 直接 URL アクセス・ブラウザ back/forward でスライドが出ない（方向なし表示、仕様）（[02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 3）
- [ ] 目視: `pnpm build && pnpm start` で前後分のプリフェッチ発火（network タブ）とプリフェッチ命中時の即時遷移、アニメーションの質感を確認する
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る
- [ ] `docs/features/` の単語詳細ページ分を更新済み

## 競合注意

- `src/components/word-content-transition.tsx`（チケット 02 の成果物）: import のみ。変更が必要になったら 02 の追加改修として切り出す（plan ハブ「共有物・競合点」参照）

## 実装メモ

1. **`WordNavArea` の props に `currentHref` を追加した**（計画の props 案に無い）。方向ストアの鍵は `buildWordDetailHref` の出力文字列なので、比較対象もサーバ側で同じ関数から作って渡すのが最も確実。計画が挙げていた `usePathname` + `useSearchParams` からの復元は、クエリの順序・エスケープ（`URLSearchParams` の `+` 変換など）で食い違うリスクがあるうえ `useSearchParams` は Suspense 境界の制約も持ち込むため採らなかった。
2. **方向の消費は「`useState` の遅延初期化 ＋ 描画中の調整（adjusting state during render）」で行う**。遷移でコンポーネントが再マウントされる場合は初期化子が、props だけ差し替わる場合は描画中の調整が拾うので、どちらでも 1 回だけ消費される。`useEffect` での消費は `react-hooks/set-state-in-effect` に触れるうえ 1 フレーム遅れる。React StrictMode（App Router 既定で有効）の二重レンダーは再レンダー用 dispatcher を使うため `useState` 初期化子が二度目に評価されることはなく、消費は取りこぼされない（`react-dom` の `renderWithHooksAgain` を確認済み）。04 と同じ「描画中の state 調整」パターン。
3. **`contentKey` はページ側では `wordId`（＝表示中＝到着した単語 ID）で正しい**。`startTransition` により到着まで前ページの props が保たれるため、04 の実装メモ 1 が指摘した「要求中 ID を key にすると意味が反転する」問題はページ側では起きない。E2E でも到着後にスライドクラスが付くことを確認済み。
4. **`page.tsx` は前後ナビが無いケース（掲載箇所コンテキストなし・隣接情報なし）では従来どおり本文を直接描画する**。`TtsFallbackProvider` ごと `detail` 変数に括り出して両分岐で共有した（`WordNavArea` の `children` にはサーバ描画のまま渡る）。
5. **`ScreenHeader`（上部の見出し語・ブックマーク・編集/削除）は淡色化・スライドの対象外**。チケットの「`children` = サーバ描画の `WordDetailView`」という指定と、04 の「前後ナビは固定・淡色化対象はコンテンツ領域」に合わせた。`WordDetailView` 自身が見出し語 `<h2>` を持つので 01-ux-spec 決定 3 の「見出し語含む領域の半透明化」は満たしている。**ただし遷移中はヘッダのタイトルだけ先に新しい単語へ切り替わる**（本文は前の単語のまま淡色）。気になる場合は別チケットで扱う余地がある。
6. **02 の成果物（`word-content-transition.tsx` / `-classes.ts`）は import のみ・無変更**。淡色化の濃さ・スライド距離の調整が必要になった場合は 02 の追加改修として切り出すこと。
7. **01 の申し送り（並び順に影響する action）について**: 前後ナビの並びは `findAdjacentWordsByOccurrence` がリクエスト毎に算出する。掲載箇所設定の変更で並びが変わったとき、プリフェッチ済みの隣接ページ（最大 5 分）が古い並びを持つ可能性はあるが、表示される単語の中身自体は `revalidatePath` 済みで正しく、並びのズレも次の遷移で解消する。本チケットでは追加対応しない（必要なら別 issue）。
8. **E2E のフリック自動化ノウハウ**: `useSwipeNav` は window の `touchstart` / `touchend` を見るだけなので、合成 `TouchEvent`（`new Touch(...)` を `changedTouches` に載せる）を `page.evaluate` で dispatch すれば再現できる（CDP の `Input.dispatchTouchEvent` は不要）。注意点として、tsx/esbuild の keepNames が `page.evaluate` に渡す関数内の**名前付き関数**へ `__name(...)` を差し込むためブラウザ側で `ReferenceError: __name is not defined` になる。evaluate の中では名前付き関数（`const f = () => {}` 含む）を作らない。
9. 空振り防止（negative control）実施済み: `pending={isPending}` → `false`、`navigate()` から `setNavDirection()` 削除、方向ストアの消費時クリア削除 — いずれも該当アサートが FAIL することを確認して復旧。
10. `docs/features/word-management.md` に前後移動中の挙動を追記。**スクリーンショットは過渡表示のため再撮影不要**と判断した。
