---
name: sec-review
description: deja-word 固有のセキュリティ観点で diff をレビューする。認可ガード・テナント分離（scopedOwnerIds / row-policy）・入力検証・blob / 秘密情報の規約違反を検知する。セキュリティ境界に触れる diff のレビュー時に参照する。
argument-hint: "[base-branch（省略時: working diff、無ければ main 比較）]"
---

# sec-review

deja-word の実コードに紐づくセキュリティ観点集。OWASP 的な一般論ではなく、**このコードベースの規約を diff が壊していないか**を機械的に判定する。設計段階でしか判断できない観点は [docs/reference/security-design-checklist.md](../../../docs/reference/security-design-checklist.md) に別出ししてある（このスキルでは扱わない）。

## 前提となるアーキテクチャ事実

- セッション取得は `getCurrentSession()`（`src/lib/session.ts`）。middleware は `src/proxy.ts`（Next.js 16 で middleware → proxy に改名）で、**cookie の存在チェックのみ**。認可は常にページ / action / route 側で行う（多層防御）
- 権限モデルに role カラムは無い。管理者 = `session.user.id === SYSTEM_USER_ID`（`src/lib/system-user.ts`、値は `"system"`）のみ
- テナント分離は「**read は system + 自分**（`scopedOwnerIds(userId)` = `["system", userId]`）、**write は自分のみ**（bare `ownerId: userId`）」の非対称が原則。system 行への例外的な書込み許可は `src/lib/words/policy/row-policy.ts` に集約されている

## 手順

1. diff を取得する。引数があれば `git diff <base-branch>...HEAD`、無ければ working diff（`git diff HEAD`）、それも空なら `git diff main...HEAD`
2. 変更ファイル一覧を下のチェックリストの「対象」列とマッチさせ、該当する観点だけを選ぶ
3. 該当観点ごとに「NG 判定」基準で diff の hunk を確認する。判断に迷う場合は「正しい例」のファイルを読み、規約とのズレを比較する
4. 結果を報告する:
   - finding は `観点 ID / file:line / NG 理由 / 正しい例への参照` の形式
   - 該当パターンのファイルが diff に無い場合は「対象観点なし」と明示する（沈黙しない）
   - B5 / F1 の高精査ゾーンに触れる diff は、finding が無くても「精査した旨と根拠」を報告する

## チェックリスト

### A. 認可・セッション

| ID | 対象 | NG 判定 | 正しい例 |
|---|---|---|---|
| A1 | `src/app/**/actions.ts`（`"use server"`） | DB / サービス層アクセスより前に `getCurrentSession()` → `!session` で unauthorized return が無い | `src/app/words/new/actions.ts`（ガード → `safeParse` → `*ForUser(session.user.id, ...)` の順） |
| A2 | admin 系の action / page（`src/app/admin/**`、およびユーザー横断操作を行う新規コード） | session の有無**だけ**で通し、`session.user.id !== SYSTEM_USER_ID` のチェックが無い | `src/app/admin/users/actions.ts`（action は unauthorized return、page `admin/users/page.tsx` は `notFound()` で存在秘匿） |
| A3 | `src/app/api/**/route.ts` の新規・変更 | session チェック → 401 が無い。既存の例外は `api/auth/[...all]`（Better Auth 本体）と `api/dev-blob`（D3 の本番 404 ガードが条件） | `src/app/api/words/search/route.ts`（`auth.api.getSession` → 401 → `session.user.id` でスコープ） |
| A4 | 新規トップレベルルートセグメントの `page.tsx` | `src/proxy.ts` の matcher（`/menu` `/words` `/quiz` `/settings` のみ）でカバーされない場所に、self-guard（`getCurrentSession()` → `redirect` / `notFound`）無しでページを追加。proxy は cookie 存在チェックであり認可ではない | `src/app/account/page.tsx`（matcher 外だが自前で redirect） |

### B. テナント分離（IDOR）

