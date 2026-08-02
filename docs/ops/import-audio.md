# Import Audio（発音音源 mp3 の一括登録）

既に登録済みの単語へ、**発音音源（mp3）をディレクトリからまとめて登録**する運用スクリプト。`pnpm db:import-audio` が単一エントリポイント。**引数なしなら対話モード**（登録先・掲載箇所名・音源ディレクトリを順に入力 → ドライラン提示 → モード選択）、引数指定なら非対話で動く。**email 未指定なら system ユーザー所有（共有マスタ）**の単語が対象。非対話の既定はドライラン（件数表示のみ・無変更）で、`--execute` 指定時のみ実登録する。

```sh
pnpm db:import-audio                                              # 対話モード
pnpm db:import-audio <location> <audioDir>                        # system 宛て・ドライラン
pnpm db:import-audio <location> <audioDir> --execute              # system 宛て・実登録
pnpm db:import-audio <location> <audioDir> --email=foo@bar.com    # 個人ユーザー宛て
```

管理画面（単語編集）からの 1 件ずつのアップロードと**同じ登録先・同じ Blob パス規約**（`audio/meaning/<meaningId>/pronunciation.mp3`）で書き込むため、登録後の差し替え・削除は通常どおり画面から行える。

## 音源ディレクトリの仕様

ファイル名は **`<掲載番号>.mp3`** または **`<掲載番号>_<見出し語メモ>.mp3`**（0 埋めの有無は問わない）。

```text
tmp/1900_split/EN/
  0001.mp3          → 掲載番号 1 の単語へ
  0004_mean.mp3     → 掲載番号 4 の単語へ（"mean" はメモ。突合には使わない）
```

- **突合キーは掲載番号（`WordOccurrence.occurrenceNumber`）だけ**。`_` 以降のメモは登録先の決定には使わず、DB の見出し語と食い違う場合に**警告として全件一覧表示する**（教材の音源ファイルは作成時の聞き取りメモが付いていることがあり、綴り違い・近傍の語名が混ざるため。番号を正とする）。
- mp3 以外・命名規則に合わないファイルは無視し、件数を表示する。
- **空ファイル / 4MB 超**があれば、1 件も登録せずエラー終了する（4MB は画面アップロードと同じ上限）。

## 仕様

- **登録先は対象単語の先頭 `Meaning`**（`sortOrder` 昇順の 1 件目）。単語詳細の表示も単語テストの出題（`questionBaseOf`）も先頭 Meaning の音源を使うため。2 件目以降の Meaning・関連語（`RelatedWord`）は対象外。
- **既に音源が登録済みの行は常にスキップ**する（上書きしない）。中断しても**同じコマンドの再実行で続きから再開**できる。差し替えたい場合は画面から削除するか、対象を掃除してから入れ直す。
- **1 件ずつ Blob put → DB update**（[ADR-0044](../adr/0044-blob-best-effort-delete.md) と同じ「Blob 先・DB 後」の順序）。put 失敗なら完全無変更、update 失敗でも孤児 Blob が残るだけで DB は無傷。**取り込み全体は非原子的**（`import-words` / `import-related-words` と同方針。本番 Blob / Neon への往復が長く、長大トランザクションを避けるため）。
- **1 件の失敗では止まらない**。失敗を記録して続行し、末尾にまとめて報告して終了コード 1 で終わる。再実行すれば成功済みはスキップされ、失敗分だけ再試行される。
- レポートは「登録（予定）件数 / スキップ内訳（掲載番号に単語なし・意味なし・音源登録済み・掲載番号の重複）/ 音源が付かない掲載番号 / ファイル名メモの不一致」を出す。明細が多いものは先頭 10 件＋残数表示、**メモ不一致だけは全件表示**（目視レビュー用）。

> ⚠️ 実登録前に必ず**同一接続先**でドライランして、件数とメモ不一致の一覧を確認すること。

## 構成

| ファイル | 役割 |
|---|---|
| `scripts/import-audio.ts` | CLI（dotenv + PrismaPg、ディレクトリ走査・ファイル名パース・対話・進捗/レポート整形） |
| `src/lib/audio-import.ts` | コアロジック（prisma / blob を引数注入、`server-only` 非依存）。突合・仕分け・put/update |
| `src/lib/blob-client-impl.ts` | Blob ドライバ選択の実体（本番=Vercel Blob / dev=ローカルディスク `.dev-blob/`） |

