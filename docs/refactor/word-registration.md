# 単語登録機能 リファクタリング計画

## Context

単語登録（新規 / 更新）機能を一通り実装し終えたが、肥大化と責務散在の兆候が出ている。とくに以下が痛い:

- `src/lib/words-children.ts` (376 行) が 5 種類のエンティティ (meanings / examples / relatedWords / memos / wordOccurrences) の create/update/delete 分岐を 1 関数で抱えている
- `src/lib/words-update.ts` (274 行) に認可チェック・孤児削除・トランザクション制御が混在
- `SYSTEM_USER_ID` を使った "system 行 pass-through" 判定がサーバ複数箇所 + UI 約 29 箇所に散在
- Prisma P2002 重複判定が `isDuplicateHeadword` / `isDuplicateOccurrenceNumber` / `isDuplicateOccurrenceLocation` で重複
- create / update の Server Action でカスタム例外 → ユーザーメッセージのマッピングがほぼ同じ形でコピペ
- UI 側: Card ヘッダー（border + bg + index + 共通バッジ + 削除ボタン）が 4 *Fields でコピペ、`*Fields` 自体も 230–280 行で肥大

本リファクタの目的は **動作・スキーマ不変のまま、責務単一化と重複除去を進めること**。一度で全部やらず、独立 PR にできる 5 フェーズに分割する。DB マイグレーションは発生させない。

## 全体方針

- **Prisma schema 変更なし**（migration 不要）。
- **動作不変**：既存 integration テスト（`words-create.integration.test.ts` 583 行ほか）を回帰検知の主軸にする。
- **Repository / DDD 風クラス階層は導入しない**：Prisma 自体を Repository とみなす。
- クライアント / サーバの zod は「重複」ではなく「共有 + 信頼境界での再検証」として現状維持。
- Server Action → UseCase → Entity Handler の薄い 3 層 + 横断的に Policy / Error mapper、を到達点とする。

## 到達点アーキテクチャ

サーバ:

```
[Server Action]  src/app/words/{new|[id]/edit}/actions.ts
   │ session / zod parse / catch → mapWordWriteErrorToResult
   ▼
[UseCase]        src/lib/words-create.ts / words-update.ts
   │ Word ロード / Policy / resolveChildAllowedIds / prisma.$transaction(1か所)
   ▼
[Entity Handlers] src/lib/words/handlers/*-handler.ts
   │ (tx, EditorContext, formRows, opts) → Promise<void>
   ▼
[Policy]         src/lib/words/policy/{editor-context,row-policy}.ts
[Errors]         src/lib/prisma-errors.ts, src/lib/words/error-map.ts
```

UI:

- 共通プリミティブ `_components/shared/{field-card,array-add-button,array-remove-button,system-badge}.tsx`
- フック `_components/shared/use-row-ownership.ts` で `isSystemOwned` を 1 か所に集約
- `*Fields` は 1 ファイル ≤ 150 行を目安に *Card / *Row へ分割（フェーズ 5）

## 問題 → 解消フェーズ対応表

### サーバ側

