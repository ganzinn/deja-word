---
name: e2e-verify
description: deja-word のブラウザ E2E 動作確認を定型手順で行う。system(admin) ログイン・一般ユーザーの用意（既定は使い回し test@example.com／新規ユーザーの観点が要るときだけ使い捨て）・playwright-core + system Chrome のハーネスを提供し、削除ガード等の end-to-end 検証を再現する。UI 挙動の動作確認・E2E 実施時に参照する。
argument-hint: "[検証対象（省略時は削除ガード）]"
---

# e2e-verify

deja-word のブラウザ E2E を、毎回ゼロから組み直さず**定型ハーネス**で回すためのスキル。認証（system / 一般）とテストデータの後始末を規約化し、実コードの挙動をブラウザで end-to-end に検証する。ハーネス実体は `scripts/e2e/`（`pnpm e2e:*`）にコミット済み。第一実装は **PR #110 / ADR-0066 の削除ガード**検証（`pnpm e2e:guard`）。

DB レベルの検証は integration テスト（`pnpm test:integration`）で足りることが多い。**このスキルは「ブラウザ UI / Server Action を通した挙動」を確かめたいときに使う**（DB だけで足りるなら integration テストを優先）。CI では動かさない（ローカル専用）。

## 前提セットアップ

1. Docker の DB を起動: `docker compose up -d`（コンテナ `deja-word-db`）。
2. スキーマ + シード:  `pnpm db:migrate`（初回/未適用時）→ `pnpm db:seed` → `pnpm db:set-system-password`。
   - `db:seed` は system ユーザー行（id=`system` / `system@deja-word.internal`）を作るが**パスワードは付けない**。`db:set-system-password` が `.env` の `SYSTEM_USER_PASSWORD`（ローカル既定 `demodemo`）で credential を付与する。両方走っていないと admin ログインできない（ハーネスが未整備を検知して中断する）。
3. dev サーバ: `pnpm dev`（既定 `http://localhost:3000`）。
   - **別ポートで起動する場合は `BETTER_AUTH_URL` の併記が必須**（例: `PORT=3100 BETTER_AUTH_URL=http://localhost:3100 pnpm dev`）。省略すると better-auth が Invalid origin で sign-in を拒否する。
4. `pnpm install` 済み（`playwright-core` は devDependency。ブラウザ実体は同梱せず**端末の Google Chrome** を使うので Chrome がインストール済みであること）。

ハーネスは `E2E_BASE_URL` → `BETTER_AUTH_URL` → `http://localhost:${PORT ?? 3000}` の順で接続先を決める。GUI で見たいときは `E2E_HEADED=1` を付ける。

## 3 つのユーザーパターン（このスキルの中核）

ヘルパは `scripts/e2e/auth.ts`（ログイン）と `scripts/e2e/db.ts`（用意・後始末）にある。

| パターン | いつ使うか | 用意 | 後始末 |
|---|---|---|---|
| **system（admin）** | 管理機能・system 所有単語の観点。admin 判定は `session.user.id === "system"` のみ | 前提セットアップ済み前提で `login(ctx, SYSTEM_EMAIL, systemPassword())`。`SYSTEM_EMAIL="system@deja-word.internal"` | 不要（共有シード。**削除しない**） |
| **一般（使い回し）＝ test@example.com【既定】** | 新規ユーザーの観点が不要な一般ユーザー検証すべて。**事前データが要る検証でも、まず test@example.com でデータを作ってから確認する**（既存ユーザーの観点） | `ensureUser(prisma, TEST_USER_EMAIL, TEST_USER_PASSWORD, ...)` で冪等に用意（`test@example.com` / `testtest`）→ `login(ctx, ...)` | 生成したテストデータのみ prefix 掃除。**ユーザー自体は残す** |
| **一般（使い捨て）＝ 新規ユーザー** | **新規ユーザーの観点がメイン**（サインアップ直後の空状態・空リスト・初回導線など、fresh account でないと再現できない観点）。ユーザー削除を伴う検証でも作るが、そちらは「残骸が残らないか」の副次確認 | `ensureUser(prisma, "e2e-throwaway-<Date.now()>@example.com", ...)`（またはサインアップ UI）で都度作成 | 検証後に `deleteUserByEmail` で削除 |

**原則**: 一般ユーザー検証は **`test@example.com` を既定**とし、事前データが必要でもまず `test@example.com` で作ってから確認する（作成コストを避ける）。使い捨てユーザーは **新規ユーザーの観点が本質的に必要なとき**に作る。ユーザー削除を伴う検証でも使い捨てを使うが、それは残骸チェックのための副次用途であってメインではない。

## ハーネスの使い方

