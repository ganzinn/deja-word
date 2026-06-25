# Reset Prod DB（本番 DB をデータのみ全消去）

本番（Neon）の DB を「**データのみ全消去**」して初期状態に戻す運用手順。スキーマ・マイグレーション履歴（`_prisma_migrations`）は保持したまま、`public` スキーマの全テーブルを `TRUNCATE ... RESTART IDENTITY CASCADE` する。`pnpm db:reset-prod` が単一エントリポイント。既定はドライラン（対象テーブルと件数表示のみ・無変更）で、`--execute` 指定時のみ実行する。

```sh
pnpm db:reset-prod             # ドライラン（対象テーブルと件数表示のみ・無変更）
pnpm db:reset-prod --execute   # 実行（yes 確認あり。非対話 stdin では拒否）
```

> ⚠️ **不可逆**。実行前に必ず Neon でブランチ/スナップショットを取得し、**同一接続先**でドライランして件数を確認すること。

## 背景・仕様

- **データのみ消す**: `prisma migrate reset` と異なりスキーマやマイグレーション履歴は drop しない。`pg_tables` から `public` スキーマの全テーブルを動的取得し、`_prisma_migrations` を除いて TRUNCATE する（テーブル名ハードコードなし。将来のテーブル追加に追従）。
- **Blob は別操作**: 発音音源 Blob の実体は TRUNCATE では消えない。さらに TRUNCATE すると URL が消えて Blob を辿れなくなるため、Blob 削除（[`purge-blobs`](./purge-blobs.md)）は**必ずこの操作より前**に実行する。
- **再 seed・管理パスワード再設定が必要**: TRUNCATE 後は system ユーザーも消える。`pnpm db:seed`（system ユーザー再作成）と `pnpm db:set-system-password`（`account` も消えるため管理ログイン用パスワードの再設定）を続けて実行する。`db:seed` は **system ユーザーの upsert のみ**で、system 掲載箇所や単語データは復元しない（必要なら `pnpm db:import-words` 等で再投入）。

## 構成

| ファイル | 役割 |
|---|---|
| `scripts/reset-prod-db.ts` | CLI（dotenv + PrismaPg、ドライラン/`--execute`、件数表示、`yes` 確認） |
| `src/lib/db-reset.ts` | コアロジック（prisma を引数注入、`server-only` 非依存） |

接続先は `DIRECT_URL → DATABASE_URL_UNPOOLED → DATABASE_URL` の順で解決する。

## 本番リセット手順

> Vercel CLI はプロジェクトの devDependency（`pnpm exec vercel`）で利用する。グローバルインストールは不要。

```sh
# 0. 復旧用バックアップ（強く推奨）: Neon でブランチ/スナップショットを取得
#    （Neon Dashboard、もしくは Neon MCP の create_branch）

# 1. 本番 env を取得（DATABASE_URL_UNPOOLED / BLOB_READ_WRITE_TOKEN を含む）
pnpm exec vercel env pull .env.production.local --environment=production

# 2. Blob 音源を削除（DB はまだ無傷 = URL が読める。必ず TRUNCATE より前）
pnpm dotenv -e .env.production.local -- pnpm db:purge-blobs            # dry-run（件数確認）
pnpm dotenv -e .env.production.local -- pnpm db:purge-blobs --execute  # 実削除

# 3. 全テーブルのデータを TRUNCATE（スキーマ・マイグレーション履歴は保持）
pnpm dotenv -e .env.production.local -- pnpm db:reset-prod            # dry-run（対象テーブル/件数確認）
pnpm dotenv -e .env.production.local -- pnpm db:reset-prod --execute  # 実行（yes 確認あり）

# 4. system ユーザーを再 seed
pnpm dotenv -e .env.production.local -- pnpm db:seed

# 5. system 管理者パスワードを再設定（account が消えるため必須・これをしないと管理ログイン不可）
SYSTEM_USER_PASSWORD=... pnpm dotenv -e .env.production.local -- pnpm db:set-system-password

# 5.5（任意）共有マスタ「英単語ターゲット1900(6訂版)」を一括登録する場合
#   先に単語、続いて関連語の順で取り込む（順序は固定）。単語・関連語で同じ掲載箇所名を使う。
#   必ず dry-run で件数確認 → --execute。本番は往復遅延で単語 1900 件に十数分かかる（正常・後述）。
LOC="英単語ターゲット1900(6訂版)"
pnpm dotenv -e .env.production.local -- pnpm db:import-words "$LOC" tmp/target1900.words.csv            # dry-run
pnpm dotenv -e .env.production.local -- pnpm db:import-words "$LOC" tmp/target1900.words.csv --execute  # 実登録（十数分）
pnpm dotenv -e .env.production.local -- pnpm db:import-related-words "$LOC" tmp/target1900.related.csv            # dry-run
pnpm dotenv -e .env.production.local -- pnpm db:import-related-words "$LOC" tmp/target1900.related.csv --execute  # 実登録

# 6. 後片付け
rm .env.production.local
```