| # | 問題 | 解消フェーズ | 解消後の状態（Before → After） |
|---|---|---|---|
| S1 | `words-children.ts` 376 行に 5 エンティティの create/update/delete 分岐が同居 | フェーズ 3 | `handlers/{meaning,example,related-word,memo,word-occurrence}-handler.ts` の 5 ファイルに分割。各 ~50–150 行で 1 エンティティの責務のみ。`words-children.ts` は消滅 or `resolveChildAllowedIds` のみ残す |
| S2 | `SYSTEM_USER_ID` / `editorIsSystem` / `wordIsSystem` 判定の散在（`words-create.ts` / `words-update.ts` / `words-children.ts` / `words-detail.ts`） | フェーズ 4（前段としてフェーズ 3 で `EditorContext` を導入） | 各所の `userId === SYSTEM_USER_ID` を `ctx.isSystem` に置換、行判定は `isSystemOwned(ownerId)` / `isPassThroughSystemRow(ctx, ownerId)` 関数経由のみ。`SYSTEM_USER_ID` 直接参照は `policy/` と `system-user.ts` 等の限定箇所のみ |
| S3 | Prisma P2002 判定が `isDuplicateHeadword` / `isDuplicateOccurrenceNumber` / `isDuplicateOccurrenceLocation` で重複 | フェーズ 1 | `src/lib/prisma-errors.ts` の `isUniqueConstraintOn(e, model)` 1 関数に集約。既存 `isDuplicateXxx` はその 1 行ラッパーに退化 or 削除。`grep "P2002"` の出現が 1 ファイルのみ |
| S4 | `assertFormRowsAllowed`（行レベル所有権チェック）が `words-update.ts` に埋没 | フェーズ 4 | `policy/row-policy.ts` の `assertRowsAllowed` に移設。**ユニットテスト 8〜10 ケースで境界を固定**（現状はテストカバレッジ薄い領域） |
| S5 | create / update の Server Action でカスタム例外 → ユーザーメッセージのマッピングがコピペ | フェーズ 1 | `src/lib/words/error-map.ts` の `mapWordWriteErrorToResult(e)` に集約。`actions.ts` 双方で `if (e instanceof DuplicateXxxError)` チェーンが消滅 |
| S6 | トランザクション境界が暗黙的（lib 関数で開始 vs tx を引数受け取りの混在） | フェーズ 3 | `prisma.$transaction` は UseCase（`words-create.ts` / `words-update.ts`）でのみ開始。全 handler は `(tx, ctx, rows, opts?)` で tx 受け取りに統一。handler 内で `prisma` 直接参照を禁止（コードレビューで担保） |

### UI 側

| # | 問題 | 解消フェーズ | 解消後の状態（Before → After） |
|---|---|---|---|
| U1 | Card ヘッダー（border + bg + index + 共通バッジ + 削除ボタン）が 4 *Fields でコピペ | フェーズ 2 | `_components/shared/field-card.tsx` 1 ファイル。`<FieldCard index={i} title="意味" isSystemOwned={...} onRemove={...} />` で統一 |
| U2 | `ownerId === SYSTEM_USER_ID && !isCurrentUserSystem` 判定が 29 箇所 | フェーズ 2 | `useRowOwnership(name)` フックが `{ ownerId, isCurrentUserSystem, isSystemOwned }` を返す。inline 判定は消滅、`SYSTEM_USER_ID` の import は `*-fields.tsx` から消える |
| U3 | DeleteButton + Badge 組み合わせが全 Card で重複 | フェーズ 2 | `FieldCard` が `isSystemOwned` の値で `SystemBadge` / `ArrayRemoveButton` を切り替え。Card 利用側は知らなくてよい |
| U4 | FieldArray の Add/Remove ボタン UI パターンが重複 | フェーズ 2 | `<ArrayAddButton label="追加" />` / `<ArrayRemoveButton />` で統一 |
| U5 | `MeaningsFields` 236 / `OccurrencesFields` 282 / `RelatedWordsFields` 236 が深いネストで肥大 | フェーズ 5（任意） | 1 ファイル ≤ 150 行を目安に `*-card.tsx` / `*-row.tsx` へ分割。occurrence preset toolbar は独立コンポーネント化 |

### 解消しない / 現状維持と判断した項目（明示）

