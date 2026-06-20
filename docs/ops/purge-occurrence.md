# Purge Occurrence（掲載箇所ごと単語を一括削除）

ある掲載箇所（Occurrence）に紐づく**英単語（Word）本体・その配下テーブル・発音音源 Blob・掲載箇所本体**をまとめて削除する運用スクリプト。`pnpm db:purge-occurrence` が単一エントリポイント。**引数なしなら対話モード**（一覧から選択 → ドライラン提示 → モード選択）、id 指定なら非対話で動く。非対話の既定はドライラン（件数表示のみ・無変更）で、`--execute` 指定時のみ実削除する。

```sh
pnpm db:purge-occurrence                            # 対話モード（一覧から選択）
pnpm db:purge-occurrence <occurrenceId>             # 非対話・ドライラン
pnpm db:purge-occurrence <occurrenceId> --execute   # 非対話・実削除
```

### 対話モード

引数なしで実行すると以下の流れになる（TTY 必須。本番でも `pnpm dotenv -e .env.production.local -- ...` の手元端末で動く）。

1. 全掲載箇所を `owner / location` 順で一覧表示（オーナーのメールアドレス・紐づく単語数つき）
2. 番号を入力して対象を選択（`q` で中止）
3. **必ずドライランの件数を提示**
4. モード選択 `[1] ドライランのみ（終了）` / `[2] 実削除`
5. 実削除を選んだ場合のみ、確認として**掲載箇所名の入力**を要求（一致しなければ中止）

非対話（id 指定）モードは CI / スクリプトからの利用や、id が分かっている場合の最短経路として残してある。

## 背景・仕様

通常の掲載箇所削除（`deleteOccurrenceForUser` / 設定画面）は掲載箇所と `WordOccurrence` リンクだけを消し、**`Word` 本体は残す**（多対多なので他掲載箇所で使われている可能性があるため）。本スクリプトはそれと別に、シード単語セットの撤去などで「掲載箇所に紐づく単語を丸ごと消す」ための運用ツール。

- **共有単語も完全削除**: 対象掲載箇所と別の掲載箇所の両方に紐づく単語も削除する（他掲載箇所からも消える）。ドライランで「うち他掲載箇所と共有: N」を表示するので影響を確認できる。
- **掲載箇所本体も削除**: 単語削除後に `Occurrence` 行も削除する。オーナー非依存で id を直接指定するため、system 所有の掲載箇所も対象にできる。
- **カスケード**: `Word` 削除で `Meaning` / `Example` / `RelatedWord` / `Memo` / `QuizAnswer` / `WordOccurrence`(→`OccurrenceDetail`) / `DrillWord` が、`Occurrence` 削除で残る `OccurrencePresetSetting` / `Drill` が連鎖削除される。`QuizDefaultSetting` は `occurrenceId` が `null` になるだけ（設定自体は残る）。
- **Blob は手動削除**: 発音音源は DB の cascade では消えない（DB には URL 文字列だけが入る）。スクリプトが削除前に `Meaning` / `RelatedWord` の `pronunciationAudioUrl` を収集し、DB 削除確定後にベストエフォートで `blob.del` する。Blob 削除が失敗しても DB 削除は通り、孤児 Blob が残るだけ（後追い回収可）。

> ⚠️ **不可逆**。実削除前に必ず**同一接続先**でドライランして件数を確認すること。

## 構成

| ファイル | 役割 |
|---|---|
| `scripts/purge-occurrence.ts` | CLI（dotenv + PrismaPg、ドライラン/`--execute`、レポート整形） |
| `src/lib/occurrence-purge.ts` | コアロジック（prisma / blob を引数注入、`server-only` 非依存） |
| `src/lib/blob-client-impl.ts` | Blob ドライバ選択の実体（本番=Vercel Blob / dev=ディスク）。スクリプトはここを直接 import |

接続先は `DIRECT_URL → DATABASE_URL_UNPOOLED → DATABASE_URL` の順で解決する（`$transaction` を使うため**直結＝非プール**を優先）。Blob ドライバは「`NODE_ENV=production` もしくは `BLOB_READ_WRITE_TOKEN` あり → Vercel Blob、それ以外 → ローカルディスク」で選ばれる。

