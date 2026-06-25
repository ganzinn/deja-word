# Import Words（掲載箇所＋単語＋意味の CSV 一括登録）

掲載箇所（Occurrence）を新規作成し、CSV の英単語・意味（Meaning / MeaningText）を**まとめて登録**する運用スクリプト。`pnpm db:import-words` が単一エントリポイント。**引数なしなら対話モード**（登録先・掲載箇所名・CSV パスを順に入力 → ドライラン提示 → モード選択）、引数指定なら非対話で動く。**email 未指定なら system ユーザー所有（共有マスタ）として登録**する（`ターゲット1900` 等と同じ位置づけ）。非対話の既定はドライラン（件数表示のみ・無変更）で、`--execute` 指定時のみ実登録する。

```sh
pnpm db:import-words                                            # 対話モード（順に設定を入力）
pnpm db:import-words <location> <csvPath>                       # system 宛て・ドライラン
pnpm db:import-words <location> <csvPath> --execute             # system 宛て・実登録
pnpm db:import-words <location> <csvPath> --email=foo@bar.com   # 個人ユーザー宛て
```

### 対話モード

引数なしで実行すると以下の流れになる（TTY 必須）。

1. **登録先ユーザーの email** を入力（空 Enter で system 共有マスタ）
2. **掲載箇所名** を入力（必須）
3. **CSV ファイルパス** を入力（必須）
4. **ドライランの件数・スキップ明細を提示**
5. モード選択 `[1] ドライランのみ（終了）` / `[2] 実登録`

非対話（`<location> <csvPath>` 指定）モードは CI / スクリプトからの利用や、設定が分かっている場合の最短経路として残してある。`Ctrl+C` / `Ctrl+D` はいつでも中止扱いになる。

## CSV 仕様

ヘッダ行は **`headword,part_of_speech,meaning_text`** 固定（一致しなければエラー終了）。1 行＝1 単語＝1 Meaning。

| 列 | 必須 | 内容 |
|---|---|---|
| `headword` | ✅ | 見出し語。空行は除外される |
| `part_of_speech` | – | 品詞。`src/lib/mock/parts-of-speech.ts` の**英語キー**（`verb`/`noun`/`adjective`/… ＝ `commonPartOfSpeechValues`）で指定。空なら無し（null）。**enum 外の値はエラー終了**（ドライランで検出。日本語ラベルや短縮形は不可） |
| `meaning_text` | ✅ | 意味。`;` 区切りで**複数の MeaningText** に分割される。全部空なら「意味なし」でスキップ |

```csv
headword,part_of_speech,meaning_text
ubiquitous,adjective,どこにでもある;遍在する
concise,adjective,簡潔な
lucid,,明快な
```

```csv
headword,part_of_speech,meaning_text
create,,を創り出す;を引き起こす
concise,adjective,簡潔な
```

- 意味テキスト内に**カンマ（、や ,）**を含めてよい（引用符なしでも 3 列目以降を結合して復元する。確実を期すなら `"..."` で囲む）。
- 複数意味の区切りは **`;`**（meaning_text 内の `、` は区切りにならない）。**全角カッコ内の `;`**（例 `（～に;...するのに）十分な`）は区切りにせず 1 意味として扱う（深さ対応分割。`src/lib/meaning-text-parser.ts` の `splitMeaningTexts`）。
- このツールは meaning_text を**そのまま**意味として登録する。`増加する（⇔ decrease ⇒ 223）` のような**関連語（≒/⇔）の埋め込み記法は解釈しない**（カッコごと意味文字列になる）。`ターゲット1900` のようにこの記法を含む元 CSV は、先に分解してから取り込む（次節）。

### 関連語を含む元 CSV（ターゲット1900）の取り込み手順

`tmp/target1900.csv` は意味欄に関連語（同意語 `≒` / 反意語 `⇔`、`⇒ N` で掲載番号リンク）が埋め込まれている。
取り込みは **3 段** で行う:

