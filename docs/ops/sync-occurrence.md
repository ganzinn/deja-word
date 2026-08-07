# Sync Occurrence（掲載箇所の内容を別環境から取り込む）

別環境（本番など）で育った**単語コンテンツ（意味・訳語・注記・例文・関連語・メモ・掲載番号詳細）**を、掲載番号を指定して手元の DB に取り込む運用ツール。「手元では単語だけ入っていて中身が薄い」状態を、確認したい範囲だけ本番と同じ内容に揃えるために使う。

**2 段構成**で、1 つのコマンドが 2 つの DB に同時に接続することはない。

| 段 | コマンド | 接続先 | すること |
|---|---|---|---|
| ① エクスポート | `pnpm db:export-occurrence` | `SOURCE_DATABASE_URL` **のみ** | 読み取って中間 JSON に書き出す |
| ② 反映 | `pnpm db:sync-occurrence` | 通常の `DATABASE_URL` 系（**ローカル DB 以外は中止**） | 中間 JSON を取り込む |

分けている理由:

- **反映側が取り込み元の接続情報を知らない**。取り込み元の接続文字列はエクスポートの 1 コマンドにしか渡らず、反映側は構造的に本番へ書き戻せない。
- **中間 JSON を人がレビューできる**。件数・掲載番号の欠落・関連語リンクを、書き込む前に目視で確かめられる。

```sh
pnpm db:export-occurrence                                              # 対話モード
pnpm db:export-occurrence <掲載箇所名> [<レンジ>] [--email=<addr>] [--out <path>]

pnpm db:sync-occurrence <jsonPath>                                     # 対話モード
pnpm db:sync-occurrence <jsonPath> [<レンジ>] [--email=<addr>] [--location=<名前>] [--execute]
```

**引数なし（jsonPath だけ）で対話モード**になり、一覧から選ぶだけで進む。定期的に同じ範囲を取り込むなら引数指定の非対話で 1 行にまとめられる。

## 掲載箇所は「所有ユーザー + 掲載箇所名」で選ぶ

掲載箇所名は所有者が違えば重複しうる（`@@unique([ownerId, location])`）。同じ名前の掲載箇所が別ユーザーにもあると名前だけでは判別できないため、対話モードは**所有ユーザー（ユーザー名 + email）ごとにグループ化**して一覧を出す。

```text
掲載箇所一覧（所有ユーザーごと）:
  共通 <system@deja-word.internal>
    [1] <掲載箇所名>  (単語=1900)
    [2] <掲載箇所名>  (単語=120)
  山田 <yamada@example.com>
    [3] <掲載箇所名>  (単語=42)
```

非対話では `--email` で所有ユーザーを指定する（**省略時は system ユーザー = 共有マスタ**。既存の `db:import-*` と同じ規約）。

## レンジ（掲載番号の指定）

`1-100,1581-1600` のようにカンマ区切りで範囲と単一番号を混ぜられる（`7` 単独も可）。省略すると掲載番号を持つ全単語が対象になる。

- **突合キーは掲載番号（`WordOccurrence.occurrenceNumber`）**。DB をまたぐと id は一致しないため。
- **掲載番号を持たない単語は対象外**。エクスポートのレポートに件数だけ出る。
- エクスポートで指定したのに存在しない掲載番号は `指定したが不在` として報告する。

## 取り込みの仕様

**対象単語のコンテンツを丸ごと置き換える**（部分マージはしない）。手元にあって JSON に無い訳語・例文・関連語は残らない。取り込み元と同じ状態にすることが目的のため。

反映先の状態ごとの挙動:

