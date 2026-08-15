---
name: e2e-verify
description: deja-word のブラウザ E2E 動作確認を定型手順で行う。system(admin) ログイン・一般ユーザーの用意（既定は使い回し test1@example.com／新規ユーザーの観点が要るときだけ使い捨て）・playwright-core + system Chrome のハーネスを提供し、削除ガード等の end-to-end 検証を再現する。UI 挙動の動作確認・E2E 実施時に参照する。
argument-hint: "[検証対象（省略時は削除ガード）]"
---

# e2e-verify

deja-word のブラウザ E2E を、毎回ゼロから組み直さず**定型ハーネス**で回すためのスキル。認証（system / 一般）とテストデータの後始末を規約化し、実コードの挙動をブラウザで end-to-end に検証する。ハーネス実体は `scripts/e2e/`（`pnpm e2e:*`）にある。代表例は削除ガード検証（`pnpm e2e:guard`。後述の「実行例」）。

DB レベルの検証は integration テスト（`pnpm test:integration`）で足りることが多い。**このスキルは「ブラウザ UI / Server Action を通した挙動」を確かめたいときに使う**（DB だけで足りるなら integration テストを優先）。CI では動かさない（ローカル専用）。

## 前提セットアップ

1. Docker の DB を起動: `docker compose up -d`（コンテナ `deja-word-db`）。
2. スキーマ + シード:  `pnpm db:migrate`（初回/未適用時）→ `pnpm db:seed` → `pnpm db:set-system-password`。
   - `db:seed` は system ユーザー行（id=`system` / `system@deja-word.internal`）を作るが**パスワードは付けない**。`db:set-system-password` が `.env` の `SYSTEM_USER_PASSWORD`（ローカル既定 `demodemo`）で credential を付与する。両方走っていないと admin ログインできない（ハーネスが未整備を検知して中断する）。
3. dev サーバ: `pnpm dev`（既定 `http://localhost:3000`）。
   - **別ポートで起動する場合は `BETTER_AUTH_URL` の併記が必須**（例: `PORT=3100 BETTER_AUTH_URL=http://localhost:3100 pnpm dev`）。省略すると better-auth が Invalid origin で sign-in を拒否する。
   - **起動は Bash ツールの `run_in_background: true` で行い、`&` を付けない**（`&` は許可リストで消せない承認プロンプトになる。出力はツール側が捕捉するのでリダイレクトも不要）。
   - **起動待ちは `pnpm e2e:wait-dev [url]`**（既定 `$E2E_BASE_URL` → `http://localhost:${PORT:-3000}`、timeout 既定 90 秒）、**停止は `pnpm e2e:stop-dev <port>`**（ポート必須。既定値を置くと本体の dev を誤って落とすため）。待ち合わせ・停止をコマンド列で手書きしない（コマンド置換・パイプが承認プロンプトになる）。
4. `pnpm install` 済み（`playwright-core` は devDependency。ブラウザ実体は同梱せず**端末の Google Chrome** を使うので Chrome がインストール済みであること）。

ハーネスは `E2E_BASE_URL` → `BETTER_AUTH_URL` → `http://localhost:${PORT ?? 3000}` の順で接続先を決める。GUI で見たいときは `E2E_HEADED=1` を付ける。

## ユーザーパターン（このスキルの中核）

ヘルパは `scripts/e2e/auth.ts`（ログイン）と `scripts/e2e/db.ts`（用意・後始末）にある。

