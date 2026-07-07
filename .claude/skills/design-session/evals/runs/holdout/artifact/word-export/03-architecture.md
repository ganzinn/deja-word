# 03. アーキテクチャ

状態: **確定**（2026-07-08）

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- エクスポート対象は本人の登録単語のみ・形式は CSV（01 確定）。
- 列は 単語・意味・登録日 の 3 列、文字コードは UTF-8（BOM 付き）（02 確定）。

## 検討事項リスト

- [x] エクスポートの実行方式（同期ダウンロード / 非同期ジョブ）
- [x] 実装レイヤ（route handler / server action）
- [x] 所有者スコープの効かせ方
- [x] 「意味」列の直列化ルール（02 で未定義だった畳み方の補完）
- [x] CSV インジェクション（数式インジェクション）の扱い
- [x] テスト戦略

## 議論・決定

### 決定 1: 実行方式は同期ダウンロードとする

リクエストに対してその場で CSV を生成し、レスポンスとしてダウンロードさせる。ジョブ登録・一時保存・進捗ポーリング・完了通知は設けない。

採用理由: 対象は本人の登録単語のみ（01 決定1）で、件数は多くても数千件。生成は数十〜数百 ms オーダーで完結し、同期リクエスト内に収まる。非同期ジョブは進捗管理・一時ファイルの保存と失効・通知という付随機構を丸ごと必要とし、この規模には過剰。

却下した代替案: 非同期ジョブ（サーバーで生成 → Vercel Blob 等に一時保存 → ポーリング/通知でダウンロード URL を渡す）。大量データや長時間生成に強いが、本要件の件数規模では機構コストに見合わない。加えて Blob は public 前提（[security-design-checklist](../../reference/security-design-checklist.md) 外部との境界）で、本人限定データの一時保存には別途アクセス制御の設計が要り、複雑化する。

### 決定 2: 実装レイヤは Route Handler（`GET /api/words/export`）とする

CSV バイナリを `Content-Disposition: attachment` 付きで返すダウンロードエンドポイントとして route handler を新設する。認証は既存の `src/app/api/words/search/route.ts` と同型で、handler 内で `auth.api.getSession({ headers: await headers() })` を呼び、未ログインは 401 を返す。ファイル名はサーバー生成の `words-YYYYMMDD.csv`（ユーザー入力に依存しないためヘッダ注入の余地なし）。

- ルーティング: `/api/*` は `src/proxy.ts` の matcher（`/menu /words /quiz /settings`）対象外。api route は proxy ガードされず handler の self-guard で守るのが既存規約であり、export も同じ（matcher 変更不要）。
- CSRF: 本エンドポイントは GET・読み取り専用。書込みではないため Server Action の same-origin 保護の対象外という論点（[security-design-checklist](../../reference/security-design-checklist.md) 外部との境界・CSRF）は非該当。

採用理由: ファイルダウンロードは `Content-Disposition` ヘッダとバイナリ本体の制御が要る。route handler なら `dev-blob` route（`src/app/api/dev-blob/[...key]/route.ts` の `new Response(bytes, { headers })`）と同型で素直に実現できる。ADR-0017「server actions over route handlers」は原則 action 優先だが、「ファイルダウンロードのようにレスポンスヘッダ・バイナリ本体を直接制御する必要がある読み取りエンドポイント」は route handler が適し、本件はその例外に当たる。

却下した代替案: Server Action で CSV 文字列を返し、クライアントで `Blob` 化してダウンロード。`Content-Disposition` を使わずに済むが、文字列を JS シリアライズ経由で丸ごと転送し client 側で組み立てる分だけ経路が複雑になり、BOM・文字コードの扱いも client 依存になる。素直さで route handler に劣る。

### 決定 3: レイヤ内訳は「route handler → 取得クエリ → CSV 生成純関数」の 3 段とする

- **取得クエリ**（`src/lib/*.ts` に読み取り関数として配置、`words-list.ts` / `words-detail.ts` と同じ置き場）: 認証済み userId を受け、本人の単語＋意味を取得する（所有者スコープは決定 4）。
- **CSV 生成純関数**: 取得済みの行データ配列を受け取り、BOM 付き CSV 文字列を返す副作用なしの純関数。DB・session・Request に一切依存しない。これを単体テストの対象にする（決定 7）。CSV のクォート（RFC 4180: カンマ・改行・二重引用符を含むセルの引用とエスケープ）は既存の `csv-parse`（`^7`）の姉妹ライブラリ `csv-stringify`（同一プロジェクト・同系バージョン）を純関数内で用いる。BOM（`﻿`）は生成文字列の先頭に付与する。

採用理由: DB 取得と整形を分離することで、整形ロジック（列の並び・意味の畳み方・BOM・クォート）を DB なしの高速な unit テストで網羅できる（テスト戦略＝決定 7 の前提）。CSV クォートは手書きするとエッジケース（引用符の二重化・改行含みセル）でバグが出やすく、既に依存している `csv` プロジェクトの stringify を使うのが最も安全かつ規約整合（ADR-0002 exact version pinning に従い exact pin して追加）。

却下した代替案: クォートを手書きする純関数。依存追加を避けられるが、RFC 4180 のクォート規則を自前で持つとエスケープ漏れのリスクが残る。テスト対象の純関数という設計自体は同じなので、実装手段として却下（インターフェースは変わらない）。

### 決定 4: 所有者スコープは素の `ownerId: userId` とし、各ネスト階層にも効かせる

取得クエリの where は `scopedOwnerIds(userId)`（system + 本人）ではなく **素の `ownerId: userId`**（本人の行のみ）を使う。ネストして引く意味（Meaning）・意味テキスト（MeaningText）にも各階層で `ownerId: userId` を効かせる。