| 反映先の状態 | 挙動 |
|---|---|
| 同じ掲載番号に単語あり・見出し語が一致 | 中身を置き換える（**置き換え**） |
| 同じ掲載番号に単語あり・見出し語が不一致 | **スキップして報告**。上書きしない（取り違え防止） |
| 掲載番号は空きだが、同じ見出し語の単語が同一オーナーにある | その単語に掲載番号を張って中身を置き換える（**掲載番号を追加して置き換え**） |
| 単語ごと無い | 単語・掲載番号リンクごと作る（**新規作成**） |
| 掲載箇所ごと無い | 掲載箇所を作る（`autoNumbering` は JSON から引き継ぎ、プリセットはオーナー本人ぶんのみ ON） |

**触らないもの**: 単語本体の id・ブックマーク・解答履歴（`QuizAnswer`）・定着 drill。置き換えは意味・例文・関連語・メモ・掲載番号詳細だけで、単語行を消さないため巻き添えの cascade も起きない。

### 発音音源は同期しない

音源の実体は環境ごとに別（本番 = Vercel Blob の絶対 URL / dev = ローカルディスクの相対 key）で、URL をそのまま持ち込むと**解決できない行**になる（再生できないうえ `pronunciationAudioUrl` が非 NULL になるため TTS フォールバックも効かない）。

そこで**置き換えの直前に反映先の音源 URL を退避し、置き換え後に付け直す**。既に手元へ登録済みの音源は失われない。同定キーは次のとおり。

| 保持先 | 同定キー |
|---|---|
| 意味（`Meaning`） | `sortOrder` |
| 例文（`Example`） | 本文（`text`） |
| 関連語（`RelatedWord`） | 見出し（`term`） |

JSON 側の `pronunciationAudioUrl` は参考情報として残るが、**反映側は常に無視する**。新規作成された行には音源が付かない（音源の投入は [`import-audio`](./import-audio.md) の責務）。

### 関連語の内部リンク

`RelatedWord.linkedWordId` は id ではなく**リンク先の見出し語**（`linkedHeadword`）で書き出し、反映先の同一オーナーの見出し語から引き直す。同じ取り込みで後から作られる単語への参照（前方参照）にも対応するため、全件を書き終えてからまとめて解決する。解決できなかったものはリンク無しで登録し、末尾に一覧で報告する。

### 原子性・中断

単語 1 件 = 1 トランザクションで、**取り込み全体は非原子**（[`import-words`](./import-words.md) / [`import-audio`](./import-audio.md) と同方針。リモートへの往復が長いため長大トランザクションを避ける）。中断しても壊れず、**同じコマンドの再実行で全件やり直せる**（置き換えなので何度流しても同じ結果になる）。

## 接続情報の用意（コミットしない）

エクスポート元の接続文字列は **`SOURCE_DATABASE_URL`** で渡す。他の運用スクリプトと違い `DATABASE_URL` にはフォールバックしない（取り違えて手元の DB をエクスポートしても気付けないため、専用の変数を要求する）。

**接続文字列はコード・ドキュメントに書かず、gitignore 済みの env ファイルに置く**（`.env*` は `.env.example` / `.env.test.example` を除き gitignore 済み）。

```sh
# 1) 取り込み元の接続文字列を用意する（例: Vercel から取得して転記する）
pnpm exec vercel env pull .env.production.local --environment=production

# 2) 接続文字列だけを専用ファイルへ転記する（このファイルはコミットされない）
#    SOURCE_DATABASE_URL="<取り込み元の接続文字列>"
$EDITOR .env.sync-source.local

# 3) そのファイルを dotenv で渡してエクスポートする
pnpm dotenv -e .env.sync-source.local -- pnpm db:export-occurrence
```

`pnpm dotenv -e ...` が先に `SOURCE_DATABASE_URL` を `process.env` に載せ、スクリプト内の `import "dotenv/config"`（`.env` 読み込み）は既存値を上書きしないため、手元の `.env` と混ざらない。

エクスポートは起動時に**接続先のホスト名だけ**を表示する（資格情報は出さない）。想定と違うホストが出たら中止すること。

> ⚠️ 使い終わったら `.env.sync-source.local` と `.env.production.local` を消すか、少なくとも他の作業に持ち越さないこと。エクスポートは読み取りしかしないが、接続文字列そのものは書き込み権限を持つ。