| # | 元の指摘 | 判断 | 理由 |
|---|---|---|---|
| N1 | クライアント zod + サーバ zod の二重バリデーション | **やらない**（共有スキーマのまま） | 1 ファイル（`src/lib/schema/word-form.ts`）を両側で参照しているため重複ではなく「共有 + 信頼境界での再検証」。サーバで再 parse するのは正しい設計 |
| N2 | `FormMessage` + `toast.error` のエラー二重表示 | **やらない**（フェーズ 2 で見た目は変えない） | UX の方針変更に踏み込むため、リファクタとは別タスク。必要ならフェーズ 5 以降で別途検討 |
| N3 | `createWordAsSystem` のマージ＆所有権移譲ロジックをファイル分離 | **やらない** | 30 行で完結している純粋関数。これ以上の分割は過剰 |
| N4 | Prisma の上に Repository 抽象を被せる | **やらない** | 既存テストが Prisma 直叩きの integration。薄い抽象は屋上屋。Prisma 自体を Repository とみなす |
| N5 | DDD 風 Entity クラス階層 | **やらない** | zod 型 + Prisma 型で十分。値オブジェクト化の旨味なし |
| N6 | `scopedOwnerIds()` のメモ化 | **やらない**（先送り） | 効果が小さい。実測でホットスポットになってから対応 |

### 解消後の具体コードイメージ

#### 例 1: フェーズ 1 — Server Action のエラー catch（S3 + S5）

**Before**（`src/app/words/new/actions.ts` 抜粋）:

```ts
try {
  const { id } = await createWordForUser(session.user.id, parsed.data);
  return { ok: true, id };
} catch (e) {
  if (e instanceof DuplicateHeadwordError) {
    return { ok: false, error: "duplicate", message: "同じ見出し語が既に登録されています" };
  }
  if (e instanceof DuplicateOccurrenceNumberError) {
    return { ok: false, error: "duplicate_occurrence_number", message: "同じ番号が既に使われています" };
  }
  return { ok: false, error: "unknown", message: "登録に失敗しました" };
}
```

…と **同型のブロックが `edit/actions.ts` にもコピペ** されている。

**After**:

```ts
try {
  const { id } = await createWordForUser(session.user.id, parsed.data);
  return { ok: true, id };
} catch (e) {
  return mapWordWriteErrorToResult(e); // create / update どちらでも同じ
}
```

そして lib 側 `isDuplicateHeadword` 等は:

```ts
// Before: words-create.ts / occurrences-create.ts に分散
export function isDuplicateHeadword(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError
    && e.code === "P2002"
    && (e.meta as any)?.modelName === "Word";
}
// （同様のものが Occurrence / WordOccurrence でも 3 つ）

// After: src/lib/prisma-errors.ts に 1 つだけ
export function isUniqueConstraintOn(e: unknown, model: string): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError
    && e.code === "P2002"
    && (e.meta as { modelName?: string } | null)?.modelName === model;
}
// 既存 isDuplicateHeadword はあれば 1 行ラッパー or 削除
```

#### 例 2: フェーズ 2 — UI Card のコピペ駆除（U1 + U2 + U3 + U4）

**Before**（`meanings-fields.tsx` 内、同型が examples/related-words/occurrences に存在）:

```tsx
const ownerId = useWatch({ control: form.control, name: `meanings.${i}.ownerId` });
const isCurrentUserSystem = useIsCurrentUserSystem();
const isSystemOwned = ownerId === SYSTEM_USER_ID && !isCurrentUserSystem;

return (
  <div className="border-border bg-card/50 flex flex-col gap-3 rounded-lg border p-3">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs font-medium">意味 {i + 1}</span>
        {isSystemOwned ? <Badge variant="outline">共通</Badge> : null}
      </div>
      {isSystemOwned ? null : (
        <Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label="意味を削除">
          <Trash2Icon className="size-4" />
        </Button>
      )}
    </div>
    {/* ...本体... */}
  </div>
);
```

**After**:

```tsx
const { isSystemOwned } = useRowOwnership(`meanings.${i}.ownerId`);

return (
  <FieldCard
    title="意味"
    index={i}
    isSystemOwned={isSystemOwned}
    onRemove={() => remove(i)}
    removeAriaLabel="意味を削除"
  >
    {/* ...本体... */}
  </FieldCard>
);
```

→ Card ヘッダー JSX が 4 箇所から **1 箇所** に。`SYSTEM_USER_ID` の判定は `useRowOwnership` 内のみ。

