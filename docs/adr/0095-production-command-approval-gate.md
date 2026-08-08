# ADR-0095: 本番リソースに触れるコマンドは ask ルールで承認ゲートを設け、共有許可リストは追跡対象の settings.json に置く

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-08-08

## 背景

2026-08-08、本番 DB / 本番環境変数に触れる次の 2 コマンドが、Claude Code の承認ダイアログを一度も出さずに実行された（issue #239）。

| コマンド | 本番への影響 |
| --- | --- |
| `pnpm exec vercel env pull <file> --environment=production` | 本番の環境変数一式（DB 接続文字列・Blob トークン・認証シークレット）をディスクへ取得 |
| `pnpm dotenv -e <file> -- pnpm db:export-occurrence …` | 本番 DB へ接続して読み取り |

原因は許可リストの `Bash(pnpm *)`。このリポジトリの操作はほぼすべて `pnpm` 経由なので実用上必要なルールだが、本番に触れるものまで一括で素通しになっていた。`PermissionRequest` hook のログ（`tmp/permission-requests.log`）にも該当時刻のエントリが無く、ダイアログが出ていないことを確認済み。

同時に逆方向の問題もあった。許可リストは `.claude/settings.local.json`（git 管理外・端末ごと）にあり、`scripts/wt-env.sh` が worktree へ一方向コピーするだけなので、**共有すべき許可の正本がリポジトリの外にある**状態だった（新規クローンでは空、worktree 側で増えた承認は本体に戻らない）。

前提として確認した Claude Code の permission 仕様（公式ドキュメント "Configure permissions"）:

- ルールは **deny → ask → allow** の順に評価され、最初に一致したものが勝つ（ルールの特異性は順序を変えない）。スコープ間ではルールが**マージ**されるため、追跡対象 `.claude/settings.json` の `ask` は `settings.local.json` の `allow` に勝つ
- `ask` は `acceptEdits` / `bypassPermissions` でもプロンプトが出る（委譲エージェントでも迂回されない）
- Bash ルールの `*` はスペースを跨いで一致し、先頭・中間にも置ける。複合コマンド（`&&` `||` `;` `|` `&` 改行）は**部分コマンドごとに**照合される。`ask` / `deny` は先頭の環境変数代入を跨いで一致する（`allow` は跨がない）
- **末尾の `:*` は「trailing wildcard の別記法」として解釈される**（`Bash(ls:*)` ≡ `Bash(ls *)`）。そのため `Bash(pnpm e2e:*)` は `pnpm e2e <引数>` の意味になり、**`pnpm e2e:guard` には一致しない**（実測で確認。設定のスキーマ検証も `:*` を末尾以外に置くとエラーにする）。`pnpm <script>:<name>` 形式を許可するときはスクリプト名まで書き、末尾は `*`（`Bash(pnpm e2e:guard*)`）にする
- ユーザースコープ（`~/.claude/settings.json`）が `defaultMode: "auto"` の場合、**allow に一致しないコマンドはプロンプトではなく分類器**に回る。allow の絞り込みが「必ず止まる」境界になるのは分類器を使わないモード（`default` / `acceptEdits`。委譲エージェントはこちら）。確実に止めたいものは `ask` / `deny` で書く
- 権限判定は**入力されたコマンド文字列だけ**を見る。`package.json` の script が内部で何を起動するかは照合対象にならない
- `mise exec` / `npx` / `pnpm exec` のような環境ランナーは剥がされない（`timeout` / `nice` 等の固定リストのみが剥がされる）ため、`Bash(mise exec *)` は実質「任意コマンド許可」になる

## 決定内容

1. **共有の許可リスト（`permissions.allow`）を追跡対象 `.claude/settings.json` へ移す**。`.claude/settings.local.json` は「don't ask again」で溜まる端末ごとの追加分の受け皿として残し、有用なものは追跡対象側へ昇格させる。リポジトリの `.gitignore` に `/.claude/settings.local.json` を追加し、正本が入れ替わらないようにする
2. **本番リソースに触れうるコマンドは `permissions.ask` で止める**（`deny` ではない。`docs/ops/` の正規手順は残したまま、実行直前の確認を機械的に挟むのが目的）。対象の選定基準は次の 2 つ:
   - **接続先が外部（本番・他環境）になりうる**: `pnpm dotenv -e <env ファイル>` 前置き（本番 env を `process.env` に載せる唯一の経路）、`pnpm db:export-occurrence`（`SOURCE_DATABASE_URL` で外部 DB に繋ぐ）
   - **本番資源を書き換える / 本番の秘密情報を取得する**: Vercel CLI の `env`（pull / add / rm）・`promote` / `rollback` / `alias` / `remove` / `redeploy` / `deploy`・引数なし `vercel`（deploy 相当）、`pnpm db:reset-prod`