## ローカル（dev DB）での手順

ローカルは `.env` の接続先（docker の `deja-word-db` / DB `dejaword`）に対して実行される。音源はディスク `.dev-blob/` から消える。

最も簡単なのは**対話モード**（一覧から選んで実行）:

```sh
pnpm db:purge-occurrence   # 一覧 → 番号選択 → ドライラン提示 → モード選択
```

id が分かっている場合の非対話手順は以下。

1. 対象 `occurrence.id` を特定する。

   ```sh
   pnpm db:studio   # occurrence テーブルで location から id を確認
   # もしくは:
   docker exec deja-word-db psql -U dejaword -d dejaword -c \
     "select id, location, owner_id from occurrence order by location;"
   ```

2. ドライラン → 件数確認。

   ```sh
   pnpm db:purge-occurrence <id>
   ```

3. 納得したら実削除。

   ```sh
   pnpm db:purge-occurrence <id> --execute
   ```

4. 確認（任意）: `pnpm db:studio` で occurrence / 単語が消えたこと、`.dev-blob/` 配下の対象音源が消えたことを見る。

## 本番（Neon + Vercel Blob）での手順

スクリプトは**ローカルマシンから本番リソースに向けて**実行する（Vercel 上では動かない）。本番の id はローカルと**異なる**ため、必ず本番接続先で対象を選び直す。対話モードなら本番の一覧から直接選べるので id 特定は不要:

```sh
pnpm dotenv -e .env.production.local -- pnpm db:purge-occurrence   # 本番一覧から対話選択
```

以下は id を明示する非対話手順。

### 必要な環境変数

| 変数 | 値 | 用途 |
|---|---|---|
| `DIRECT_URL` | 本番 Neon の**直結（非プール）** 接続文字列 | `$transaction`（インタラクティブ Tx）のため direct を使う。スクリプトが最優先で読む |
| `BLOB_READ_WRITE_TOKEN` | 本番 Vercel Blob ストアの RW トークン | これがあると音源削除が**実 Vercel Blob 経路**になる。未設定だとディスク扱いになり本番 Blob が消えない |

### 手順

1. **本番 env を取得**（Vercel CLI 推奨。無ければ `npm i -g vercel`）。

   ```sh
   vercel env pull .env.production.local --environment=production
   ```

   `DIRECT_URL` / `BLOB_READ_WRITE_TOKEN` が入る（無ければ Neon / Vercel ダッシュボードから手動で `.env.production.local` に記載）。`.env*.local` は `.gitignore` 済み。

2. **本番の occurrence id を特定**。

   ```sh
   pnpm dotenv -e .env.production.local -- pnpm db:studio
   # occurrence テーブルで location（例: "ターゲット1900"）の id を控える
   ```

3. **本番に対してドライラン → 実削除**。

   ```sh
   # dry-run（無変更・件数確認）
   pnpm dotenv -e .env.production.local -- pnpm db:purge-occurrence <本番id>

   # 件数を確認・納得してから実削除
   pnpm dotenv -e .env.production.local -- pnpm db:purge-occurrence <本番id> --execute
   ```

   `pnpm dotenv -e ...` が先に本番 env を `process.env` に載せ、スクリプト内の `import "dotenv/config"`（`.env` 読み込み）は既存値を上書きしないため、ローカル `.env` と混ざらない。

4. **確認**: 本番 DB（Studio / SQL）で occurrence・単語の消滅、Vercel Blob ダッシュボードで音源の消滅を見る。

### 安全策

- 実削除は不可逆。実行前に **Neon のブランチ / PITR** でスナップショットを取っておくと安全（問題時に復元可能）。
- `BLOB_READ_WRITE_TOKEN` が誤り/未設定でも DB 削除は実行され、Blob 削除だけがベストエフォートで失敗（ログのみ）→ 孤児 Blob が残るだけで DB 整合性は保たれる。
- `DIRECT_URL` は必ず**直結エンドポイント**を指すこと。プール（PgBouncer transaction mode）経由だとインタラクティブ Tx で問題が出ることがある。