接続先は `DIRECT_URL → DATABASE_URL_UNPOOLED → DATABASE_URL` の順で解決する。Blob ドライバは「`NODE_ENV=production` もしくは `BLOB_READ_WRITE_TOKEN` あり → Vercel Blob、それ以外 → ローカルディスク」で選ばれる。

## ターゲット1900 の手順（dev DB）

単語登録（[`import-words`](./import-words.md)）→ 関連語登録（[`import-related-words`](./import-related-words.md)）の**後**に実行する。掲載番号が本の見出し番号と一致していること（＝単語登録時のスキップが 0 件だったこと）が前提。

```sh
# 1) ドライラン: 件数とメモ不一致を確認
pnpm db:import-audio "英単語ターゲット1900(6訂版)" tmp/1900_split/EN

# 2) 実登録
pnpm db:import-audio "英単語ターゲット1900(6訂版)" tmp/1900_split/EN --execute
```

```text
登録先            : system (system@deja-word.internal)
掲載箇所          : "英単語ターゲット1900(6訂版)" (id=...)
結果:
  音源ファイル数  : 1900
  登録予定      : 1900
  スキップ        : 0
  音源が付かない掲載番号: 0
  ファイル名メモの不一致: 67 件（登録は掲載番号を正とする）
    - 0025_effect.mp3 : メモ "effect" / DB "affect"
    ...
```

確認（任意）:

```sh
docker exec deja-word-db psql -U dejaword -d dejaword -c \
  "select count(*) filter (where pronunciation_audio_url is not null) as with_audio, count(*)
     from meaning where owner_id='system';"
# 配信も確認する場合（dev サーバ起動中）: DB の URL をそのまま GET してファイルと一致するか見る
curl -s -o /tmp/a.mp3 -w '%{http_code} %{content_type}\n' "http://localhost:3000<pronunciation_audio_url>"
```

意味読み上げ用の音源（`JA/`）は登録対象外。意味読み上げ音源は [ADR-0045](../adr/0045-remove-translation-audio.md) で廃止済みで、DB にも保持先が無い。

## 本番（Neon + Vercel Blob）での手順

スクリプトは**ローカルマシンから本番リソースに向けて**実行する（Vercel 上では動かない）。DB だけでなく **`BLOB_READ_WRITE_TOKEN` が必須**（未設定だと本番 Blob 経路で明示エラーになる）。

```sh
pnpm exec vercel env pull .env.production.local --environment=production  # DIRECT_URL / BLOB_READ_WRITE_TOKEN を取得

# dry-run（無変更・件数とメモ不一致の確認）
pnpm dotenv -e .env.production.local -- pnpm db:import-audio "英単語ターゲット1900(6訂版)" tmp/1900_split/EN

# 確認・納得してから実登録（ログを残すと後追いしやすい）
pnpm dotenv -e .env.production.local -- pnpm db:import-audio "英単語ターゲット1900(6訂版)" tmp/1900_split/EN --execute 2>&1 | tee tmp/import-audio.log
```

`pnpm dotenv -e ...` が先に本番 env を `process.env` に載せ、スクリプト内の `import "dotenv/config"`（`.env` 読み込み）は既存値を上書きしないため、ローカル `.env` と混ざらない。

### 所要時間・進捗確認・中断時の注意

1 件あたり「Blob put 1 往復 + DB update 1 往復」を逐次実行する（ローカル docker + ディスク driver では 1900 件で 10 秒弱だが、本番は往復遅延が支配的）。**1900 件で十数分〜30 分程度**を見込み、その間プロンプトは返らない。50 件ごとに `... 350/1900 件 (経過 …s / 残り目安 …s)` と進捗が出るので、それが進んでいる限り正常。

- **中断しても壊れない**。登録済みは次回スキップされるので、同じコマンドを再実行すれば続きから再開する（`import-words` / `import-related-words` と違い、やり直しに掃除は不要）。
- 途中経過は別ターミナルからも数えられる:

  ```sh
  URL="$(grep -E '^DATABASE_URL_UNPOOLED=' .env.production.local | cut -d= -f2- | tr -d '"')"
  docker exec -i deja-word-db psql "$URL" -c \
    "select count(*) from meaning where owner_id='system' and pronunciation_audio_url is not null;"
  ```

- 失敗が残った場合は末尾に一覧が出て終了コード 1 になる。**同じコマンドをそのまま再実行**すれば失敗分だけ再試行される。
- 登録した Blob をまとめて消す手段は [`purge-blobs`](./purge-blobs.md)（全件・破壊的）か、掲載箇所ごとの [`purge-occurrence`](./purge-occurrence.md)。本番で安易に使わない。