| パターン | いつ使うか | 用意 | 後始末 |
|---|---|---|---|
| **system（admin）** | 管理機能・system 所有単語の観点。admin 判定は `session.user.id === "system"` のみ | 前提セットアップ済み前提で `login(ctx, SYSTEM_EMAIL, systemPassword())`。`SYSTEM_EMAIL="system@deja-word.internal"` | 不要（共有シード。**削除しない**） |
| **一般① 使い回し＝ test1@example.com【既定】** | 新規ユーザーの観点が不要な一般ユーザー検証すべて。**事前データが要る検証でも、まず test1@example.com でデータを作ってから確認する**（既存ユーザーの観点） | `ensureUser(prisma, TEST_USER1_EMAIL, TEST_USER1_PASSWORD, ...)` で冪等に用意（`test1@example.com` / `testtest`）→ `login(ctx, ...)` | 生成したテストデータのみ prefix 掃除。**ユーザー自体は残す** |
| **一般② 使い回し＝ test2@example.com（他者役）** | **一般ユーザーが 2 人要る**とき（テナント分離・pass-through の「相手役」= 別人格の stranger。①を viewer、②を他者にして混入・漏洩を検証） | `ensureUser(prisma, TEST_USER2_EMAIL, TEST_USER2_PASSWORD, ...)`（`test2@example.com` / `testtest`）→ `login(ctx, ...)` | ①と同じ。**ユーザー自体は残す** |
| **一般 使い捨て＝ 新規ユーザー** | **新規ユーザーの観点がメイン**（サインアップ直後の空状態・空リスト・初回導線など、fresh account でないと再現できない観点）。ユーザー削除を伴う検証でも作るが、そちらは「残骸が残らないか」の副次確認 | `ensureUser(prisma, "e2e-throwaway-<Date.now()>@example.com", ...)`（またはサインアップ UI）で都度作成 | 検証後に `deleteUserByEmail` で削除 |

**原則**: 一般ユーザーは**使い回し（①/②）を既定**とし作成コストを避ける（事前データもまず①で作る）。**使い捨て**は fresh account でないと再現できない観点が本質のときだけ（ユーザー削除検証の残骸チェックは副次用途）。3 人目以降が要る特殊ケースだけ `e2e-<対象>-*@example.com` を都度作成→`deleteUserByEmail` で撤去する。

## ハーネスの使い方

- `launchBrowser()` … system Chrome を起動（`channel:"chrome"`）。`newContext(browser)` … **1 ユーザー 1 context**（cookie jar を分けて別ユーザーを混ぜない）。
- `login(context, email, password)` … `/sign-in` を UI 操作しログイン。成功で `/menu` 等へ遷移した Page を返す（失敗は alert 文言付きで throw）。
- `waitForToast(page, { contains })` … sonner トースト（`[data-sonner-toast]`）を**文言一致**で待つ（新旧の取り違え回避）。Server Action の Result は成功/失敗ともトーストに出る規約なので、これで結果を判定する。
- `waitForWordDetail(page)` … 登録/更新後に `/words/{id}` へ着地したら id を返す。
- DB 直操作は `db.ts` の `makePrisma()` / `ensureUser` / `cleanupWordsByPrefix(prefix)` / `deleteUserByEmail`。掃除はアプリの削除ガードを迂回して直に消す（cascade で子行も落ちる）。テストデータは必ず `e2e-*` の headword / email にして prefix 掃除で回収する。

配置規約は `scripts/e2e/CLAUDE.md`（DB ops スクリプト規約は非適用）を参照。

## 実行例: 削除ガード検証（`pnpm e2e:guard`）

ADR-0066 の削除ガード = 「単語の子孫に**別 owner** の行が 1 つでもあれば削除を拒否する」（`assertWordDeletable` → `deleteWordForUser` → Server Action が赤トーストのエラー文言に変換）。削除ボタンは `word.ownerId === session.user.id` のときだけ描画されるため、**ガードが発火するのは admin(system) が system 単語を削除しようとしたときだけ**。別 owner の子孫は、一般ユーザーが pass-through 編集（ADR-0019）で system 単語に自分の子行を足すと生まれる。