1. **分解**（使い捨て生成スクリプト）— 意味本文と関連語を 2 ファイルに切り出す。

   ```sh
   pnpm tsx scripts/split-target1900.ts            # → tmp/target1900.words.csv / tmp/target1900.related.csv
   ```

2. **単語登録** — 生成された `words.csv`（関連語注記を除去済み）を**本ツール**で取り込む。

   ```sh
   pnpm db:import-words "ターゲット1900" tmp/target1900.words.csv          # dry-run
   pnpm db:import-words "ターゲット1900" tmp/target1900.words.csv --execute
   ```

3. **関連語登録** — `related.csv` を**人手レビュー後**、`db:import-related-words` で取り込む（→ `docs/ops/import-related-words.md`）。掲載番号リンクは単語登録済みであることが前提（このとき掲載番号＝本の見出し番号になる＝スキップ 0 のため）。

## 仕様

- **登録先**: `--email` 省略 → `system` ユーザー所有。指定 → その `User`（email は小文字化して検索）所有。
- **掲載箇所**: 新規作成し**自動採番 ON**。掲載番号は**実際に登録された単語の順**に `1,2,3…`。
  - 共通の掲載箇所はオプトイン方式のため、プリセット設定（`OccurrencePresetSetting`）は**掲載箇所オーナー本人ぶんのみ**付与する（system 所有なら system のみ、個人所有ならそのユーザー本人のみ）。
  - 他の既存ユーザー・将来のユーザーには付与しない。各自が `/settings/occurrences` で必要に応じて ON にする。
- **重複は skip（マージしない）**: 登録先オーナーに同じ `headword` が既存なら、その行を**スキップして続行**する。CSV 内の重複・意味なし行も同様にスキップし、明細を報告する。
- **掲載箇所名の衝突**: 登録先スコープ（system＋本人）に同名の掲載箇所が既にあれば中止する（別名にするか既存を整理）。
- 例文 / 関連語 / メモ / 補足 / 発音音源は登録対象外（単語＋意味＋掲載箇所のみ）。

> ⚠️ 実登録前に必ず**同一接続先**でドライランして件数・スキップ明細を確認すること。

## 構成

| ファイル | 役割 |
|---|---|
| `scripts/import-words.ts` | CLI（dotenv + PrismaPg、CSV 読込/パース/前処理、ドライラン/`--execute`、レポート整形） |
| `src/lib/bulk-word-import.ts` | コアロジック（prisma を引数注入、`server-only` 非依存）。`seed.ts` の `seedSystemWord` と同じネスト create |

接続先は `DIRECT_URL → DATABASE_URL_UNPOOLED → DATABASE_URL` の順で解決する（`$transaction` を使うため直結＝非プールを優先）。CSV パースには `csv-parse/sync` を使う。

## ローカル（dev DB）での手順

ローカルは `.env` の接続先（docker の `deja-word-db` / DB `dejaword`）に対して実行される。

1. CSV を用意（上記仕様）。`ターゲット1900` は先に `scripts/split-target1900.ts` で `tmp/target1900.words.csv` を生成しておく（関連語を含む元 CSV をそのまま入れない）。
2. ドライラン → 件数・スキップ確認。

   ```sh
   pnpm db:import-words "ターゲット1900" tmp/target1900.words.csv
   ```

   ```text
   登録先            : system (system@deja-word.internal)
   掲載箇所          : "ターゲット1900" (未作成)
   プリセット付与    : 1 ユーザー
   結果:
     CSV 行数        : 1900
     登録予定(Word) : 1900
     スキップ        : 0

   [dry-run] 変更はありません。実登録するには --execute を付けて再実行してください。
   ```

3. 納得したら実登録。

   ```sh
   pnpm db:import-words "ターゲット1900" tmp/target1900.words.csv --execute
   ```