#### 例 3: フェーズ 3 — `createWordChildren` 解体（S1 + S6）

**Before**（`words-children.ts` 376 行、抜粋）:

```ts
export async function createWordChildren(tx, wordId, userId, values, allowed) {
  const editorIsSystem = userId === SYSTEM_USER_ID;

  for (let i = 0; i < values.meanings.length; i++) {
    const m = values.meanings[i];
    if (m.id && m.ownerId === SYSTEM_USER_ID && !editorIsSystem) {
      /* pass-through update ... 30 行 */
    }
    if (m.id && m.ownerId === userId) { /* update ... 20 行 */ }
    /* 新規 create ... 20 行 */
  }
  for (let i = 0; i < values.examples.length; i++) { /* 同型 40 行 */ }
  for (let i = 0; i < values.relatedWords.length; i++) { /* 同型 50 行 */ }
  for (let i = 0; i < values.memos.length; i++) { /* 同型 30 行 */ }
  const seenOccurrenceIds = new Set<string>();
  for (let i = 0; i < values.occurrences.length; i++) { /* 最も重い 120 行 */ }
}
```

**After**（呼び出し側 = UseCase）:

```ts
// src/lib/words-create.ts (UseCase)
await prisma.$transaction(async (tx) => {
  const ctx = editorContextFor(userId); // { userId, isSystem }
  const word = await tx.word.create({ data: { ownerId: userId, headword } });
  await upsertMeanings(tx, ctx, values.meanings, { wordId: word.id });
  await upsertExamples(tx, ctx, values.examples, { wordId: word.id });
  await upsertRelatedWords(tx, ctx, values.relatedWords, {
    wordId: word.id,
    allowedLinkedIds: allowed.linkedWordIds,
  });
  await upsertMemos(tx, ctx, values.memos, { wordId: word.id });
  await upsertWordOccurrences(tx, ctx, values.occurrences, {
    wordId: word.id,
    allowedPresetIds: allowed.presetOccurrenceIds,
  });
});
```

各 handler は 1 ファイル 1 エンティティ:

```ts
// src/lib/words/handlers/meaning-handler.ts (~100 LOC)
export async function upsertMeanings(
  tx: Tx,
  ctx: EditorContext,
  rows: WordFormValues["meanings"],
  opts: { wordId: string },
): Promise<void> {
  for (const [i, m] of rows.entries()) {
    if (isPassThroughSystemRow(ctx, m.ownerId) && m.id) {
      await passThroughUpdate(tx, m, i);
      continue;
    }
    if (m.id && m.ownerId === ctx.userId) {
      await updateOwn(tx, m, i, ctx);
      continue;
    }
    await createNew(tx, m, i, ctx, opts.wordId);
  }
}
```

→ 376 行 1 関数が **5 ファイル × 平均 80 行** に。テストも handler ごとに書けるようになる。
→ `prisma.$transaction` は UseCase のみが張る（handler は `tx` 受け取り、`prisma` 直接参照なし）。

#### 例 4: フェーズ 4 — 認可 Policy 化（S2 + S4）

**Before**（`words-update.ts:236-274` の `assertFormRowsAllowed` + `words-update.ts:65-70` の判定 + `words-children.ts` 内の同型判定が複数）:

```ts
// words-update.ts
const wordIsSystem = existing.ownerId === SYSTEM_USER_ID;
const editorIsSystem = userId === SYSTEM_USER_ID;
if (wordIsSystem && !editorIsSystem && values.headword.trim() !== existing.headword) {
  throw new ForbiddenUpdateError("system word headword cannot be changed");
}
// ...
for (const key of ...) {
  assertFormRowsAllowed(key, formRowsByEntity[key], dbRowsByEntity[key], userId, editorIsSystem);
}

function assertFormRowsAllowed(entity, formRows, dbRows, userId, editorIsSystem) {
  // ... 40 行の判定ロジック（system 行削除拒否 / owner mismatch / pass-through 許可）
}
```