`scripts/e2e/verify-deletion-guard.ts`（具体的なセレクタ・アサート文言はこのスクリプトが一次情報）の構成: preflight（system 整備の確認＋ `test1@example.com` の冪等用意）→ 本命（一般ユーザーの pass-through 追記で別 owner の子孫を作り、admin の削除が赤トーストで拒否され単語が残ることをアサート）→ 対照 2 件（別 owner 子孫なしの削除成功・一般ユーザーの私有単語削除成功）→ 後始末（`cleanupWordsByPrefix("e2e-guard-")`。使い回しユーザーは残す）。

セレクタ参照（新しい検証を書くとき用）: 単語 headword = placeholder `例: ephemeral`、意味テキスト = placeholder `例: 短命の、つかの間の`、登録/更新 = ボタン `登録する`/`更新する`、単語削除 = ボタン `削除`（`aria-label`）→ 確認 `削除する`、sign-in = `#email`/`#password`/ボタン `ログイン`。

子エンティティの配列 UI はほぼ規則的:
- **削除は完全に規則的** = `aria-label`『この<名>を削除』（`<名>` = 意味 / 例文 / 関連語 / メモ / 掲載箇所 / 詳細 / 意味テキスト / 補足説明 の 8 種）。
- **追加** = ボタン『<名>を追加』（意味 / 例文 / 関連語 / メモ / 掲載箇所 / 詳細 / 補足説明）。**例外: 意味テキストの追加ボタンは『意味を追加』**（意味カード追加と同一文言）。同名ボタンが 2 つ出るので、意味カード内の意味テキスト追加を狙うときは `.nth()` / 親カード内スコープで絞る。
- メモ textarea は placeholder『メモ N』（連番）。

**意味は 0 件にできる**（`meanings` schema に min 無し・意味カードも全削除可）ので、「system 単語を意味 0 件で作成 → 他ユーザーが最初の意味を付加」で owner-scope 漏れ（一覧カードに他人の意味が出る等）を**並べ替え UI 無しに再現**できる。

## 新しい E2E を足すとき

1. `scripts/e2e/verify-<対象>.ts` を作り、先頭に `import "dotenv/config";` を置いてから `harness.ts` / `auth.ts` / `db.ts` のヘルパを使う（env の読み込みは各スクリプトの責務。無いと `makePrisma()` が `DATABASE_URL ... is not set` で落ちる）。
2. テストデータ headword / email は `e2e-<対象>-*` にし、`finally` で prefix 掃除する（クラッシュ時も次回に持ち越さない）。
3. 一般ユーザーは上の「ユーザーパターン」に従う（既定は使い回し①/②、使い捨ては fresh account が本質のときだけ）。
4. `package.json` に `"e2e:<対象>": "tsx scripts/e2e/verify-<対象>.ts"` を追加。
5. UI セレクタは対象の component / form（`src/app/.../*.tsx`）を読んで確定する（placeholder / `aria-label` / ボタン文言が安定。子配列は上の規則で当たる）。

**一回きり（永続化しない）確認**なら 4 を省き、`scripts/e2e/verify-<対象>.ts` を作って `tsx scripts/e2e/verify-<対象>.ts` で直接実行 → 確認後に**ファイルごと削除**する（`package.json` に足さない）。`./harness` 等の import を素直にするため scratchpad でなく `scripts/e2e/` 配下に置く。

**「表示されないこと」を検証するときは、表示される画面で同じロケータが当たる対照を必ず置く**（要素が無いことのアサートは、ロケータ自体が誤っていても PASS するため）。同一スクリプト内に「出る画面でヒット数 1」のケースを 1 つ入れれば足りる。

**漏洩・認可系は空振り防止（negative control）まで**やる: fix を一時 revert（`git stash push -- <file>`）→ 対象ページを 1 回叩いて再コンパイル → E2E が **FAIL** することを確認 → `git stash pop`。アサートの空振りと dev の stale を同時に排除できる（`next dev` は Server Component をリクエスト毎に再コンパイルするので、revert 後は対象ページへ 1 回アクセスしてから走らせる）。

## フリック（スワイプ）操作の再現