- `launchBrowser()` … system Chrome を起動（`channel:"chrome"`）。`newContext(browser)` … **1 ユーザー 1 context**（cookie jar を分けて別ユーザーを混ぜない）。
- `login(context, email, password)` … `/sign-in` を UI 操作しログイン。成功で `/menu` 等へ遷移した Page を返す（失敗は alert 文言付きで throw）。
- `waitForToast(page, { contains })` … sonner トースト（`[data-sonner-toast]`）を**文言一致**で待つ（新旧の取り違え回避）。Server Action の Result は成功/失敗ともトーストに出る規約なので、これで結果を判定する。
- `waitForWordDetail(page)` … 登録/更新後に `/words/{id}` へ着地したら id を返す。
- DB 直操作は `db.ts` の `makePrisma()` / `ensureUser` / `cleanupWordsByPrefix(prefix)` / `deleteUserByEmail`。掃除はアプリの削除ガードを迂回して直に消す（cascade で子行も落ちる）。テストデータは必ず `e2e-*` の headword / email にして prefix 掃除で回収する。

配置規約は `scripts/e2e/CLAUDE.md`（DB ops スクリプト規約は非適用）を参照。

## 実行例: 削除ガード検証（`pnpm e2e:guard`）

ADR-0066 の削除ガード = 「単語の子孫に**別 owner** の行が 1 つでもあれば削除を拒否する」（`assertWordDeletable` → `deleteWordForUser` → Server Action が赤トースト「他のユーザーが追記した項目があるため、この単語は削除できません。」に変換）。削除ボタンは `word.ownerId === session.user.id` のときだけ描画されるため、**ガードが発火するのは admin(system) が system 単語を削除しようとしたときだけ**。別 owner の子孫は、一般ユーザーが pass-through 編集（ADR-0019）で system 単語に自分の子行を足すと生まれる。

`scripts/e2e/verify-deletion-guard.ts` が自動化する流れ:

1. **preflight**: system 整備を確認（未整備は remediation 付きで中断）→ `test@example.com` を冪等用意。
2. **本命**: admin(system) で `/words/new` に単語 `e2e-guard-<ts>` を作成 → 別 context で `test@example.com` が `/words/{id}/edit` を開き「メモを追加」→ 保存（test ユーザー owner の子孫が付く）→ admin が `/words/{id}` で削除（`aria-label=削除` → `削除する`）→ **赤トースト「他のユーザーが追記した項目があるため…」が出て詳細ページに留まる**ことをアサート、DB に単語が残ることも確認。
3. **対照+**: admin が自分の子行だけの system 単語を削除 → 「削除しました」+ `/words` 遷移。
4. **対照0**: `test@example.com`（本命でログイン済みの使い回しユーザー）が自分の私有単語を作成→削除 → 成功（ガード無反応。全子孫が自分所有なのでガードは働かない）。新規ユーザーの観点は不要なので使い捨てユーザーは使わない。
5. **後始末**: `cleanupWordsByPrefix("e2e-guard-")`（追記メモも cascade で消える。`test@example.com` は残す）。

セレクタ参照（新しい検証を書くとき用）: 単語 headword = placeholder `例: ephemeral`、意味テキスト = placeholder `例: 短命の、つかの間の`、登録/更新 = ボタン `登録する`/`更新する`、メモ追加 = ボタン `メモを追加`（textarea placeholder `メモ N`）、削除 = ボタン `削除`（`aria-label`）→ 確認 `削除する`、sign-in = `#email`/`#password`/ボタン `ログイン`。

## 新しい E2E を足すとき

1. `scripts/e2e/verify-<対象>.ts` を作り、`harness.ts` / `auth.ts` / `db.ts` のヘルパを使う。
2. テストデータ headword / email は `e2e-<対象>-*` にし、`finally` で prefix 掃除する（クラッシュ時も次回に持ち越さない）。
3. 一般ユーザーは `test@example.com` を既定にする（事前データも test@example.com で作る）。**新規ユーザーの観点が本質的に必要なとき**だけ使い捨てユーザー（`e2e-throwaway-*`）を作り、検証後に消す（ユーザー削除検証での残骸チェックも同様）。
4. `package.json` に `"e2e:<対象>": "tsx scripts/e2e/verify-<対象>.ts"` を追加。
5. UI セレクタは対象の component / form（`src/app/.../*.tsx`）を読んで確定する（placeholder / `aria-label` / ボタン文言が安定）。

## 関連

- quiz 系の自動化ノウハウ（範囲・出題形式のセレクタ、自己判定形式が最易 等）は個人メモ `project-e2e-verify-recipe` に蓄積がある。
- 認可・テナント分離の規約は skill `sec-review` と `src/app/CLAUDE.md`。削除ガードの設計は `docs/adr/0066-system-word-deletion-guard.md`、共存は `0065`、pass-through 編集は `0019`。