**After**（`words-update.ts` の該当箇所）:

```ts
const ctx = editorContextFor(userId);
assertHeadwordChangeAllowed(ctx, existing, values.headword);

for (const key of ENTITY_KEYS) {
  assertRowsAllowed(key, ctx, formRowsByEntity[key], dbRowsByEntity[key]);
}
```

そして `policy/row-policy.ts` 側:

```ts
// 全認可ロジックがここに集約、unit テストで境界を固定
export function isSystemOwned(ownerId: string): boolean { ... }
export function isPassThroughSystemRow(ctx: EditorContext, ownerId: string): boolean { ... }
export function assertRowsAllowed(entity, ctx, formRows, dbRows): void { ... }
export function assertHeadwordChangeAllowed(ctx, existing, newHeadword): void { ... }
```

→ 認可テストが `row-policy.unit.test.ts` に集約され、`grep "SYSTEM_USER_ID" src/lib/` の結果が `policy/` と `system-user.ts` 等の限定箇所のみに。

### 全体イメージ

- **フェーズ 1 完了時**: エラー判定が 1 か所、Server Action がスリム化。`grep "P2002"` で 1 ファイルしかヒットしない。
- **フェーズ 2 完了時**: UI から `SYSTEM_USER_ID` 直接参照がほぼ消え、Card UI が 1 コンポーネントに統一。
- **フェーズ 3 完了時**: `words-children.ts` 376 行が消え、5 ファイル × 平均 80 行に分散。各 handler に unit テストが付く。
- **フェーズ 4 完了時**: `words-update.ts` が 274 → ≤130 行。認可ロジックは `policy/` 配下のみ、unit テストで境界が固定される。
- **フェーズ 5 完了時（任意）**: `*-fields.tsx` のすべてが ≤150 行。

→ 当初挙げた **問題 S1〜S6 と U1〜U5（計 11 項目）はすべて解消**。N1〜N6 は意図的に手を付けない（理由を明文化）。

## 推奨フェーズ（1 → 2 → 3 → 4 → 5）

### フェーズ 1: Prisma エラー判定 + Server Action エラーマッピングの集約

**狙い**: ベース PR。小さく低リスクで、後続フェーズの足場になる。

- 新規 `src/lib/prisma-errors.ts`: `isUniqueConstraintOn(e, model)` を 1 か所に
- 新規 `src/lib/words/error-map.ts`: `mapWordWriteErrorToResult(e)` でカスタム例外 → `{ error, message }` を集約
- 編集: `src/lib/words-create.ts`, `src/lib/words-update.ts`, `src/lib/occurrences-create.ts`（既存 `isDuplicateXxx` を `prisma-errors` の 1 行ラッパーに退化）
- 編集: `src/app/words/new/actions.ts`, `src/app/words/[id]/edit/actions.ts`（catch ブロックを `mapWordWriteErrorToResult` 呼び出しに置換）

**DoD**:
- `grep -rn "P2002" src/` の結果が `src/lib/prisma-errors.ts` のみ
- `actions.ts` 双方で `if (e instanceof DuplicateXxxError)` チェーンが消えている
- 既存 `*.integration.test.ts` / `actions.unit.test.ts` 全 pass

**LOC 概算**: +60 / -90（-30）、リスク: 低、依存: なし

### フェーズ 2: UI 共通プリミティブ抽出

**狙い**: コピペ駆除と `SYSTEM_USER_ID` 直接参照の隔離。見た目変化なし。

- 新規 `src/app/words/new/_components/shared/`:
  - `field-card.tsx`（border + bg + index + Badge "共通" + 削除ボタンを集約）
  - `array-add-button.tsx`（PlusIcon outline sm）
  - `array-remove-button.tsx`（Trash2Icon ghost icon-sm）
  - `system-badge.tsx`
  - `use-row-ownership.ts`（`{ ownerId, isCurrentUserSystem, isSystemOwned }` を返すフック）
