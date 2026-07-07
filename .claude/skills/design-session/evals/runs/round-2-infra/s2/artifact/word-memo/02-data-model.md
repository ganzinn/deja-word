# 02. データモデル

状態: **確定**（2026-07-08）

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- メモは登録済み単語への本人専用の自由記述（01 確定）。
- MVP ではメモの共有・公開はしない（本人のみ閲覧・編集）（01 確定）。

## 現状（設計の出発点）

**メモは新規機能ではなく、すでに実装済みのモデルを本トピックで見直す**。現行の姿:

- `model Memo`（`prisma/schema.prisma:259`、初期マイグレーション `20260511230911_add_word_domain` で作成）。フィールド: `id`(cuid) / `wordId` / `ownerId` / `text` / `sortOrder`。`word`・`owner` とも `onDelete: Cascade`。unique 制約なし。
- zod `memoSchema`（`src/lib/schema/word-form.ts:71`）は `text: z.string().trim().min(1)`。**文字数上限なし**。`wordFormSchema.memos` は `z.array(memoSchema)`（**1 単語に複数件**）。
- 書き込み `src/lib/words/handlers/memo-handler.ts`（`upsertMemos`、pass-through の sortOrder ロジックあり）、認可 `src/lib/words/policy/row-policy.ts`（`EntityKey` に `"memo"`、他の word 系子と同じ pass-through 扱い）。

つまり現行はメモを**「1 単語に N 件・pass-through 共有子」**として扱う。本トピックの確定事項は、このうち多重度・文字数・所有モデルを要求（01）と事前指示に合わせて改める。実装フェーズでスキーマ／zod／handler／UI の改修を伴う（改修の分割は `docs/plan/` の管轄）。

## 検討事項リスト

- [x] メモの多重度: 1 単語につき 1 件か、複数件を持てるか → 決定 1
- [x] メモが本人専用であることのデータ所有・テナント分離上の扱い（pass-through の要否） → 決定 2
- [x] メモ本文の文字数上限 → 決定 3
- [x] 単語削除時のメモの扱い → 決定 4

## 議論・決定

### 決定 1: メモは「ユーザー × 単語」で 1 件（`@@unique([ownerId, wordId])`）

1 つの単語に対し、1 ユーザーが持てるメモは 1 件までとする。DB では **`@@unique([ownerId, wordId])`** で表現する。`Memo` 自身の PK は現行どおり `id String @id @default(cuid())` を維持し、`sortOrder` は**廃止**する（単一メモに並び順は不要）。

採用理由:

- 事前指示で多重度は 1 件と確定。複数メモは UI が複雑化するだけで MVP に不要。
- 制約を `wordId` 単独の unique ではなく `(ownerId, wordId)` にするのは、**Word が system 所有の共有マスタになり得る**ため（`SYSTEM_USER_ID` 単語を `bulk-word-import.ts` が生成する）。同一の共有単語に複数ユーザーがそれぞれ自分のメモを付けるので、`wordId` 単独 unique では 2 人目が付けられず破綻する。「ユーザー×単語で 1 件」を表す `(ownerId, wordId)` が正しい粒度。
- 複合 unique + cuid PK の形は、コンテンツ系の既存例（`Word @@unique([ownerId, headword])`、`Occurrence @@unique([ownerId, location])`）と一致する。ユーザー設定系の「userId を PK にする 1:1」（`QuizDefaultSetting` 等）とは別系統で、メモは `ownerId` を持つコンテンツ系のためこちらに揃える。

却下した代替案:

- **`@@unique([wordId])`（単語ごと厳密 1 件）**: 共有マスタ単語に対し複数ユーザーがメモを付けられず破綻するため却下。
- **多重度 N のまま維持（現行）**: 事前指示で不採用。入力・並べ替え UI が複雑になり、覚え書きという用途に対して過剰。

### 決定 2: メモは本人専用データ。pass-through 対象外とし、所有者は常に実ユーザー

メモは 01 決定 2（非共有・本人のみ閲覧編集）より、**word 系の他エンティティ（meaning / example / *Note）とは所有モデルが異なる**。meaning 等は system が共有マスタ本文を持ち一般ユーザーへ pass-through されるが、**メモには共有マスタが存在しない**。したがって:

- メモの `ownerId` は**常に実ユーザー**であり、`SYSTEM_USER_ID` のメモ行は作らない。
- メモの読み取り・書き込みとも**本人スコープ（`ownerId: userId` 単独）**で引く。read に `scopedOwnerIds(userId)`（system + 本人）を使わない。
- row-policy の pass-through 分岐（system 行を全ユーザーに見せ、body 改変・削除を禁じる）はメモに適用しない。