| ID | 対象 | NG 判定 | 正しい例 |
|---|---|---|---|
| B1 | `src/lib/**` の Prisma read（クライアント供給 id を使うもの） | `findUnique` / `findMany` の where に owner 条件が無い。**nested `include` の再スコープ漏れ**（親だけ絞って子で他ユーザー行が漏れる） | `src/lib/words-detail.ts`（include ごとに `ownerId: { in: allowed }` を再適用） |
| B2 | `src/lib/**` の Prisma write（update / delete / updateMany / deleteMany） | `update({ where: { id } })` 等を所有検証なしで実行。可とする形: ① fetch-verify（`findFirst({ where: { id, ownerId: userId } })` → 無ければ throw → mutate）② `deleteMany({ where: { id, ownerId } })` + count 検査 ③ post-fetch JS チェック（mutation **前**に `ownerId !== userId` で throw） | ① `src/lib/words-delete.ts` ② `src/lib/drill-delete.ts` ③ `src/lib/pronunciation-audio.ts` の `loadOwnedRow` |
| B3 | write パスでの owner 条件、および scoped read で解決した id が write に流れる経路 | ① **write の where / 検証に `scopedOwnerIds()` を使っている**（read 用ヘルパ。write に使うと一般ユーザーが system 行を直接書ける）。write は bare `ownerId: userId`。② `scopedOwnerIds` の read / allow-set で解決した id は **system 所有の可能性がある**。その id に紐づくフィールドを create / update に流すとき、**owner が system か否かの分岐（拒否またはフィールド無効化）が diff に無い**。書込み先が per-user 行（`ownerId: userId`）でも、system 行に付加する実効値には分岐が要る。**過去の実脆弱性: `3f5edf9`** — scoped read で解決した掲載箇所が system 所有でも `occurrenceNumber` をそのまま登録できた（書込み自体は per-user の WordOccurrence 行だった点に注意） | ① `src/lib/occurrence-auto-number-settings.ts`（read は scoped、書込み対象の検証は bare `ownerId: userId`）② `src/lib/words-children.ts`（`occurrenceOwnerIdResolved === SYSTEM_USER_ID` なら `effectiveOccurrenceNumber` を null 化）。純粋な per-user 設定（system 行の意味に影響しない）は分岐不要: `src/lib/occurrence-preset-settings.ts` |
| B4 | フォーム / action 入力に含まれるネスト id（`linkedWordId`、`occurrenceId` 等） | allow-set 解決を通さず connect / create / 参照登録に直接使用 | `src/lib/words/handlers/allowed-ids.ts` の `resolveChildAllowedIds`（allow-set 外の id は handler 側で null 化） |
| B5 | `src/lib/words/policy/**`、`src/lib/words-update.ts` を触る diff（高精査ゾーン） | 非 system 編集者が system 行の **body 編集・削除・headword 変更**を新たに得る変更。policy の分岐追加に unit test（`row-policy.unit.test.ts`）が無い。注意: `words-update.ts` が子行を owner 条件なしで load するのは**設計上意図的**（row-policy の認可パスに必要）— これを「修正」して消すのも、逆にこのパターンを他所へ真似るのも NG | `src/lib/words/policy/row-policy.ts`（`isPassThroughSystemRow` / `assertHeadwordChangeAllowed` / `assertRowsAllowed`：pass-through は「維持・並べ替え・自分の子付加」まで） |

### C. 入力検証

| ID | 対象 | NG 判定 | 正しい例 |
|---|---|---|---|
| C1 | Server Action の入力 | `src/lib/schema/` の zod schema を `safeParse` せず FormData / JSON のフィールドを直接消費。zod の import が `zod/v3` 以外。既存の文書化済み例外: `api/words/search`・`api/words/headword-exists`（searchParams を直接読むが auth + Prisma パラメタライズで担保） | `src/app/words/new/actions.ts` + `src/lib/schema/word-form.ts` |
| C2 | クライアント送信の authz 関連フィールド | form の `ownerId` 等を DB と突合せずに信用。server 計算の `canEdit` / `canDelete` / `isCurrentUserSystem` props を**表示以外**（認可判断）に使う action / handler | `row-policy.ts` の `assertRowsAllowed`（form の ownerId を DB 行と突合、不一致は `ForbiddenUpdateError`） |

### D. ファイル・blob

| ID | 対象 | NG 判定 | 正しい例 |
|---|---|---|---|
| D1 | fs パス / blob key の構築（`src/lib/blob-client*`、blob を使う新規コード） | 可変入力由来の fs パスが `resolveDevBlobPath`（root 逸脱で null）を通らない。blob key にユーザー文字列を連結（正: `audio/${固定リテラル}/${検証済みDB id}/...` の固定テンプレのみ） | `src/lib/blob-client-impl.ts` の `resolveDevBlobPath`、key 構築は `src/lib/pronunciation-audio.ts` |
| D2 | ファイルアップロードの追加・変更 | `validateAudioFile` 相当（MIME・サイズ上限・空チェック）が無い。注意: 既存の MIME 検査は**クライアント申告の `File.type` のみ**（mp3 は opaque な public blob として保存されるため許容）— 新しいファイル種別を追加する diff では magic-byte 検査の要否を指摘する | `src/lib/pronunciation-audio.ts`（`AUDIO_MIME` / `MAX_AUDIO_BYTES` / `validateAudioFile`、`next.config.ts` の `bodySizeLimit` と整合） |
| D3 | `src/app/api/dev-blob/[...key]/route.ts` | `NODE_ENV === "production"` での 404 ガードの除去・弱体化。`resolveDevBlobPath` を経由しないパス解決への変更 | 同ファイル冒頭の production ガード + `resolveDevBlobPath` 経由の解決 |