- 編集: `meanings-fields.tsx` / `examples-fields.tsx` / `related-words-fields.tsx` / `occurrences-fields.tsx` / `memos-fields.tsx` で上記プリミティブを使用

**DoD**:
- `_components/*-fields.tsx` から `SYSTEM_USER_ID` の直接 import が消失（shared フックに隔離。`occurrences-fields.tsx` の preset toolbar は残存可）
- 「共通」Badge / Trash2 削除ボタン / Plus 追加ボタンの JSX が `_components/shared/` 配下のみ
- `*Fields` の合計 LOC -20% 以上
- 手動視覚確認（システム所有 / 自分所有 / 新規行 / pass-through の 4 状態）

**LOC 概算**: +180 / -250（-70）、リスク: 低、依存: なし（フェーズ 1 と並行可）

### フェーズ 3: Entity Handler 分割（`words-children.ts` 解体）

**狙い**: 376 行の巨大関数を 5 つのエンティティ handler に分解。テスタビリティと可読性を上げる。

- 新規 `src/lib/words/handlers/`:
  - `shared.ts`（`EditorContext`, `nullable`, `uniqueStrings`）
  - `meaning-handler.ts`
  - `example-handler.ts`
  - `related-word-handler.ts`
  - `memo-handler.ts`
  - `word-occurrence-handler.ts`（preset 解決と `seenOccurrenceIds` 重複排除を含む。最も重い）
- 編集: `src/lib/words-create.ts` / `words-update.ts` の `createWordChildren(...)` 呼び出しを 5 handler 呼び出しに置換
- 削除候補: `src/lib/words-children.ts`（`resolveChildAllowedIds` のみ残すか、`handlers/` へ移設）
- 各 handler は `(tx, ctx, rows, opts?)` シグネチャ。`prisma` を直接触らないこと（tx 経由のみ）

**特に注意する暗黙挙動**（regression を出しやすい）:
- `oc.id && oc.ownerId === userId && !editorIsSystem` の場合に旧行を delete してから新規 create する分岐（`words-children.ts:303-305`）
- `seenOccurrenceIds` による同一 occurrence への二重作成防止（`words-children.ts:336-337`）
- `occurrenceIsSystem && !editorIsSystem` のとき `occurrenceNumber` を強制 null 化（`words-children.ts:340-341`）

**DoD**:
- `words-children.ts` 消滅 または ≤ 30 行（re-export のみ）
- handler ごとに `*.unit.test.ts` を最低 1 ファイル（system pass-through / 自分の行更新 / 新規 の 3 ケース）
- 既存 integration テスト 100% pass

**LOC 概算**: +450 / -380（+70、ファイル分割の代償）、リスク: 中、依存: フェーズ 1

### フェーズ 4: 認可 Policy 切り出し

**狙い**: `SYSTEM_USER_ID` / `editorIsSystem` / `wordIsSystem` の判定をモジュールに集約し、ユニットテストで境界を固定する。

- 新規 `src/lib/words/policy/editor-context.ts`: `type EditorContext = { userId: string; isSystem: boolean }` と `editorContextFor(userId)`
- 新規 `src/lib/words/policy/row-policy.ts`:
  - `isSystemOwned(ownerId)`
  - `isPassThroughSystemRow(ctx, ownerId)`
  - `assertRowsAllowed(entity, ctx, formRows, dbRows)`（`words-update.ts:236` の `assertFormRowsAllowed` を移設）
  - `assertSystemRowsNotDeleted` / 孤児チェック (`meaning has attached non-editor texts`) を関数化
- 新規 `src/lib/words/policy/row-policy.unit.test.ts`: system 行削除拒否 / owner mismatch / pass-through 許可 / 孤児チェックで 8〜10 ケース
- 編集: `words-update.ts` を slim 化（目標 ≤ 130 行）。`words-create.ts` / 各 handler から `userId === SYSTEM_USER_ID` の直接判定を `ctx.isSystem` に置換

