# 単語エクスポート 設計ドキュメント（ハブ）

登録した単語を CSV としてダウンロードできる機能の設計ドキュメント群の入口。
**単語エクスポート の設計に関わるセッションは、必ずこのファイルから読み始めること。**

## 目的・スコープ

自分が登録した単語を手元に取り出し、他ツールでの復習や保管に使えるようにする。取り込み（インポート）は対象外。

スコープの詳細（何をやる / やらない）は [01-requirements.md](01-requirements.md) で定義する。

## 確定事項サマリ

結論のみを記載する。採用理由・却下した代替案は各トピックファイルを参照。

- **エクスポート対象は本人の登録単語のみ・形式は CSV**。→ [01](01-requirements.md)
- **列は 単語・意味・登録日 の 3 列、文字コードは UTF-8（BOM 付き）**。→ [02](02-export-format.md)
- **実行方式は同期ダウンロード。`GET /api/words/export`（route handler、handler 内で session 認証、`Content-Disposition: attachment`）**。→ [03](03-architecture.md)
- **取得は素の `ownerId: userId`（system マスタ除外）で各ネスト階層に owner 絞り込み。整形は BOM 付き CSV を返す純関数（`csv-stringify` 使用）に分離**。→ [03](03-architecture.md)
- **「意味」列は全 Meaning の全 MeaningText を sortOrder 順にフラット化し `;` 連結。CSV 数式インジェクションのサニタイズは本人データ→本人閲覧のため行わない**。→ [03](03-architecture.md)
- **テストは CSV 生成純関数に unit、エクスポート一連の流れに E2E 1 本（integration は追加しない）**。→ [03](03-architecture.md)

## トピック状態表

状態: `未着手` → `議論中` → `確定`

| ファイル | 状態 | 要約 |
| --- | --- | --- |
| [01-requirements.md](01-requirements.md) | 確定（2026-07-04） | 要求・ユースケース・スコープ外 |
| [02-export-format.md](02-export-format.md) | 確定（2026-07-05） | CSV の列・文字コード |
| [03-architecture.md](03-architecture.md) | 確定（2026-07-08） | 実行方式・実装レイヤ・所有者スコープ・テスト戦略 |

**全トピック確定。設計は完了**。次工程は ticket-split スキルによるチケット分割（下記「実装への引き継ぎ」を参照）。

## セッション運用ルール

1. **読み込みは「ハブ + 対象トピック1ファイル」に限定する**。他のトピックファイルは原則読まない。依存する決定は各ファイル冒頭の「前提」に再掲されている。
2. **仕様書・設計書に記載した後は、毎回必ず整合性レビューを実施する**（成立しない記述・二重定義・決定間の矛盾・曖昧なシグネチャ等。観点は design-session スキル参照）。修正してから次へ進む。
3. **セッション終了（クリア）前に、このファイルの状態表と確定事項サマリを必ず更新する**。これが次セッションへの引き継ぎとなる。
4. **議論の過程・却下案・採用理由はトピックファイルに残し、ハブには昇格させない**。ハブには結論のみ（各1〜3行）を書く。
5. **既存の確定事項を覆す場合は、ハブのサマリと元トピックファイルの両方を更新する**。あわせて、その決定を「前提」に再掲している他ファイルも更新する。
6. 全トピック確定後、ハブに「実装への引き継ぎ」セクションを追記して設計を閉じる。実装フェーズの分割計画は別途 `docs/plan/` で扱う（このディレクトリは設計のみ）。

## 実装への引き継ぎ

全トピック確定済み。チケット分割（ticket-split スキル、出力先 `docs/plan/word-export/`）が全トピックを読み直さずに開始できるための棚卸し。詳細が要る場合のみ該当 `NN-xxx.md の決定 N` を参照する。

### 変更対象の一覧

- **スキーマ変更・マイグレーション**: なし（既存 Word / Meaning / MeaningText を読むのみ）。
- **依存追加**: `csv-stringify`（`csv-parse ^7` の姉妹、同系バージョンを exact pin。ADR-0002 に従う）。→ 03 決定 3
- **新規モジュール・ファイル**:
  - 取得クエリ関数（`src/lib/` に読み取り関数として配置。本人単語＋意味を `ownerId: userId` で各階層スコープして取得）。→ 03 決定 4
  - CSV 生成純関数（行データ配列 → BOM 付き CSV 文字列。副作用なし・DB/Request 非依存。`csv-stringify` でクォート）。→ 03 決定 3・決定 5
  - Route Handler `src/app/api/words/export/route.ts`（`GET`。handler 内で `getSession` 認証、未ログイン 401、`Content-Disposition: attachment; filename="words-YYYYMMDD.csv"`）。既存 `src/app/api/words/search/route.ts`（認証）＋ `src/app/api/dev-blob/[...key]/route.ts`（`new Response(bytes, { headers })`）が手本。→ 03 決定 2
- **既存ファイルの変更**: `src/proxy.ts` の matcher 変更は不要（`/api/*` は対象外・handler self-guard）。→ 03 決定 2
- **UI コンポーネント**: エクスポートを起動する導線（ボタン/リンク → `GET /api/words/export`）。配置ページは UI 実装時に決める（本設計シリーズは UI トピックを立てていない＝最小構成のダウンロードリンクで足りる想定）。
- **ドメイン用語**: 「エクスポート」は naming-book 未登録。機能名 `word-export`・ルート `/api/words/export` を確定コード名として naming-book に追記する。

### 着手順序のヒント

共有基盤 → 機能の依存方向で、`csv-stringify 追加 → CSV 生成純関数（＋unit テスト）→ 取得クエリ関数 → route handler → UI 導線 → E2E`。純関数と取得クエリは独立で並行可能。route handler は両者に依存するため後。並行実装時に競合しやすい共有物は `package.json`（依存追加）のみ。

### テスト戦略の要点（完了条件に転記できる粒度）

- CSV 生成純関数に `*.unit.test.ts`: 列順（単語・意味・登録日）／BOM 先頭付与／`;` 連結（複数 Meaning・MeaningText のフラット化）／意味が空の単語／カンマ・二重引用符・改行を含むセルの RFC 4180 クォート／登録日フォーマット。→ 03 決定 7
- エクスポート一連の流れに E2E 1 本（e2e-verify ハーネス）: ログイン → エクスポート実行 → ダウンロード CSV の中身検証。既存 e2e ヘルパに Playwright の download イベント待受を追加する必要あり。→ 03 決定 7
- integration テストは追加しない。→ 03 決定 7

### チケット分割

チケット分割は ticket-split スキルで行う（PR 単位、優先順位・依存関係を記載、置き場は `docs/plan/word-export/`）。