### E. SQL・秘密情報・URL

| ID | 対象 | NG 判定 | 正しい例 |
|---|---|---|---|
| E1 | raw SQL | ops リセット系（`src/lib/db-reset.ts`、`scripts/reset-prod-db.ts`）以外での `$queryRawUnsafe` / `$executeRawUnsafe` の新規使用。ユーザー入力が raw SQL に到達する経路 | 既存 2 箇所は識別子が pg_tables カタログ由来のみ（ユーザー入力なし）。通常の DB アクセスは Prisma query builder に限定 |
| E2 | env / secret を読むコード | secret を読むモジュールに `import "server-only"` が無い。client component へ env 値そのものを props で渡す（正: boolean / 派生値のみ）。`NEXT_PUBLIC_` プレフィックスの secret（現状ゼロ。新設は原則 NG）。token / password の `console.log` | `src/lib/word-ai-draft.ts` の `isWordAiEnabled()`（secret は server で読み、client には boolean だけ渡す） |
| E3 | redirect / URL 生成 | ユーザー入力の redirect 先が「`/` で始まり `//` で始まらない」検証を通らない。`Host` / `X-Forwarded-Host` ヘッダから URL を組み立てる新規コード（既存の要注意箇所: `src/app/admin/users/actions.ts` の `resolveOrigin` — admin 限定 + 手動送付で緩和されているが、これを一般ユーザー経路へ流用するのは NG） | `src/app/sign-in/sign-in-form.tsx` の `safeRedirect` |

### F. auth フロー・ops・AI

| ID | 対象 | NG 判定 | 正しい例 |
|---|---|---|---|
| F1 | `src/lib/auth.ts` の callback / 設定、email 変更・パスワードリセット・招待フローの diff（高精査ゾーン） | 検証リンク・トークンの副作用を未確認のまま変更: 「そのリンクを踏むと**誰が・どの状態で自動ログイン / emailVerified になるか**」を diff 説明に含めていない。特に credential（パスワード）未設定ユーザーの扱い。**過去の実脆弱性: `ffb2a68`（PR #61）**— パスワード未設定ユーザーのメール変更を許すと、検証リンク経由で本人確認なしの自動ログインが成立した | `src/app/admin/users/actions.ts` の `changeUserEmail`（credential アカウント有無ガード）+ `src/lib/auth-password-reset.integration.test.ts` |
| F2 | `scripts/*.ts` の新規・変更 | dry-run デフォルト・`--execute` ゲートが無い。破壊的操作（TRUNCATE / 一括削除）に TTY 検査 + 確認入力が無い。`@/lib/prisma` singleton や `server-only` の import。secret（password / token）の log 出力 | `scripts/reset-prod-db.ts`（dry-run 既定、`--execute` + TTY + `yes` 入力）。規約詳細は `scripts/CLAUDE.md` |
| F3 | LLM 出力を消費するコード（`src/lib/word-ai-draft.ts` 系） | AI 応答を zod `safeParse` + normalize（上限カット・不正値の soft-fail）せずに信用。enable flag / 入力セクションの server 側再チェック省略（UI で隠していてもクライアントは直接 POST できる） | `src/lib/word-ai-draft.ts`（`safeParse` → `normalizeWordAiDraft`）、`src/app/words/new/ai-draft-action.ts` |

## 注意事項

- 参照している「正しい例」のコードが移動・改名されていたら、レビュー報告に含めた上でこのチェックリストの参照も更新する
- このリストに無い一般的な脆弱性クラス（XSS 等）は、React のデフォルトエスケープと `dangerouslySetInnerHTML` 不使用（現状ゼロ）が前提。`dangerouslySetInnerHTML` / `innerHTML` が diff に現れたらそれ自体を finding として扱う
- 新しい境界（外部 API 呼び出し、新しいデータ所有モデル等）を導入する diff は、このチェックリストでは判定できない。[docs/reference/security-design-checklist.md](../../../docs/reference/security-design-checklist.md) を参照し、設計判断の記録を求める