**DoD**:
- `src/lib/words-update.ts` ≤ 130 行
- `grep -rn "SYSTEM_USER_ID" src/lib/` の結果が `policy/`, `system-user.ts`, `occurrences-list.ts` 等の限定箇所のみ
- 新規 policy unit テスト ≥ 8 ケース
- 既存 integration テスト 100% pass

**LOC 概算**: +160 / -140（+20）、リスク: 中、依存: フェーズ 3

### フェーズ 5（任意）: `*Fields` コンポーネント分割

**狙い**: 1 ファイル ≤ 150 行を目指す純粋な再配置。見た目変化なし、スキップしても他フェーズの効果は失われない。

- 編集: `_components/{meanings,occurrences,related-words,examples}-fields.tsx`
- 新規 *Card / *Row 系（`meaning-card.tsx`, `occurrence-card.tsx`, `occurrence-detail-row.tsx` など）
- occurrence preset toolbar を独立コンポーネント化

**DoD**: 1 ファイル ≤ 150 行、視覚差分なし

**LOC 概算**: ±0、リスク: 低、依存: フェーズ 2

## やらないこと

- Prisma の上に Repository 抽象を被せる（屋上屋）
- DDD 風 Entity クラス化（zod 型 + Prisma 型で十分）
- zod スキーマをサーバ専用に分離（共有スキーマで OK）
- エラーメッセージ i18n 化（日本語固定で先送り）
- Server Action を route handler 化
- `createWordAsSystem` のマージロジックをファイル分離（30 行で完結しているため過剰）
- Optimistic update / RSC streaming 等の機能追加
- **Prisma スキーマ変更**（`User.isSystem` 追加 / Meaning⇔MeaningText 統合 / `ownerId` 別表化など）。検討したが、現状の「per-row `ownerId` + マジック文字列 `SYSTEM_USER_ID`」は Policy 化後（フェーズ 4）に影響範囲が `policy/` と `system-user.ts` に閉じるため、マイグレーションを伴う変更に踏み切る利得が小さいと判断した

## 重要ファイル

修正対象:
- `src/app/words/new/actions.ts`
- `src/app/words/[id]/edit/actions.ts`
- `src/app/words/new/word-form.tsx`
- `src/app/words/new/_components/{meanings,examples,related-words,occurrences,memos}-fields.tsx`
- `src/lib/words-create.ts`
- `src/lib/words-update.ts`
- `src/lib/words-children.ts`
- `src/lib/occurrences-create.ts`
- `src/lib/system-user.ts`

回帰検知の主軸テスト:
- `src/lib/words-create.integration.test.ts`
- `src/lib/words-update.integration.test.ts`
- `src/app/words/new/actions.unit.test.ts`
- `src/app/words/[id]/edit/actions.unit.test.ts`
- `src/lib/schema/word-form.unit.test.ts`

## 検証手順（各フェーズ共通）

```sh
pnpm test:unit                # 全フェーズで必須、CI でも走る
pnpm test:integration         # フェーズ 1/3/4 後は必須（words-create/update のカバレッジを確認）
pnpm typecheck                # 型整合
pnpm lint                     # スタイル
```

加えて:
- フェーズ 2 / 5: `/words/new` と `/words/[id]/edit` をブラウザで開き、system 所有行 / 自分所有行 / 新規行の 3 状態を視認
- フェーズ 4 完了時: `grep -rn "SYSTEM_USER_ID" src/lib/` の結果を PR 説明文に貼り、隔離が達成されたことを示す

## 推定ボリュームと PR 単位