3. **ランナー経由を拾うため、各ルールは `* ` 前置き版を併記する**（`Bash(* pnpm dotenv *)` が `mise exec -- pnpm dotenv …` や `npx` 経由に一致する）
4. **`db:purge-*` / `db:import-*` / `db:sync-occurrence` は ask の対象にしない**。接続先がローカル限定か、ドライラン既定であり、本番へ向ける経路は必ず `pnpm dotenv -e` 前置き（＝ 2 のルール）で捕まる。Vercel CLI の読み取り系（`ls` / `inspect` / `whoami`）も対象外（AGENTS.md が状況確認に勧めており、毎回の承認は摩擦だけが増える）
5. **`pnpm <script>` 経由の自動承認が成立する条件を明示する**: 権限判定はコマンド文字列だけを見るため、`pnpm` に寄せたスクリプトは中身が照合されない。そこに寄せてよいのは **リポジトリに追跡され・レビュー済みで・ローカル資源にしか触れない** スクリプトに限る（`pnpm e2e:*` / `pnpm docs:diff-images` 等）。本番に触れる操作をスクリプト化して `pnpm` 名の裏に隠すことは、本 ADR のゲートを無効化するので禁止する
6. **許可は「任意コマンドを実行できる形」を含まない粒度まで絞る**。`Bash(pnpm *)` は `pnpm exec <任意>` / `pnpm dlx <任意パッケージ>` / `pnpm add` を含み、`Bash(mise exec *)` も同義なので、次の方針に置き換える:
   - `pnpm` は**サブコマンド単位**で許可する（`pnpm dev*` / `pnpm lint*` / `pnpm typecheck` / `pnpm format` / `pnpm test*` / `pnpm e2e:*` / `pnpm docs:*` / `pnpm db:*` / `pnpm install` 等。環境変数前置きも `pnpm dev` / `pnpm e2e:*` に限定する）
   - `pnpm exec` / `pnpm tsx` は**内側のコマンドまで書いて許可する**（`pnpm exec prisma *` / `pnpm tsx scripts/*` / `pnpm exec vercel` の読み取り系のみ）。公式ドキュメントが環境ランナーについて指示している書き方と同じ
   - `pnpm add` / `pnpm remove` / `pnpm update` / `pnpm dlx *` / 未列挙の `pnpm exec <x>` は**許可しない**（依存の追加・レジストリからの取得は毎回確認する。頻度は低い）
   - `mise exec` はコマンドとしてタイプされる箇所が無いため許可ルール自体を置かない
   - 環境変数前置き（`PORT=` / `BETTER_AUTH_URL=` / `E2E_BASE_URL=` / `E2E_HEADED=` / `SHOT_DIR=` / `AI_GATEWAY_API_KEY=` …）は変数名を列挙せず、`Bash(* pnpm dev*)` / `Bash(* pnpm e2e:<script>*)` の**先頭 `*` 形式**で受ける（変数の順序・組み合わせ・将来の追加に強い）。代償として `sudo pnpm e2e:guard` のような**前置きコマンド全般**も一致するため、必要なら `Bash(sudo *)` を `ask` に足す
   これにより本番系コマンドは「ask で止まる」だけでなく「allow に一致しない」二重の防御になる

## 採らなかった代替案