採用理由: メモは個人の覚え書きで、system が代表本文を持つ余地がない。read/write 非対称の原則（read = `scopedOwnerIds`）は「system 共有行が存在する」ことを前提にした最適化であり、system メモが存在しないメモではその前提が成立しないため、本人スコープ read が正しい。

却下した代替案:

- **メモも pass-through 子として扱う（現行の row-policy を踏襲）**: system メモという概念が生じ、共有＝非公開という 01 決定 2 と矛盾する。実運用でも system メモは生成されないため pass-through 分岐は死にコードになる。メモ専用の所有ルールとして明示する方が安全。

> セキュリティ設計時チェックリスト（データ所有・テナント分離）対応の明示決定。「read は `scopedOwnerIds`、write は本人」の一般原則に対し、メモは system 共有行を持たないため **read も本人スコープ**とする例外を、ここで意図的に採用する。認可の実装ロジック（handler／UseCase での適用）は 03 以降で詳細化する。

### 決定 3: 本文の文字数上限は 2000 文字（zod で強制、名前付き定数）

メモ本文 `text` の最大長を **2000 文字**とする。強制は zod の `memoSchema.text` に `.max(2000, ...)` を追加して行い、上限値は名前付き定数（例: `MEMO_TEXT_MAX_LENGTH = 2000`）として定義し schema と入力欄（`<textarea maxLength>`）で共用する。既存の `.trim().min(1)`（空メモ不可）は維持する。

補足（曖昧さ回避）:

- **数え方**: zod `.max()` は JS 文字列長（UTF-16 コードユニット数）で数える。日本語の常用文字は 1 文字＝1 コードユニットだが、サロゲートペア（絵文字等）は 2 と数える。既存の `account-profile` 名前 `.max(50)` と同一セマンティクスで統一する。
- **DB 制約は設けない**: Prisma `String` は Postgres `text`（長さ無制限）のままとし、DB レベルの CHECK 制約は追加しない。他のコンテンツ本文（headword / meaning text 等）と同様、長さ検証はアプリ層（zod）を単一の真実とする。

採用理由: 事前指示で上限 2000 と確定。強制箇所は、パスワード長（`MAX_PASSWORD_LENGTH` を schema と input で共用）に倣った既存の「名前付き定数 + `.max()` + `maxLength` ミラー」パターンに合わせる。

却下した代替案:

- **上限なし（現行）**: 事前指示で不採用。際限ない本文は表示・保存の想定を壊す。
- **DB CHECK 制約で二重に強制**: 既存コンテンツ本文が採用しておらず、アプリ層検証に一元化する方針と不整合。単一の真実を zod に置く。

### 決定 4: 単語削除時、メモは Cascade で削除（削除ガードと整合）

`Memo.word` の `onDelete: Cascade`（既定・現行のまま）を採用する。メモは単語に付随する情報のため、単語が消えれば一緒に消えてよい（事前指示どおり）。新たな削除ロジックは不要で、既存の Cascade と単語削除ガード（`assertWordDeletable`、ADR-0066）の組み合わせで要件を満たす。

削除ガードとの相互作用（実装者が「メモ専用の削除処理」を書かないための整理）:

- **本人所有の単語**（`wordOwnerId = user`）: そのメモも同じ user 所有（決定 2）なので他 owner の子孫が無く、削除ガードを通過して単語ごとメモも消える。正しい。
- **system 共有単語**（`wordOwnerId = system`）: 各ユーザーのメモは `ownerId ≠ system` の子孫なので、削除ガードが「他 owner の子孫あり」で削除を拒否する。これは他ユーザーの私物メモを巻き添え削除から守る正しい挙動。system 単語はユーザーのメモが付いている限り（管理者操作でも）削除できない。

採用理由: メモは単語従属の情報であり、単語削除に追随するのが自然。共有単語で他人のメモを巻き添えにしないことは、既存の削除ガードが所有者非一致の子孫を検知して自動的に担保する。

却下した代替案:

- **`onDelete: SetNull` / メモを残す**: メモは単語が無いと意味を成さない孤児になるため却下。
- **共有単語でも削除を許し他ユーザーのメモまで Cascade**: 他ユーザーの非公開データを黙って破壊するため却下。削除ガードで拒否する現行挙動を正とする。

## 検討し見送った点（メモ）

- **`createdAt` / `updatedAt` の追加**: 現行 Memo・および word 系子テーブル（`*Note` 等）はタイムスタンプを持たず、本トピックの要求にも「更新日時の表示」等は無い。一貫性のため追加しない。03（UI）で「最終編集日時の表示」が要件化されたら再検討する。
