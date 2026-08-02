# Import Related Words（関連語の CSV 一括登録）

既に登録済みの単語に対し、関連語（`RelatedWord`：同意語 `SYNONYM` / 反意語 `ANTONYM` / 派生語 `DERIVATIVE`）を CSV から**まとめて登録**する運用スクリプト。`pnpm db:import-related-words` が単一エントリポイント。**単語を `db:import-words` で登録した後**に走らせる（リンク先を掲載番号で解決するため）。`db:import-words` と同じく、**引数なしなら対話モード**、非対話の既定はドライラン、`--execute` 指定時のみ実登録する。

```sh
pnpm db:import-related-words                                            # 対話モード
pnpm db:import-related-words <location> <csvPath>                       # system 宛て・ドライラン
pnpm db:import-related-words <location> <csvPath> --execute             # system 宛て・実登録
pnpm db:import-related-words <location> <csvPath> --email=foo@bar.com   # 個人ユーザー宛て
```

`<location>` は**単語を登録済みの掲載箇所名**。見つからなければ中止する（先に `db:import-words` を実行する）。

## CSV 仕様

ヘッダ行は **`headword,kind,term,meaning,link_number`** 固定（一致しなければエラー終了）。1 行＝1 関連語。

| 列 | 必須 | 内容 |
|---|---|---|
| `headword` | ✅ | 親単語の見出し語。**登録先オーナーに既存**であること（無ければその行をスキップして報告） |
| `kind` | ✅ | `SYNONYM` / `ANTONYM` / `DERIVATIVE` の**enum キー**（`src/lib/mock/related-word-kinds.ts`）。enum 外はエラー終了 |
| `term` | ✅ | 関連語の語（`make sure` 等の連語、`【米】check` 等のラベル付きも可） |
| `meaning` | – | 関連語の訳。空なら無し |
| `link_number` | – | リンク先の**掲載番号**（`occurrence_number`）。空ならリンクなし |

```csv
headword,kind,term,meaning,link_number
increase,ANTONYM,decrease,,223
environment,SYNONYM,surroundings,,
artificial,ANTONYM,natural,自然の,
argue,SYNONYM,claim,,110
argue,SYNONYM,maintain,,206
monk,ANTONYM,nun,"修道女, 尼",
```

`term`/`meaning` 内にカンマを含める場合は `"..."` で囲む（`csv-parse` が解釈）。

## 仕様

- **登録先**: `--email` 省略 → `system` 所有。指定 → その `User` 所有（email は小文字化）。関連語の `ownerId` は親単語と同じオーナーになる。
- **リンク解決**: `link_number` があれば、同じ掲載箇所の `WordOccurrence.occurrence_number` が一致する単語を `linkedWordId` に張る。前方/後方どちらの参照でも、対象単語が登録済みなら解決できる。
  - 解決できない場合は**エラーにせず**`linkedWordId` を null のままにして報告する。理由は `out_of_range`（番号が最大掲載番号超）/ `target_not_found`（番号の単語が未登録）。
- **親単語が見つからない行**は `word_not_found` でスキップして続行する。
- **マージ・重複排除はしない**（再実行すると同じ関連語をもう一度作る）。同じ単語内の `sortOrder` は CSV の出現順。

> ⚠️ 関連語は意味欄の埋め込み記法をパースした生成物（`scripts/split-target1900.ts` の `*.related.csv`）であることが多い。実登録前に **CSV を目視レビュー**し、同一接続先でドライランして件数・未解決リンク・word 未検出を確認すること。

## 構成

| ファイル | 役割 |
|---|---|
| `scripts/import-related-words.ts` | CLI（dotenv + PrismaPg、CSV 読込/パース、ドライラン/`--execute`、レポート整形） |
| `src/lib/related-word-import.ts` | コアロジック（prisma を引数注入、`server-only` 非依存）。掲載番号 → wordId・headword → wordId を引いてリンク解決 |
| `src/lib/import-owner.ts` | owner 解決（`db:import-words` と共有） |

接続先は `DIRECT_URL → DATABASE_URL_UNPOOLED → DATABASE_URL` の順で解決する。CSV パースには `csv-parse/sync` を使う。

## ターゲット1900 の手順（dev DB）

```sh
# 0) 元 CSV を分解（使い捨て生成スクリプト）
pnpm tsx scripts/split-target1900.ts                 # → tmp/target1900.{words,related}.csv

# 1) 単語を先に登録（→ docs/ops/import-words.md）
pnpm db:import-words "ターゲット1900" tmp/target1900.words.csv --execute

# 2) related.csv を目視レビューしてからドライラン → 実登録
pnpm db:import-related-words "ターゲット1900" tmp/target1900.related.csv
pnpm db:import-related-words "ターゲット1900" tmp/target1900.related.csv --execute
```

発音音源（mp3）を入れる場合は、この後に [`db:import-audio`](./import-audio.md) を実行する。

ドライラン例（実データ）:

```text
結果:
  CSV 行数        : 183
  関連語予定  : 183
  リンク解決      : 52
  word 未検出     : 0
  未解決リンク    : 0
```

## 本番（Neon）での手順

`db:import-words` と同様、**ローカルマシンから本番リソースに向けて**実行する。

```sh
vercel env pull .env.production.local --environment=production

pnpm dotenv -e .env.production.local -- pnpm db:import-related-words "ターゲット1900" tmp/target1900.related.csv
pnpm dotenv -e .env.production.local -- pnpm db:import-related-words "ターゲット1900" tmp/target1900.related.csv --execute
```

`<location>` は**単語登録時と同じ掲載箇所名**（例: `英単語ターゲット1900(6訂版)`）。省略不可で、間違えると `word_not_found` で全行スキップになる。実登録前に **Neon のブランチ / PITR** でスナップショットを取っておくと安全。

本番は往復遅延で時間がかかる（単語ほどではないが数分見ておく）。プロンプトが返らなくても正常。**進捗確認（別ターミナルの psql で件数監視）・中断時の注意**は [`import-words`](./import-words.md) の「本番実行時の所要時間・進捗確認・中断時の注意」と同じ要領（`related_word` の件数を数える）。関連語は重複排除しないため、中断後の単純な再実行は**重複登録**になる点に注意（やり直すなら掲載箇所ごと [`db:purge-occurrence`](./purge-occurrence.md) で掃除してから単語・関連語を入れ直す）。
