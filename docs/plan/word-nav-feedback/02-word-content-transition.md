# 02. word-content-transition

状態: **完了**（2026-08-06）　PR: https://github.com/ganzinn/deja-word/pull/204

## 目的

ページ／ダイアログ共通の遷移中フィードバック表示コンポーネント `WordContentTransition`（前の単語を残した淡色化＋到着時の方向スライド）と、方向→アニメクラスの純関数を追加する。未参照モジュールの先行追加であり、このチケット単体では画面挙動は変わらない（配線は 03・04）。

スコープ外: ページ・ダイアログへの配線（チケット 03・04）。pending 検知（ページ／ダイアログ各自で実装。共通化しないことが設計確定）。

## 依存チケット

なし（並行着手可）

## 前提（設計決定の再掲）

- ローディング表示は「前の単語を残したコンテンツ淡色化」（見出し語含む領域の半透明化）。**150ms 程度**の短いフェードで開始し、待ちがほぼ無い遷移では実質見えない。新しい単語の到着で復帰する（[01-ux-spec.md](../../design/word-nav-feedback/01-ux-spec.md) 決定 3）
- 到着時スライドは**数百 ms 以内**の一方向スライド。「次へ」は新コンテンツが**右から進入**、「前へ」は**左から進入**。動かすのはコンテンツ領域のみ（[01-ux-spec.md](../../design/word-nav-feedback/01-ux-spec.md) 決定 4）
- `prefers-reduced-motion: reduce` ではスライドを再生せず即時差し替え。淡色化（opacity のみ）は維持する（[01-ux-spec.md](../../design/word-nav-feedback/01-ux-spec.md) 決定 6）
- 実装は **tw-animate-css + key 差し替え**: コンテンツを `key={contentKey}` で差し替え、mount 時に `motion-safe:animate-in motion-safe:slide-in-from-{right|left}-* motion-safe:fade-in`（**200ms 程度**）を付与する。旧コンテンツの退場アニメーションは付けない。`experimental.viewTransition` は有効化しない（[02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 1）
- 共通化はこの表示コンポーネント 1 つに限定。**仮称 `WordContentTransition`、`src/components/` 配置**。props は **`pending: boolean` / `direction: "prev" | "next" | null` / `contentKey: string` / `children`**。`direction` が null ならアニメなし（[02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 5）
- **方向→クラス名のマッピングは純関数として切り出し、unit テストで固定**する（[02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 5）
- E2E で検証できるよう、**pending / direction を `data-*` 属性として出力**する設計にする（[02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 6）
- reduced-motion 対応は `motion-safe:` プレフィックス方式（既存前例: `src/app/quiz/_components/answer-feedback-overlay.tsx`）。`motion-safe:` だけで「reduced-motion ではスライドなし・淡色化のみ」が成立する（[02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 5・調査メモ）

## 実装内容

### 作成: `src/components/word-content-transition.tsx`

`"use client"`。props:

```ts
{
  pending: boolean;
  direction: "prev" | "next" | null;
  contentKey: string;
  children: React.ReactNode;
}
```

- 外側ラッパ: `pending` で opacity を下げる（`transition-opacity` + 150ms 程度）。`data-pending`（pending 時のみ付与）と `data-direction`（direction 非 null 時に `"prev"` / `"next"`）を出力する
- 内側要素: `key={contentKey}` で差し替え、`slideInClass(direction)` のクラスを付与（新しい key の mount 時にスライドが再生される）
- 淡色化の opacity 値・スライド距離は目視で調整してよい（設計で固定なのは 150ms 程度のフェード / 200ms 程度のスライドという時間感覚と方向のみ）

### 作成: `src/components/word-content-transition-classes.ts`

```ts
export type WordNavDirection = "prev" | "next";
export function slideInClass(direction: WordNavDirection | null): string;
```

- `"next"` → 右から進入（`motion-safe:animate-in motion-safe:slide-in-from-right-* motion-safe:fade-in` ＋ duration 指定）
- `"prev"` → 左から進入（同 `slide-in-from-left-*`）
- `null` → `""`（アニメなし）
- アニメーション系クラスにはすべて `motion-safe:` プレフィックスを付ける

### 作成: `src/components/word-content-transition-classes.unit.test.ts`

### 変更（必要時）: `src/app/globals.css`

tw-animate-css の既存ユーティリティで足りない場合のみ追記する（[02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 1）。

## 完了条件（Definition of Done）

- [ ] unit テスト: `slideInClass` の 3 分岐（`"next"` → slide-in-from-right 系、`"prev"` → slide-in-from-left 系、`null` → 空文字）をクラス列で固定し、アニメ系クラス全てに `motion-safe:` が付くことを検証する（[02-architecture.md](../../design/word-nav-feedback/02-architecture.md) 決定 6）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る
- [ ] `data-pending` / `data-direction` の出力（付与位置・値）を PR レビューで JSX から確認する（コンポーネントテストは作らない。`.test.tsx` は実行されない規約のため。実 DOM での検証は 03・04 の E2E が担う）
- [ ] アニメーションの質感（速度・距離）の目視確認は配線後のチケット 03・04 で行う（このチケットでは単体の見た目確認はしない）

## 競合注意

- `src/components/word-content-transition.tsx`・`word-content-transition-classes.ts`: チケット 03・04 が import して使う。マージ後に仕様不足が見つかった場合は 03・04 内で直接変更せず、本チケットの追加改修として切り出す（plan ハブ「共有物・競合点」参照）

## 実装メモ

1. **`data-pending` の値は `"true"` に固定**（付与時のみ。非 pending 時は属性ごと消える）。リポジトリ既存の慣行（`src/app/settings/occurrences/_components/auto-number-toggle.tsx` の `data-disabled={disabled ? "true" : undefined}`）に合わせた。03・04 の E2E は `[data-pending="true"]` / `[data-pending]` のどちらでも観測できる。
2. **`data-pending` / `data-direction` は外側ラッパ（淡色化する要素）に出力**。内側の keyed 要素ではない。E2E のセレクタはこの要素（`children` の親の親）を指す。
3. **外側ラッパに `overflow-x-clip` を付けた**（計画に明記のない実装判断）。スライドで一時的に横へはみ出す 2rem 分で横スクロールバーが出るのを防ぐため。`hidden` ではなく `clip` を選び、スクロール容器を作らず縦スクロール・`sticky` の挙動を変えないようにしている。
4. **チューニング値**: 淡色化 `opacity-50` ＋ `transition-opacity duration-150`、スライド距離 `-8`（2rem）＋ `duration-200`。設計が固定しているのは時間感覚と方向のみ。03・04 の目視で不都合（`sticky` ヘッダやポップオーバーの見切れ等）や調整の必要が出た場合は、**03・04 内で直接直さず本チケットの追加改修として切り出す**（plan ハブ「共有物・競合点」）。
5. **`src/app/globals.css` は変更なし**。`slide-in-from-{right,left}-8` は tw-animate-css 1.4.0 の `@utility slide-in-from-{right,left}-*`（spacing スケール、`-8` = 2rem）で提供済みのため追記不要（`node_modules/tw-animate-css/dist/tw-animate.css` で確認）。
6. **`duration-200` が animation に効く根拠**: tw-animate-css の `--animate-in` は `var(--tw-animation-duration, var(--tw-duration, .15s))` を使い、Tailwind の `duration-200` が `--tw-duration` を設定するため（既存前例 `answer-feedback-overlay.tsx` と同じ書き方）。外側の `duration-150` は `--tw-duration` が `inherits: false` で登録されているため内側へ漏れない。
7. **`WordNavDirection` は本チケットで新規定義**。既存の `src/components/use-swipe-nav.ts` に同値の `SwipeNavDirection`（`"prev" | "next"`）があるが関心が別（フリック判定 vs 表示アニメ）なので統合していない。03 で両者を繋ぐ際は代入互換のためそのまま渡せる。
8. `slideInClass` の戻り値は Tailwind に検出させるため断片を組み立てず完全な文字列リテラルで返している。