4. 確認（任意）: `pnpm db:studio` で `occurrence`（owner=system）/ `word` / `meaning` / `meaning_text` / `word_occurrence`（掲載番号）/ `occurrence_preset_setting`（オーナー本人ぶんのみ）を見る。
5. 関連語も入れる場合は続けて `tmp/target1900.related.csv` を `db:import-related-words` で取り込む（→ `docs/ops/import-related-words.md`）。

引数なしの **対話モード**でも同じことができる（登録先 Enter→system / 掲載箇所名 `ターゲット1900` / CSV パス `tmp/target1900.words.csv` を順に入力 → ドライラン提示 → `[2] 実登録`）。個人ユーザー宛てに入れたい場合は `--email=<対象ユーザーの email>` を付ける（掲載箇所もそのユーザー所有になり、プリセットは本人のみ）。

## 本番（Neon）での手順

スクリプトは**ローカルマシンから本番リソースに向けて**実行する（Vercel 上では動かない）。

```sh
vercel env pull .env.production.local --environment=production   # DIRECT_URL を取得

# dry-run（無変更・件数確認）
pnpm dotenv -e .env.production.local -- pnpm db:import-words "ターゲット1900" tmp/target1900.words.csv

# 件数を確認・納得してから実登録
pnpm dotenv -e .env.production.local -- pnpm db:import-words "ターゲット1900" tmp/target1900.words.csv --execute
```

`pnpm dotenv -e ...` が先に本番 env を `process.env` に載せ、スクリプト内の `import "dotenv/config"`（`.env` 読み込み）は既存値を上書きしないため、ローカル `.env` と混ざらない。実登録前に **Neon のブランチ / PITR** でスナップショットを取っておくと安全。

### 本番実行時の所要時間・進捗確認・中断時の注意

本番 Neon はリージョンによってローカルマシンからの往復遅延が大きい（実測例: `ap-southeast-1` へ日本から 1 往復 ≈ 80ms。ローカル docker DB は ≈ 0.5ms）。単語登録は **1 単語ずつ逐次 create**（`bulk-word-import.ts` のループ。各 create は word → meaning → meaning_text → word_occurrence のネストで内部的に複数文 = **1 単語あたり 5〜6 往復**）のため、1900 語で **十数分**かかり、その間プロンプトは返らない。**これは正常**で、安易に中断しないこと。

進捗・状態は**別ターミナル**から確認する。ホストに psql を入れなくても、稼働中の docker `deja-word-db` の psql で本番に接続できる:

```sh
URL="$(grep -E '^DATABASE_URL_UNPOOLED=' .env.production.local | cut -d= -f2- | tr -d '"')"

# (a) いま DB が何をしているか（active=処理中 / wait_event_type=Lock=ロック待ち / idle in transaction=クライアント待ち＝正常）
docker exec -i deja-word-db psql "$URL" -c \
  "select pid, state, wait_event_type, now()-query_start as since_q, left(query,60) q
     from pg_stat_activity where state <> 'idle' and query not ilike '%pg_stat_activity%';"

# (b) 実際の進捗（単語は 1 件ずつコミットされるので別接続から件数が増えていくのが見える。掲載箇所名は実際に使った正確な名前を指定）
docker exec -i deja-word-db psql "$URL" -c \
  "select count(*) from word_occurrence wo join occurrence o on o.id=wo.occurrence_id where o.location='英単語ターゲット1900(6訂版)';"
```

> ⚠️ **単語ループは 1 件ずつコミット（インポート全体は非原子的）**。掲載箇所は先に別トランザクションで作成・コミットされ、その後の単語ループも 1 件ずつコミットされる。途中で **Ctrl+C すると掲載箇所＋作成済みの単語が残る**（全ロールバックではない）。再実行は掲載箇所名の衝突で中止になるため、やり直すときは先に [`db:purge-occurrence`](./purge-occurrence.md) でその掲載箇所を掃除してから入れ直す。

> 💡 出力をログに残すと後追いしやすい: `... --execute 2>&1 | tee tmp/import.log`