> 📝 **手順 5（パスワード再設定）の補足**:
>
> - パスワードは `SYSTEM_USER_PASSWORD` 環境変数で渡す（引数ではない）。`SYSTEM_USER_PASSWORD='...'` のようにコマンド先頭に付ける。
> - ここで決めた値が新しい管理パスワードになる（既存値の読み出しではない）。**8〜128 文字**（`src/lib/password-policy.ts`。範囲外はエラーで中断）。
> - `$` `!` `` ` `` 等の特殊文字を含む場合は **シングルクオート `'...'`** で囲む（シェル展開を防ぐ）。
> - **手順 4（`db:seed`）の後に実行する**こと。system ユーザー行が無いと「system user not found」で失敗する。
> - パスワードがシェル履歴に平文で残る。気になる場合はコマンド先頭にスペースを 1 つ入れる（zsh の `HIST_IGNORE_SPACE` 有効時は履歴に残らない）か、実行後に履歴を消す。
> - 成功すると `created credential for system user (...)` が出力され、その値で管理画面にログインできる。

> 📝 **手順 5.5（ターゲット1900 の一括登録・任意）の補足**:
>
> - 取り込み用 CSV は `tmp/target1900.words.csv`（単語 1900 行）/ `tmp/target1900.related.csv`（関連語 183 行）。元 CSV から `scripts/split-target1900.ts` で生成したもの。詳細仕様は [`import-words`](./import-words.md) / [`import-related-words`](./import-related-words.md) を参照。
> - **単語 → 関連語の順序は固定**。関連語の掲載番号リンク（`link_number`）は単語が登録済みでないと解決できない。
> - `--email` 省略で **system 共有マスタ**として登録。掲載箇所「ターゲット1900」が新規作成され、自動採番 ON で掲載番号 1〜1900 が振られる。プリセットは**オーナー本人（system）ぶんのみ ON**（共通の掲載箇所はオプトイン方式。一般ユーザーは各自 `/settings/occurrences` で ON にする）。
> - 掲載箇所名が system スコープに既存だと中止する。リセット直後（`db:seed` は掲載箇所を作らない）なら未作成なので問題ない。
> - 必ず dry-run で「登録予定 1900 / スキップ 0」を確認してから `--execute`。
> - `db:import-related-words` は **第 1 引数に掲載箇所名が必須**（単語と同じ名前）。省略するとリンク解決先が見つからず失敗する。
> - 本番は往復遅延が大きく（Neon `ap-southeast-1` へ日本から ≈ 80ms/往復）、単語は 1 件ずつ逐次 create のため **1900 件で十数分**かかる。プロンプトが返らなくても正常なので中断しない。**進捗確認・中断時の注意**は [`import-words`](./import-words.md) の「本番実行時の所要時間・進捗確認・中断時の注意」を参照。

> ⚠️ **手順 2 → 3 の順序は固定**（Blob 削除 → TRUNCATE）。逆順だと孤児 Blob が残る。
>
> Blob ドライバは `BLOB_READ_WRITE_TOKEN` があれば本番 Vercel Blob を選択する。ローカル実行でも token があれば本番 Blob を消すので、手順 2 の dry-run 件数で `.env.production.local` に token が含まれていることを確認する。
>
> `db:purge-blobs` は DB の URL 駆動のため、URL 未保存の真の孤児 Blob は残り得る（許容。必要なら Vercel Dashboard で確認）。

## 確認

```sh
# TRUNCATE 後（手順 3 直後）: 全テーブル 0 行
# 再 seed 後（手順 4 以降）: user は system 1 行のみ
pnpm dotenv -e .env.production.local -- pnpm prisma studio
```

実行後は本番サイトで、データが空であること・手順 5 のあと管理ログインできることを確認する。