`useSwipeNav`（`src/components/use-swipe-nav.ts`）は window の `touchstart` / `touchend` を見るだけなので、**合成 `TouchEvent` を `page.evaluate` で dispatch すれば再現できる**（`new Touch(...)` を `changedTouches` に載せる）。

**落とし穴: `page.evaluate` に渡す関数の中で名前付き関数を作らない。** tsx / esbuild の keepNames が**名前付き関数**（`function f() {}` だけでなく `const f = () => {}` も対象）に `__name(...)` を差し込むため、ブラウザ側で `ReferenceError: __name is not defined` になる。evaluate の中は無名の式で書く。

## 過渡的な状態（遷移中フィードバック等）の観測

ローディング表示や遷移アニメーションのように**一瞬で消える DOM 状態**は、ポーリングでは隙間に落ちて取りこぼす。

- 観測は **`MutationObserver`** で行う（`page.evaluate` 内に仕込んで属性変化を記録し、あとで回収する）。
- ローカルは遅延が小さく過渡状態が現れないことがあるため、**CDP の network throttling** で本番相当の遅延を作る（目安: 600ms）。
- **プリフェッチ・先読みが効くと過渡状態そのものが出ない**。dev サーバは `<Link>` の自動プリフェッチが動かない（production ビルドのみの仕様）ので、プリフェッチ非依存の検証は dev で走らせるのが素直。ダイアログ内の先読みのようにアプリ実装側のキャッシュが効く場合は、throttling か「先読みが終わる前に素早く操作する」で待ちを作る。
- 実装側は E2E から観測できるよう `data-*` 属性を出す規約（例: `WordContentTransition` の `data-pending` / `data-direction`）。クラス名ではなく属性を見る。

## 発音再生（`<audio>`）の検証

再生の起動・停止をアサートするときの型。fixture の `scripts/e2e/fixtures/silent.mp3` は短いので、素直に
`paused` を見ると**クリップが鳴り終わっただけ**なのか停止操作が効いたのか区別できない。

- 操作前に `<audio>` へ **`loop = true` を仕込む**（アプリは loop を設定しない。計測用の細工）。以後 `paused`
  は操作でしか変わらなくなり、再生 → 停止 → 再生のトグルを素直にアサートできる。
- **`paused` の反転と React state の反映は同時ではない**。`audio.play()` で `paused` は同期的に false になるが、
  `play` イベント → `setPlaying(true)` → 再描画は後から届く。`paused` を待った直後に `aria-pressed` や
  アイコンを読むと取りこぼす（実装時に踏んだフレーク）。DOM 側は**属性が付くまで待つ**
  （`locator.and(page.locator('[aria-pressed="true"]')).waitFor()`）。`play` イベントの発火回数を数える
  場合も同様に待つか、落ち着かせてから読む。
- 音源は `prisma` で `pronunciationAudioUrl` に直接入れ、実体は `DEV_BLOB_ROOT` へ書けばよい
  （`ensureDemoAudio` と同じ手。UI からのアップロード手順が検証対象でないなら遠回り）。
- クリック位置で挙動が変わる UI（カード全体タップ vs 内部のリンク・ボタン）は、**本文の `<p>` を
  `getByText(...).click()` で狙う**とバッジ・リンクを避けられる。
- テキスト選択ガード（選択中は発火しない）は、実ジェスチャの mousedown が選択を消してしまうため
  **合成 `click` の dispatch** で判定ロジックだけを見る。必ず「選択なしの同じ合成 click は発火する」
  対照を並べ、合成 click が届いていない空振りを排除する。

## 関連

- quiz 系の自動化ノウハウ（開始/進行中/結果のセレクタ、出題形式一覧、自己判定形式が最易、出題データの事情）は [references/quiz.md](references/quiz.md) にまとめてある。
- 認可・テナント分離の規約は skill `sec-review` と `src/app/CLAUDE.md`。削除ガードの設計は `docs/adr/0066-system-word-deletion-guard.md`、共存は `0065`、pass-through 編集は `0019`。