採用理由:
- 「read は `scopedOwnerIds`（system + 自分）、write は自分の行のみ」がこのコードベースの読み書き非対称の原則（[security-design-checklist](../../reference/security-design-checklist.md) データ所有・テナント分離）。エクスポートは read だが、要件（01 決定1「本人の登録単語のみ・system マスタは対象外」）がスコープをさらに狭めるため、あえて `scopedOwnerIds` を使わず本人の行だけに絞る。これは既定 read パターンからの意図的な逸脱なので明示的決定として記録する。
- ネスト階層に owner 絞り込みをしないと、pass-through（共有単語に他ユーザーが自分の子データを付加できるモデル）に起因して他者所有の意味・意味テキストが混入し得る（`src/lib/words-list.ts:64` 付近の警告と同型のリスク）。各階層に `ownerId: userId` を必須とする。

却下した代替案: `scopedOwnerIds(userId)` を流用（read の既定に合わせる）。system マスタ単語まで含んでしまい 01 決定1（本人のみ）に反するため却下。

### 決定 5: 「意味」列は全 Meaning の全 MeaningText を sortOrder 順にフラット化し `;` で連結する

1 単語は複数 Meaning を持ち、各 Meaning は複数 MeaningText を持つ（`schema.prisma` の Word→Meaning→MeaningText）。これを「意味」1 列（02 決定1）に畳むにあたり、単語配下の全 Meaning の全 MeaningText を `Meaning.sortOrder` → `MeaningText.sortOrder` の順に平坦化し、区切り文字 `;`（既存インポートの `MEANING_TEXT_SEPARATOR`、`scripts/import-words.ts:32`）で連結して 1 セルに収める。品詞（partOfSpeech）・発音（pronunciation）は 3 列制約（02 決定1）により出力しない。セル内改行は使わない。

これは 02 が「意味」を 1 列と決めたものの複数 Meaning/MeaningText の畳み方までは規定していなかった空白を 03 で補完するもので、02 の決定（列＝単語・意味・登録日の 3 列）を覆すものではない。

採用理由: 区切りは既存インポート/中間 CSV と同じ `;` に揃え、コードベース内の意味テキスト連結規約を一本化する。フラット化により Meaning 境界（品詞ごとの区切り）は失われるが、品詞列を持たない 3 列構成では境界を保持する意味が薄く、閲覧・保管という主用途（01）には全訳語が読めれば足りる。セル内改行を避けることで Excel・E2E での取り扱いも単純になる。

却下した代替案: Meaning ごとにセル内改行や別区切りで階層を保持する。品詞情報を持たない構成では区切っても意味が伝わらず、セル内改行は CSV パーサ・目視・E2E 検証を複雑化するため却下。

### 決定 6: CSV インジェクション（数式インジェクション）のサニタイズは行わない

`=` `+` `-` `@` 始まりのセルが表計算ソフトで数式として実行される「CSV/formula インジェクション」に対し、先頭へのクォート付与等のサニタイズは行わない。

採用理由: エクスポートは本人が登録したデータを本人がダウンロードして開く経路であり（01 決定1）、他ユーザー由来の値が自分の CSV に混入する経路は決定 4 の owner 絞り込みで塞がれている。したがってクロステナントの注入経路が存在せず、脅威モデル外。自分のデータで自分を攻撃する誘因もない。

却下した代替案: 先頭 4 記号をサニタイズ（`'` プレフィックス等）。他者/外部にエクスポートを共有する機能が将来入った時点では必要になるが、現時点では登録した意味・見出し語を改変してしまう副作用の方が実害が大きいため却下。**将来エクスポートを他ユーザー・外部と共有する機能を追加する場合はこの決定を再検討する**こと。

### 決定 7: テスト戦略は「CSV 生成純関数の unit テスト＋エクスポート一連の E2E 1 本」とする

- **unit テスト**（`*.unit.test.ts`、CSV 生成純関数にコロケート）: 純関数（決定 3）を DB なしで検証する。観点＝ 列順（単語・意味・登録日）・BOM 先頭付与・`;` 連結（複数 Meaning/MeaningText のフラット化＝決定 5）・意味が空の単語・カンマ/二重引用符/改行を含むセルの RFC 4180 クォート・登録日（`Word.createdAt`）のフォーマット。
- **E2E 1 本**（`.claude/skills/e2e-verify` ハーネス、Playwright）: ログイン → エクスポート実行 → ダウンロードされた CSV の中身を検証、の一連の流れを 1 本通す。実装時に、既存 e2e ヘルパ（トースト/遷移待ちが中心で download 取得は未提供）へ Playwright の download イベント待受を追加する必要がある（実装タスクとして引き継ぐ）。
- integration テストは追加しない。DB 越しの取得＋所有者スコープの実挙動は E2E がカバーし、整形ロジックは純関数 unit が網羅するため、route handler の integration テストは E2E と重複する。

採用理由: 分岐の多い整形ロジックを高速・env 非依存・CI で走る unit テストに寄せ（`src/CLAUDE.md`）、DB・認証・ダウンロード挙動を含む結合部分だけを E2E 1 本で担保する。ADR-0057「integration tests not in CI」の運用とも整合し、CI で回る保証（unit）と手元の end-to-end 保証（E2E）を役割分担できる。

却下した代替案: route handler の integration テストを追加。取得クエリ＋所有者スコープを DB 越しに検証できるが、E2E がその経路を実データで通すため重複。E2E を持つ本件では費用対効果で却下。