| # | フェーズ | +LOC | -LOC | 純増減 | リスク |
|---|---|---|---|---|---|
| 1 | エラー集約 | +60 | -90 | -30 | 低 |
| 2 | UI 共通プリミティブ | +180 | -250 | -70 | 低 |
| 3 | Handler 分割 | +450 | -380 | +70 | 中 |
| 4 | 認可 Policy | +160 | -140 | +20 | 中 |
| 5 | *Fields 分割 (任意) | +250 | -250 | ±0 | 低 |
| | 合計 | +1,100 | -1,110 | ~-10 | |

純 LOC はほぼ不変、効果は「1 ファイル LOC 半減」「責務単一化」「`SYSTEM_USER_ID` の局所化」。

## 将来の方向性: 「共通辞書 + 個人オーバーレイ」のスキーマ設計

本リファクタはスキーマ不変だが、複雑さの根源は **「同じ論理エンティティに対し『共通行』と『user オーバーライド行』を単一テーブルで混在させ、`ownerId = SYSTEM_USER_ID` というマジック文字列で区別している」** こと。フェーズ 4 完了後に判定が `policy/` に閉じても、以下の構造的痛点は残る:

- **A. pass-through 編集**: 共通行を編集すると、DB 上は user 所有の新規行を create する。「同じ概念に行が 2 つ」になり、create/update の分岐が混ざる
- **B. マージ表示**: 表示時に common + user の優先規則がアプリ層に分散
- **C. 「user が共通行を非表示にしたい」が表現不能**: 現状この要件は実装手段がない（隠れ要件）

### 中長期の理想形候補

| 案 | 概要 | 痛点解消 | 移行コスト |
|---|---|---|---|
| 案 2: enum `scope` 列 + CHECK 制約 | `Meaning.scope = COMMON \| PERSONAL`、`ownerId` を nullable に | マジック文字列のみ消滅、A/B/C は残存 | 中 |
| **案 3: テーブル分離（推奨）** | `Meaning`（共通専用）+ `PersonalMeaning { userId, wordId, overrides?, deleted, text, ... }`（個人専用、5 エンティティ全部） | A 完全解消 / B は JOIN で表現 / C は `deleted: bool` で表現可能 | 大 |
| 案 5: Postgres RLS | `scope` 列 + DB ポリシーで自動フィルタ | B のみ部分解消 | 中（Prisma との相性悪い） |
| 案 6: Word 完全共有 + `UserDictionaryEntry` | `Word.headword` global unique、参照テーブル経由 | C2（system/user word 並立マージ）が消える | 極大 |

### 案 3 が中長期の本命と判断する理由

- pass-through の分岐コード（`words-children.ts` で各エンティティ ~30 行ずつ占有）が「`PersonalMeaning` を 1 行 create」だけになる
- 「user が共通行を辞書から外す」が `deleted: boolean` で型表現でき、現状は手段がない要件を解放できる
- system seed が common テーブルのみに書き込み、user 経路は Personal* にしか書けない → 権限が DB 構造で保証される（policy 層のチェックがほぼ不要に）

### 案 3 への着手タイミング

**今回のリファクタとは別プロジェクトとして** 実施することを推奨:

1. 動作・スキーマ不変という本リファクタの趣旨と相容れない
2. 案 3 は本質的に「新機能（共通行の非表示）を入れるタイミング」と抱き合わせる方が筋がよい
3. フェーズ 3-4 完了後の方が「common と personal の境界」が policy 層で明確化され、剥がし方が見えやすい

→ 本リファクタは現状維持で進め、フェーズ 4 完了後に「機能要件として『user が共通行を非表示にしたい』が出てきたら案 3 を起動する」スタンスを取る。それまでは `policy/` 層のテストカバレッジで安全網を確保する。

## 進捗記録

各フェーズ完了時に、対応する PR 番号 / commit / 学びをここに追記する。

- [ ] フェーズ 1: エラー集約
- [ ] フェーズ 2: UI 共通プリミティブ
- [ ] フェーズ 3: Handler 分割
- [ ] フェーズ 4: 認可 Policy
- [ ] フェーズ 5: *Fields 分割（任意）
