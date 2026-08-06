# 02. 実装方式

状態: **確定**（2026-08-06）

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- ローディング表示（淡色化）と検知後スライドの両方を実装する。指追従はしない（01 確定）。
- ページとダイアログは体験の文法を統一する。ダイアログは「読み込み中…」差し替えを廃止し、前の単語を表示したまま待つ（01 確定）。
- 淡色化は単語コンテンツ領域（見出し語含む）のみ・150ms 程度のフェード開始。前後ナビ・ヘッダは通常表示（01 確定）。
- 到着時スライドはコンテンツ領域のみ・操作方向へ一方向（数百 ms 以内）。ヘッダ・前後ナビは固定。ボタン押下でも同じ演出（01 確定）。
- 遷移中の多重操作はブロックせず最後勝ち（ページは `router.push` 上書き・ダイアログは応答鮮度判定の現行構造を維持）（01 確定）。
- `prefers-reduced-motion` ではスライドを無効化し淡色化のみ（01 確定）。

## 検討事項リスト

- [x] pending 検知の方式（ページ: `useTransition` / `useLinkStatus`、ダイアログ: 既存 `DetailState` の `loading`）→ 決定 2・決定 4
- [x] スライドアニメーションの実装方式（React `<ViewTransition>` + `experimental.viewTransition` vs 自前 CSS アニメーション）→ 決定 1
- [x] ページ／ダイアログの共通化の構造（何を共有するか: フック・コンポーネント・CSS）→ 決定 5
- [x] ページ側「前へ」「次へ」の `<Link>` の扱い（pending 検知・方向付与のため `router.push` へ寄せるか）→ 決定 2
- [x] ブラウザ対応（iOS Safari / Android WebView での動作・非対応時のフォールバック）→ 決定 1 の採用理由で解消（標準 CSS アニメーションのみで論点消滅）
- [x] テスト戦略（unit で固定する純ロジック・E2E での確認項目）→ 決定 6

## 調査メモ（決定の背景となる現状）

- ページ（`/words/[id]`）: ボタンは `<Link>`（`adjacent-word-nav.tsx`）、フリックは `router.push`（`useSwipeNav` 経由）の 2 系統。コンテンツ領域 `WordDetailView` はサーバ描画で client ラッパなし。
- ダイアログ（`word-detail-dialog.tsx`）: Server Action で取得した応答に `wordId` を埋め、render 時に現在の `wordId` と照合して鮮度判定（最後勝ち）。不一致なら即 `{status:"loading"}` に落とし「読み込み中…」へ差し替わる（01 が廃止を決めた挙動）。
- Next.js 16.2.9 / React 19.2.4。`experimental.viewTransition` は未設定。`<Link transitionTypes>`（v16.2.0〜）と `router.push(href, {transitionTypes})` は同梱ドキュメントに記載あり。`useLinkStatus` は `<Link>` の子孫でのみ使用可能で、ナビ外にあるコンテンツ領域の淡色化には使えない。
- アニメーション基盤: Tailwind v4 + `tw-animate-css` 導入済み（`animate-in` / `slide-in-from-*` / `motion-safe:` が利用可能）。reduced-motion の既存前例は `motion-safe:` プレフィックス方式（`answer-feedback-overlay.tsx`）。

## 議論・決定

### 決定 1: 到着時スライドは自前 CSS アニメーション（tw-animate-css + key 差し替え）で実装する

コンテンツ領域を `key={wordId}` で差し替え、mount 時に操作方向へ応じた `motion-safe:animate-in motion-safe:slide-in-from-{right|left}-* motion-safe:fade-in`（200ms 程度）を付与する。旧コンテンツの退場アニメーションは付けない（即差し替え → 新コンテンツが操作方向から滑り込む）。`experimental.viewTransition` は有効化しない。

採用理由:（2026-08-06 ユーザー判断）
- 安定 API（CSS animation + React の key）のみで完結し、Next/React アップグレードへの追随コストがない（現状の experimental 設定は `serverActions` のみの保守的構成を維持）。
- ページとダイアログを完全に同一の表示コンポーネントで実装でき、01 の「体験の文法統一」が実装レベルでも保証される。
- 入力を一切奪わないため、01 の「多重操作はブロックしない・最後勝ち」と追加ケアなしで整合する。
- 付与クラス・`data-*` 属性を DOM で検証できるためテストが書きやすい。
- 標準 CSS のみなので iOS Safari / Android WebView 含め全ブラウザで確実に動き、フォールバック設計が不要。