- **`deny` で弾く** — `docs/ops/` に定義された正規の運用手順（本番 env の取得・掲載箇所同期・本番リセット）自体を塞いでしまう。止めたいのは「合意した手順の外で、確認なく走ること」であって手順そのものではない
- **`pnpm` の許可を全廃して 1 コマンドずつ承認する** — このリポジトリの操作はほぼすべて `pnpm` 経由なので、日常の承認プロンプトが激増し issue #244（承認プロンプト削減）と正面から衝突する。採ったのは「全廃」ではなく決定 6 の**サブコマンド粒度の許可**で、日常の定型（dev / lint / typecheck / test / e2e / db / docs）は素通しのまま、任意コマンドを実行できる形（`pnpm exec <任意>` / `pnpm dlx`）だけを落とす
- **`Bash(pnpm *)` のような粗い許可を維持し、危険なものを ask で個別に塞ぐだけにする** — ask の列挙漏れがそのまま素通しになる（本番に触れる新しいコマンドを足すたびにルール追加を忘れられない）。allow 側も絞れば、列挙漏れは「プロンプトが出る」側に倒れる
- **PreToolUse hook でコマンド文字列を判定する** — `ask` ルールで表現できる範囲であり、設定 1 箇所で済む方が追跡しやすい。hook は deny / ask を迂回できない（ルールが先に評価される）ため、ルールで書けるものをわざわざ hook にする理由がない
- **許可リストをすべて `settings.local.json` に残し、ask だけ追跡対象に置く** — ゲートは共有できるが、許可の正本がリポジトリ外に残り続ける（新規クローン・worktree で再現しない）問題が解決しない

## 影響

- 承認ゲートは**「うっかり」を機械的に拾うためのもので、意図的な迂回は防げない**。`node -e` / `python3` / 環境ランナー / 別の書き方で同じことはできる。運用ルール（`docs/ops/` の手順に「実行前に確認を取る」を明記する）との二段構えで扱う
- Bash ルールで引数を制約する書き方は原理的に脆い（公式ドキュメントも明記）。`pnpm exec vercel --scope <team> env pull` のようにフラグをサブコマンドより前に置く形は `Bash(* vercel env *)` で拾えるが、想定外の書き方が漏れる可能性は残る。漏れを見つけたらルールを追加する
- 委譲エージェント（`--permission-mode acceptEdits`）でも ask はプロンプトを出す。オーケストレーターによる代理承認は禁止（`.claude/skills/ticket-implement/references/herdr-delegation.md`）
- 非対話セッション（`claude -p`）では ask 対象コマンドは**拒否**される（プロンプトを出せないため）。本番操作を headless 実行に組み込むことはできない＝人間の確認を必ず経る、という副作用の効いた性質になる（実測で確認済み）
- `settings.local.json` の共有ルールは追跡対象へ移した。既存の端末では local 側を空にして重複を解消する（放置しても動作は同じ＝マージされるだけ）
- 決定 6 により、これまで素通しだった次のものは**プロンプトが出るようになる**: `pnpm add` / `remove` / `update`、`pnpm dlx *`、`pnpm approve-builds`、許可リストに列挙していない `pnpm exec <x>`（`bubblewrap` 等）、Vercel CLI の読み取り系のうち `ls` / `inspect` / `whoami` / `logs` 以外。いずれも頻度が低く意図して打つものなので、承認 1 回の負担より列挙漏れが素通しにならない性質を優先する。日常的に打つものが漏れていたら追跡対象の allow に足す（local 側の「don't ask again」に溜めっぱなしにしない）

## 根拠（コード・コミット・文書参照）

- issue #239（事象・原因・検討事項の一次記録）、issue #244（承認プロンプト削減。決定 5 の背景）
- `.claude/settings.json`（allow / ask の実体）、`.claude/hooks/` と `PermissionRequest` hook（監査ログ `tmp/permission-requests.log`）
- `scripts/wt-env.sh`（`settings.local.json` の一方向コピー）
- 本番接続を伴う運用手順: `docs/ops/sync-occurrence.md`, `docs/ops/import-audio.md`, `docs/ops/import-words.md`, `docs/ops/purge-blobs.md`, `docs/ops/purge-occurrence.md`, `docs/ops/reset-prod-db.md`, `docs/ops/release-deploy.md`
- Claude Code 公式ドキュメント "Configure permissions"（ルール評価順・ワイルドカード・複合コマンド・ラッパー剥がしの仕様）
- [ADR-0093](0093-occurrence-content-export-import-sync.md) — `SOURCE_DATABASE_URL` 限定の読み取り専用エクスポート（決定 2 の対象根拠）
