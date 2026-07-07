# 02. データモデル

状態: **確定（2026-07-08）**

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- メモは登録済み単語への本人専用の自由記述（01 確定）。
- MVP ではメモの共有・公開はしない（本人のみ閲覧・編集）（01 確定）。

### 既存実装の状況（設計の出発点）

メモは新規概念ではなく、`Memo` モデルとして既に存在する（naming-book §1-1「単語（Word）に直接つく自由記述」で用語確定済み）。本トピックはこの既存モデルの最終形を確定させるもの。着手時点の実装は次のとおりで、本トピックの決定はこれを一部改める:

- `prisma/schema.prisma` の `Memo`: `id / wordId / ownerId / text / sortOrder` を持ち、`Word.memos Memo[]`（1 単語に**複数件**）。`word`・`owner` とも `onDelete: Cascade`。
- `src/lib/words/policy/row-policy.ts`: `memo` を `EntityKey` として **pass-through（共有）対象**に含む。つまり現状は system 著作のメモが全ユーザーに読める・単語削除ガードで他 owner のメモを保護する挙動になっている。
- `src/lib/schema/word-form.ts` の `memoSchema` と、単語フォームの `memos` 配列に組み込まれている。

## 検討事項リスト

- [x] メモの多重度: 1 単語につき 1 件か、複数件を持てるか → 決定 2
- [x] メモ本文の文字数上限 → 決定 4
- [x] 単語削除時のメモの扱い → 決定 5

（付随して確定した論点: 保存形態＝既存 `Memo` の流用（決定 1）、本人専用に伴う read/write スコープと pass-through 除外（決定 3）、カラム構成＝タイムスタンプ・並び順の扱い（決定 6））

## 議論・決定

採用理由と却下した代替案もここに残す。見出しは「決定 N: タイトル」形式。

### 決定 1: 保存形態は既存 `Memo` 子テーブルの流用（新テーブル・Word へのカラム追加はしない）

- **決定**: メモは既存 `Memo` モデル（`@@map("memo")`）を継続利用し、単一化と本人専用化のために構成を改める（決定 2〜6）。新テーブルの新設や `Word` へのメモ用カラム追加はしない。
- **採用理由**: `Memo` は naming-book §1-1 で「単語直下の自由記述」として用語確定済み。既存スキーマ・zod・row-policy が `Memo` 前提で組まれており、別テーブル/カラムに置き換えると用語とコードが二重化する（AGENTS.md「共有知識は repo 内に一元化」）。
- **却下案**:
  - 新テーブル新設 — 用語二重化・naming-book 違反。既存 `Memo` の撤去コストに見合う利点がない。
  - `Word.memoText String?` としてカラム追加 — 単語本体の更新とメモ更新が同一行に混ざり、書き込み順序契約（`handlers/index.ts`）と分離しづらい。任意 NULL カラムで表現が貧弱。子テーブルなら将来 updatedAt 等の付与も局所化できる。

### 決定 2: 多重度は「1 単語 × 1 ユーザーにつき 1 件」。制約は `@@unique([wordId, ownerId])`

- **決定**: 1 つの単語に対し、1 ユーザーが持てるメモは最大 1 件。DB 制約は `@@unique([wordId, ownerId])`。既存の `sortOrder` は廃止する（決定 6）。
- **採用理由**: 事前指示「1 単語 1 件（複数は MVP で不要、UI が複雑化するだけ）」。メモは本人専用（01）なので一意性は **(単語, 所有者)** 単位で表す。これにより、共有 system 単語に対しても各ユーザーが自分の 1 件を持てる（同一 `wordId` に異なる `ownerId` の行が並ぶことはあるが、各ユーザーの視点では常に 1 件）。
- **却下案**:
  - `@@unique([wordId])`（単語グローバルに 1 件）— system 共有単語で複数ユーザーが各自のメモを持てず、本人専用モデルと矛盾（他ユーザーの登録で自分が書けなくなる）。
  - 複数件許容（`sortOrder` 維持）— 事前指示で却下。UI が複雑化するだけで MVP に不要。

### 決定 3: メモは本人専用。read/write とも本人行のみを対象とし、pass-through / `scopedOwnerIds` から外す

- **決定**: メモの読み取りは `ownerId: userId`（本人行のみ）で行い、他の単語子（meaning / example 等）と異なり `scopedOwnerIds`（system + 自分）を使わない。書き込みも本人行のみ。`row-policy.ts` の pass-through・削除ガードの対象から `memo` を外す。
- **採用理由**: 01 確定「共有・公開しない／本人のみ閲覧・編集」。system がメモを著作して全ユーザーに読ませる（現状の pass-through read）ことは共有に当たり、01 に反する。したがってメモは system 共有マスタを持たず、各ユーザーが自分の行だけを読み書きする per-user private データとして扱う。
- **セキュリティ設計チェックリスト（read/write 非対称の維持）への明示的例外**: 全機能共通の原則は「read は `scopedOwnerIds`、write は自分の行のみ」。メモはこの **read 側も本人限定**にする点が例外。理由は上記のとおり「メモは共有コンテンツではない」ため。この例外は独立した判断として本決定に記録する（handler 内の暗黙分岐にしない）。
- **影響（実装への申し送り。詳細は 03・チケット分割で扱う）**:
  - `row-policy.ts`: `EntityKey` から `memo` の pass-through 扱いを解除（メモに system 行は存在しないため、`isPassThroughSystemRow` 判定の対象外）。メモは常に本人行のみ。
  - 単語削除ガード（`assertWordDeletable` / `assertNoOrphanedDeletion`）: メモは他 owner 行が原理的に発生しない（本人専用）ため、巻き添え・孤児化の検査対象にならない。
  - 読み取りクエリ: 単語表示時、単語本体（system 含む）は従来どおり `scopedOwnerIds`、メモだけ `ownerId: userId` で引く。