却下した代替案:
- **React `<ViewTransition>` + `experimental.viewTransition`**: 公式ガイド（`node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`）に前後ナビの方向スライドがそのまま例示されており、旧退場＋新入場の両方が browser-native に出る。しかし (a) experimental フラグのアプリ全体有効化と `unstable_addTransitionType`（ダイアログ側で必要）への依存、(b) ページ＝ルート遷移／ダイアログ＝state 更新で発火経路が 2 系統に割れる、(c) View Transitions API はトランジション中に画面全体を擬似要素オーバーレイへ置き換えタップを奪うため「最後勝ち」維持に `::view-transition { pointer-events: none }` 等の追加ケアが要る、(d) 擬似要素上のアニメは DOM から検証できず E2E 不能、(e) 非対応ブラウザ・古い WebView ではアニメが出ず実機確認が必要 — の 5 点で見送り。
- **指追従を含むスワイプアニメライブラリ**: 01 で指追従自体を却下済み。

### 決定 2: ページの前後ナビは遷移経路を `router.push` + `useTransition` に単一化する（`<Link>` は prefetch と anchor semantics のために維持）

client 側に単一のナビゲーション関数 `navigate(href, direction)` を設け、ボタン・フリックの両方をこれに寄せる:

- `navigate` は (1) 方向ストア（決定 3）へ `{href, direction}` を記録し、(2) `startTransition(() => router.push(href))` で遷移する。
- ボタンは `<Link>` を維持し、`onNavigate` で `e.preventDefault()` して `navigate` を呼ぶ（クライアント遷移のみ intercept される仕様のため、修飾キー付きクリック・新規タブは通常のリンクとして動く。ビューポート prefetch も `<Link>` のまま効く）。
- フリックは現行どおり `useSwipeNav` のコールバックから `navigate` を呼ぶ（ADR-0085 の判定条件は不変）。
- 淡色化のトリガは `useTransition` の `isPending`。遷移中の連続操作は最後の `router.push` が勝ち（現行挙動維持）、`isPending` は全遷移の完了まで true を保つ。
- 現状 `AdjacentWordNav` と `WordDetailView` は page.tsx（サーバ）直下の兄弟のため、両者を包むページ固有の client コンポーネント（仮称 `WordNavArea`）を新設し、`navigate` / `isPending` をここに置く。ナビとコンテンツラッパ（決定 5 の表示コンポーネント）はその内側に配置して共有する。`WordDetailView` はサーバ描画のまま children として渡す。

採用理由:
- 2 系統に割れていた遷移経路が 1 関数に集約され、pending 検知・方向記録を 1 箇所で行える。
- `useLinkStatus` は `<Link>` の子孫でしか使えず、ナビの外にあるコンテンツ領域の淡色化に届かない（Next 16.2.9 同梱ドキュメントで確認）。
- `startTransition` + `router.push` の pending 検知は同梱ドキュメントに直接の記載はないが、公式ドキュメント（linking-and-navigating.md）が紹介する `react-transition-progress` と同一のパターン。仮に将来のバージョンで `isPending` が遷移を追跡しなくなっても、淡色化が出なくなるだけで遷移機能自体は壊れない。

却下した代替案:
- **`useLinkStatus` でボタン、別機構でフリック**: 検知が 2 機構に割れる上、上記のとおりコンテンツ領域の淡色化に使えない。
- **ボタンを `<button>` + `router.push` に変える**: 経路単一化は同じだが、`<Link>` のビューポート prefetch（03 トピックの土台）と anchor semantics（新規タブ・URL コピー）を失う。
- **自前 pending state（操作時に set・到着時にクリア）**: 遷移の中断・失敗時に state が残留する。`useTransition` なら React が遷移のライフサイクルごと管理する。

### 決定 3: 方向の受け渡しは、ページ＝client モジュールスコープのストア、ダイアログ＝ローカル state

- **ページ**: ルート遷移でコンポーネントが差し替わるため React state では方向を新画面へ運べない。client モジュールスコープの小さなストア（`{ href, direction }` を保持）を設け、`navigate`（決定 2）が書き込み、到着後の新ページの `WordNavArea`（決定 2）が mount 時に「現在の URL がストアの `href` と一致する場合のみ」方向を消費（読み取り＋クリア）し、表示コンポーネント（決定 5）へ props で渡す。
  - 一致しない場合（直接 URL アクセス・ブラウザ back/forward・リロード）は方向なし＝スライドなしで表示する。ブラウザ操作でスライドが出ないのは仕様（操作方向の可視化はアプリ内ナビ操作に対するフィードバックのため）。
- **ダイアログ**: コンポーネントが継続するため通常のローカル state で足りる。prev/next ボタン・フリックのハンドラが方向を set してから `onNavigate(id)` を呼ぶ。親（QuizFlow）の API 変更は不要。