## 反映先のガード

`db:sync-occurrence` は接続先が **localhost / 127.0.0.1 / ::1 以外なら、何もせず中止する**（`isLocalDatabaseUrl`、`src/lib/blob-driver-guard.ts`）。本番へ書き戻すためのツールではない。

```text
反映先がローカル DB ではありません（host=...）。中止します。
  このツールはローカル DB 専用です。本番へ書き戻す用途では使えません。
```

非対話の既定はドライラン（無変更・件数表示のみ）で、`--execute` を付けたときだけ書き込む。対話モードはドライランを提示してからモードを選ばせる。

## 手順

```sh
# 1) エクスポート（取り込み元・読み取りのみ）。対話で掲載箇所とレンジを選ぶ
pnpm dotenv -e .env.sync-source.local -- pnpm db:export-occurrence
#    → tmp/occurrence-export.json（tmp/ は gitignore 済み）

# 2) 中間 JSON を目視確認（件数・掲載番号の欠落・関連語リンク）
jq '.occurrence, (.entries | length), (.entries[0])' tmp/occurrence-export.json

# 3) 反映（手元の DB）。対話でユーザー・掲載箇所を選び、ドライランを見てから実反映
pnpm db:sync-occurrence tmp/occurrence-export.json
```

非対話で同じことを繰り返す場合（定期的な追随）:

```sh
pnpm dotenv -e .env.sync-source.local -- \
  pnpm db:export-occurrence "<掲載箇所名>" "<レンジ>" --out tmp/occurrence-export.json
pnpm db:sync-occurrence tmp/occurrence-export.json --execute
```

## レポートの読み方

```text
エクスポート元:
  掲載箇所        : "<掲載箇所名>"
  所有ユーザー    : 共通 <system@deja-word.internal> (system)
  単語数          : 120
  掲載番号        : 1-100,1581-1600

反映先:
  ユーザー        : 共通 <system@deja-word.internal> (system)
  掲載箇所        : "<掲載箇所名>"

結果:
  対象の掲載番号  : 120
  置き換え      : 120
  新規作成      : 0
  掲載番号を追加して置き換え: 0
  引き継ぐ発音音源: 120
  スキップ        : 0
  件数が変わる単語: 118
    - No.1 <見出し語>: 意味 1→2 / 例文 0→3 / 関連語 0→2 / メモ 0→0
```

- **引き継ぐ発音音源** が対象単語数と大きく食い違うなら、手元の音源が退避できていない可能性がある（同定キーが変わった、など）。実反映の前に確認する。
- **スキップ** は上書きしなかった単語。`見出し語の不一致` は掲載番号のズレを示すので、原因を調べてから対処する。
- **関連語リンクの未解決** はリンク先の単語が反映先に無い場合。範囲を広げて取り込み直せば解消することがある。

## 構成

| ファイル | 役割 |
|---|---|
| `scripts/export-occurrence.ts` | エクスポート CLI（`SOURCE_DATABASE_URL` 限定・対話選択・JSON 書き出し） |
| `scripts/sync-occurrence.ts` | 反映 CLI（ローカル DB ガード・対話選択・ドライラン/実反映・レポート整形） |
| `src/lib/occurrence-sync.ts` | コア（prisma 引数注入、`server-only` 非依存）。エクスポート・置き換え・音源退避・リンク解決 |
| `src/lib/occurrence-purge.ts` | `listOccurrences`（所有ユーザー付きの掲載箇所一覧。対話選択で共有） |
| `src/lib/import-owner.ts` | `resolveImportOwner` / `listImportOwners`（オーナー解決・一覧） |
| `src/lib/blob-driver-guard.ts` | `isLocalDatabaseUrl`（反映先がローカルかの判定） |

設計判断の背景は [ADR-0093](../adr/0093-occurrence-content-export-import-sync.md)。