- **却下案**: 現状の pass-through を維持 — system メモが他ユーザーに見え、01 の本人専用・非共有に反する。

### 決定 4: 本文は必須テキスト・上限 2000 文字。検証はアプリ層（zod）、DB 型は `text` のまま

- **決定**: `text` は必須（空なら行を作らない＝メモ無し）。上限 2000 文字を zod で検証する。DB カラムは Prisma `String`（Postgres `text`）のまま長さ制約を付けない。
  - zod: `z.string().trim().min(1, "メモを入力してください").max(2000, "メモは2000文字以内で入力してください")`
- **採用理由**: 事前指示の上限 2000。既存規約は DB 長制約を使わず zod（日本語メッセージ）で検証する方針（`src/lib/schema/word-form.ts` の各テキスト、`src/lib/CLAUDE.md`）。既存 `memoSchema` の `min(1, "メモを入力してください")` を踏襲し `.max(2000, …)` を追加する。空文字は行を作らず「メモ無し」とみなす（既存 note 系の空行除外と同じ扱い）。
- **文字数の数え方**: JS `String.length`（UTF-16 code unit）を基準とする。書記素クラスタや絵文字の厳密計数は MVP 非対象。03 で残り文字数表示を出す場合も同じ基準に合わせる。
- **却下案**:
  - `@db.VarChar(2000)` で DB 制約 — 既存 text カラム群と不整合。エラーメッセージ制御・trim 前後の扱いはアプリ層の方が柔軟。
  - 上限を DB・アプリ双方で二重定義 — 二重管理で食い違いの余地（整合性レビュー観点「二重定義」）。単一箇所（zod）に集約する。

### 決定 5: 単語削除でメモも削除（`onDelete: Cascade` を継続）

- **決定**: `Memo.word` の `onDelete: Cascade` を維持し、単語削除時にメモを連鎖削除する。
- **採用理由**: 事前指示どおり「メモは単語に付随する情報なので一緒に削除してよい」。既存設定（`word Word @relation(..., onDelete: Cascade)`）がそのまま要件を満たす。メモは本人専用（決定 3）のため、他 owner のメモが巻き添えで消える状況は発生せず、削除ガードは不要。
- **却下案**: `onDelete: SetNull` / メモを残す — 単語なきメモは意味を持たず、孤児データになる。

### 決定 6: 並び順・タイムスタンプ用カラムは持たない（`updatedAt` は 03 の要件次第で再検討）

- **決定**: `sortOrder` を廃止（1 件化により不要、決定 2）。`createdAt` / `updatedAt` は当面持たない。
- **採用理由**: 兄弟の単語子テーブル（`MeaningText` 等）もタイムスタンプを持たず、規約に沿う。単一メモに並び順は無意味。
- **再検討の余地**: 03（UI）で「メモの最終更新日時」を表示する要件が出た場合は `updatedAt DateTime @updatedAt` の追加を再検討する（本決定の変更として扱う）。

## 確定後のスキーマ像（実装の目標形）

```prisma
model Memo {
  id      String @id @default(cuid())
  wordId  String @map("word_id")
  ownerId String @map("owner_id")
  text    String

  word  Word @relation(fields: [wordId], references: [id], onDelete: Cascade)
  owner User @relation(fields: [ownerId], references: [id], onDelete: Cascade)

  @@unique([wordId, ownerId])
  @@index([ownerId])
  @@map("memo")
}
```

- `@@unique([wordId, ownerId])` は `wordId` を先頭に持つ複合インデックスを兼ねるため、既存の単独 `@@index([wordId])` は冗長になり削除してよい。`@@index([ownerId])` は owner スコープ読み取り用に残す。
- `Word.memos Memo[]` のリレーションは維持（1 ユーザー視点では 0〜1 件だが、system 単語には複数 owner の行がぶら下がるためコレクション型のまま）。

### マイグレーション上の注意（実装への申し送り）

- 既存 `memo` テーブルからの変更点: `sort_order` カラム削除、`@@unique([wordId, ownerId])` 追加、単独 `word_id` インデックス削除。
- 既存データに「同一 (word_id, owner_id) で複数メモ」が存在すると unique 追加が失敗する。移行時は該当を 1 件に集約（または最新のみ残す）する dedup を先行させる。基盤フェーズでメモ実データが乏しければ影響は限定的だが、`prisma migrate` 適用前に件数を確認すること。

## 03（UI）への申し送り

- メモは 1 単語 × 本人 1 件。編集 UI は「無し ⇄ 1 件」のトグル的操作で足りる（追加ボタンで N 件増やす UI は不要）。
- 空にして保存＝メモ削除（行を作らない）。上限 2000 文字（超過時メッセージ「メモは2000文字以内で入力してください」）。
- 表示スコープは本人のみ。system 共有単語を開いても、見えるメモは自分の 1 件だけ（他ユーザー・system のメモは表示しない）。
- メモを既存の単語フォーム内で編集するか、単語詳細に独立した編集面を設けるかは 03 で決定する（本トピックはデータ形のみ）。「最終更新日時」を表示する要件が出たら決定 6 の再検討が必要。