採用理由:
- ルート間の方向伝達に必要な最小の仕組みで、URL 照合により誤発火（無関係な遷移でのスライド）を防げる。
- 却下した代替案:
  - **`src/app/words/layout.tsx` を新設して Context provider を置く**: layout は `words` セグメントで維持されるため state は運べるが、単語一覧・新規作成ページまで provider に巻き込む割に、得られるものはモジュールストアと同じ。
  - **URL クエリパラメータで方向を渡す**: URL が汚れ、リロード・共有時に方向が残留してスライドが誤発火する。

### 決定 4: ダイアログは最後の ready 応答を保持し、淡色化表示に切り替える

`wordId` 不一致で即 `{status:"loading"}` に落とす現行の導出を変更する:

- 最後に表示した ready 応答（単語詳細＋ブックマーク状態）を保持し、現在の `wordId` と応答が不一致の間は**その保持内容を淡色化して表示**する（pending 扱い）。
- 保持内容が無い場合（ダイアログを開いた直後の初回ロード）は前の単語が存在しないため、現行どおり「読み込み中…」を表示する。01 の「差し替え廃止」は前後ナビ中の挙動についての決定であり、初回は対象外。
- error は現行どおりエラー表示。応答鮮度の key 照合（最後勝ち）と effect の `cancelled` フラグは現行構造を維持する。
- この表示 state の導出（保持応答・現 `wordId`・エラーから「表示内容＋pending フラグ」を決める）は純関数として切り出し、unit テストで固定する。

採用理由: 01 の「前の単語を表示したまま待つ」を、既存の鮮度判定構造（最後勝ち）を壊さず最小の変更で満たせる。
却下した代替案: **取得処理を `useTransition` に載せ替えて pending を取る**: ページ側と機構が揃うように見えるが、ダイアログの pending は「応答鮮度」という既存のドメインロジックから導出でき、遷移機構を持ち込むと二重定義になる。

### 決定 5: 共通化は表示コンポーネント 1 つに限定する（pending 検知は各自）

- 共有するのは淡色化＋スライドの表示コンポーネント（仮称 `WordContentTransition`、`src/components/` 配置）1 つ: props は `pending: boolean` / `direction: "prev" | "next" | null` / `contentKey: string` / `children`。
  - `pending` → コンテンツ淡色化（opacity を 150ms 程度の transition で下げる。01 確定の値）。
  - `contentKey` を内部要素の `key` に用い、新しい key の mount 時（ページ: ルート遷移での新規 mount、ダイアログ: `wordId` の変化）に `direction` に応じた `motion-safe:` 付き slide-in クラスを付与する（`prefers-reduced-motion` ではスライドなし・淡色化のみ、が `motion-safe:` だけで成立する）。`direction` が null ならアニメなし。
  - 方向→クラス名のマッピングは純関数として切り出し、unit テストで固定する。
- pending 検知はページ（`useTransition`、決定 2）とダイアログ（応答鮮度からの導出、決定 4)で共通化しない。見た目は同じでも pending の意味・出所（ルート遷移の進行中 vs 応答の鮮度）が異なり、変更理由が別。

採用理由: 01 の「体験の文法統一」を担保するのは見た目（淡色化・スライド・時間感覚）であり、そこだけを 1 コンポーネントに凝集させれば十分。検知側まで共通化すると異なる関心を 1 つの抽象に押し込むことになる。
却下した代替案: **pending 検知まで含めた共通フック**: ページはルート遷移・ダイアログは state 更新で、ライフサイクルも失敗系も異なる。無理に共通化すると双方の都合が漏れ出す。

### 決定 6: テスト戦略 — 純関数 unit + E2E は DOM 属性確認

- **unit（`*.unit.test.ts`）**:
  - 方向→アニメクラスのマッピング純関数（決定 5）。
  - ダイアログ表示 state の導出純関数（決定 4: 保持応答・現 `wordId`・エラー → 表示内容＋pending）。
  - `resolveSwipeNavDirection` は既存テストあり・変更なし。
- **E2E（e2e-verify スキルのハーネス、目視併用）**:
  - prev/next 操作（ボタン・フリック各 1 回）→ 遷移中にコンテンツ領域へ淡色化状態（`data-pending` 等の属性で表現し検証可能にする）が付くこと。
  - 到着後、新コンテンツに方向に応じたスライドクラスが付くこと。
  - ローカルは遅延が小さく pending 状態の目視・捕捉が難しいため、必要に応じて CDP の network throttling で Neon 相当の遅延を模す。
  - アニメーションの質感（速度・距離）自体は目視確認とする。

採用理由: アニメーションの見た目そのものは自動検証に向かないため、「状態の導出」と「DOM への反映」までを自動化の境界とする。表示コンポーネントが pending / direction を `data-*` 属性として出力する設計にすることで、E2E の検証点を安定させる。
却下した代替案: **スクリーンショット比較によるアニメ検証**: タイミング依存で flaky になりやすく、質感の判定は結局目視になる。
