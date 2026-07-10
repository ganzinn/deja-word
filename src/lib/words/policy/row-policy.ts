import { SYSTEM_USER_ID } from "@/lib/system-user";

import type { EditorContext } from "./editor-context";
import type { WordFormValues } from "@/lib/schema/word-form";

export type EntityKey = "meaning" | "example" | "relatedWord" | "memo" | "wordOccurrence";

export class ForbiddenUpdateError extends Error {
  constructor(reason: string) {
    super(`FORBIDDEN_UPDATE: ${reason}`);
    this.name = "ForbiddenUpdateError";
  }
}

export class ForbiddenDeleteError extends Error {
  constructor(reason: string) {
    super(`FORBIDDEN_DELETE: ${reason}`);
    this.name = "ForbiddenDeleteError";
  }
}

/**
 * 単語削除の可否を判定する純関数。削除は Word 配下の全子孫を onDelete: Cascade で
 * 消すため、word の owner 以外が所有する子孫（pass-through で付いた他ユーザーの行）が
 * 1 件でもあれば、その owner の私物が巻き添えで消える。これを拒否する（共存モデルの
 * 削除ガード、ADR-0066）。DB 読み取りは呼び出し側（UseCase）が行い、取得済みの
 * 子孫 owner を渡す。
 */
export function assertWordDeletable(
  wordOwnerId: string,
  descendantOwnerIds: ReadonlyArray<string>,
): void {
  for (const ownerId of descendantOwnerIds) {
    if (ownerId !== wordOwnerId) {
      throw new ForbiddenDeleteError(
        `word owned by ${wordOwnerId} has descendant owned by ${ownerId}`,
      );
    }
  }
}

/** ある行が system（共通）所有か。未設定（新規行）の owner は false。 */
export function isSystemOwned(ownerId: string | undefined): boolean {
  return ownerId === SYSTEM_USER_ID;
}

/**
 * 一般編集者から見て「共通行をそのまま通す」対象か。system 所有 かつ 編集者自身は
 * system でない、という pass-through の条件。
 */
export function isPassThroughSystemRow(ctx: EditorContext, ownerId: string | undefined): boolean {
  return isSystemOwned(ownerId) && !ctx.isSystem;
}

/** 共通単語の見出し語を一般編集者が書き換えることを拒否する。 */
export function assertHeadwordChangeAllowed(
  ctx: EditorContext,
  existing: { ownerId: string; headword: string },
  newHeadword: string,
): void {
  if (isPassThroughSystemRow(ctx, existing.ownerId) && newHeadword.trim() !== existing.headword) {
    throw new ForbiddenUpdateError("system word headword cannot be changed");
  }
}

/**
 * 1 エンティティのフォーム行が編集者の権限内に収まっているかを検証する。
 * - id 付き行は DB に実在し owner が一致すること
 * - ownerId は「自分の行」か「pass-through 対象の共通行」のみ許可
 * - 一般編集者は共通行を削除（フォームから落とす）できない
 */
export function assertRowsAllowed(
  entity: string,
  ctx: EditorContext,
  formRows: ReadonlyArray<{ id?: string; ownerId?: string }>,
  dbRows: ReadonlyArray<{ id: string; ownerId: string }>,
): void {
  const dbById = new Map(dbRows.map((r) => [r.id, r.ownerId]));
  const formIds = new Set<string>();

  for (const row of formRows) {
    if (row.id) {
      formIds.add(row.id);
      const dbOwner = dbById.get(row.id);
      if (!dbOwner) {
        throw new ForbiddenUpdateError(`${entity}: unknown id ${row.id}`);
      }
      if (row.ownerId !== dbOwner) {
        throw new ForbiddenUpdateError(`${entity}: owner mismatch on ${row.id}`);
      }
    }

    if (row.ownerId && row.ownerId !== "") {
      const isOwn = row.ownerId === ctx.userId;
      const isPassthrough = isPassThroughSystemRow(ctx, row.ownerId);
      if (!isOwn && !isPassthrough) {
        throw new ForbiddenUpdateError(`${entity}: ownerId ${row.ownerId} not allowed for editor`);
      }
    }
  }

  if (!ctx.isSystem) {
    for (const dbRow of dbRows) {
      if (isSystemOwned(dbRow.ownerId) && !formIds.has(dbRow.id)) {
        throw new ForbiddenUpdateError(`${entity}: system row ${dbRow.id} cannot be deleted`);
      }
    }
  }
}

/**
 * 単語作成リクエストのフォーム値に既存行への参照（id 付き行）が無いことを検証する
 * 純関数。作成経路では既存行参照を一切許可しない — id 付き行は update 経路のみで、
 * そこでは assertRowsAllowed が DB の実 owner と照合する。作成経路は DB 突合を
 * 行わないため、id を素通しすると handler の pass-through 分岐がフォーム値の
 * id / ownerId を信用して既存の共通行を書き換えてしまう。
 * なお `occurrences[].occurrenceId`（掲載箇所プリセットへの FK、resolveChildAllowedIds
 * がスコープ検証する）と `relatedWords[].linkedWordId` は行 id ではない正当な参照
 * のため、ここでは検査しない。
 */
export function assertNoPreexistingChildIds(values: WordFormValues): void {
  const assertIdLess = (position: string, rows: ReadonlyArray<{ id?: string }>): void => {
    for (const [i, row] of rows.entries()) {
      if (row.id) {
        throw new ForbiddenUpdateError(
          `${position}[${i}]: preexisting id ${row.id} is not allowed on create`,
        );
      }
    }
  };

  assertIdLess("meanings", values.meanings);
  for (const [i, m] of values.meanings.entries()) {
    assertIdLess(`meanings[${i}].texts`, m.texts);
    assertIdLess(`meanings[${i}].notes`, m.notes);
  }
  assertIdLess("examples", values.examples);
  for (const [i, e] of values.examples.entries()) {
    assertIdLess(`examples[${i}].notes`, e.notes);
  }
  assertIdLess("relatedWords", values.relatedWords);
  for (const [i, r] of values.relatedWords.entries()) {
    assertIdLess(`relatedWords[${i}].notes`, r.notes);
  }
  assertIdLess("memos", values.memos);
  assertIdLess("occurrences", values.occurrences);
  for (const [i, oc] of values.occurrences.entries()) {
    assertIdLess(`occurrences[${i}].details`, oc.details);
  }
}

export type WordUpdateLoadedRows = {
  meanings: { id: string; ownerId: string }[];
  examples: { id: string; ownerId: string }[];
  relatedWords: { id: string; ownerId: string }[];
  memos: { id: string; ownerId: string }[];
  wordOccurrences: { id: string; ownerId: string }[];
  meaningTexts: { id: string; ownerId: string; meaningId: string }[];
  meaningNotes: { id: string; ownerId: string; meaningId: string }[];
  exampleNotes: { id: string; ownerId: string; exampleId: string }[];
  relatedWordNotes: { id: string; ownerId: string; relatedWordId: string }[];
  occurrenceDetails: { id: string; ownerId: string; wordOccurrenceId: string }[];
};

/**
 * 単語更新リクエスト全体の認可を一括検証する純関数。DB 読み取りは呼び出し側
 * （UseCase）が行い、取得済みの行を `loadedRows` で受け取る。検証順序は旧
 * `words-update.ts` と同一に保つ。
 */
export function assertWordUpdateAllowed(
  ctx: EditorContext,
  existing: { ownerId: string; headword: string },
  values: WordFormValues,
  loadedRows: WordUpdateLoadedRows,
): void {
  assertHeadwordChangeAllowed(ctx, existing, values.headword);

  const formRowsByEntity: Record<EntityKey, ReadonlyArray<{ id?: string; ownerId?: string }>> = {
    meaning: values.meanings,
    example: values.examples,
    relatedWord: values.relatedWords,
    memo: values.memos,
    wordOccurrence: values.occurrences,
  };
  const dbRowsByEntity: Record<EntityKey, { id: string; ownerId: string }[]> = {
    meaning: loadedRows.meanings,
    example: loadedRows.examples,
    relatedWord: loadedRows.relatedWords,
    memo: loadedRows.memos,
    wordOccurrence: loadedRows.wordOccurrences,
  };
  for (const key of Object.keys(formRowsByEntity) as EntityKey[]) {
    assertRowsAllowed(key, ctx, formRowsByEntity[key], dbRowsByEntity[key]);
  }

  for (const m of values.meanings) {
    if (!m.id) continue;
    const texts = loadedRows.meaningTexts.filter((t) => t.meaningId === m.id);
    assertRowsAllowed("meaningText", ctx, m.texts, texts);
    const notes = loadedRows.meaningNotes.filter((n) => n.meaningId === m.id);
    assertRowsAllowed("meaningNote", ctx, m.notes, notes);
  }
  for (const e of values.examples) {
    if (!e.id) continue;
    const notes = loadedRows.exampleNotes.filter((n) => n.exampleId === e.id);
    assertRowsAllowed("exampleNote", ctx, e.notes, notes);
  }
  for (const r of values.relatedWords) {
    if (!r.id) continue;
    const notes = loadedRows.relatedWordNotes.filter((n) => n.relatedWordId === r.id);
    assertRowsAllowed("relatedWordNote", ctx, r.notes, notes);
  }
  for (const oc of values.occurrences) {
    if (!oc.id) continue;
    const details = loadedRows.occurrenceDetails.filter((d) => d.wordOccurrenceId === oc.id);
    assertRowsAllowed("occurrenceDetail", ctx, oc.details, details);
  }

  assertNoOrphanedDeletion(
    ctx.userId,
    loadedRows.meanings,
    loadedRows.meaningTexts,
    (t) => t.meaningId,
    collectFormIds(values.meanings),
    (id) => `meaning ${id} has attached non-editor texts; cannot delete`,
  );
  assertNoOrphanedDeletion(
    ctx.userId,
    loadedRows.wordOccurrences,
    loadedRows.occurrenceDetails,
    (d) => d.wordOccurrenceId,
    collectFormIds(values.occurrences),
    (id) => `wordOccurrence ${id} has attached non-editor details; cannot delete`,
  );
  assertNoOrphanedDeletion(
    ctx.userId,
    loadedRows.meanings,
    loadedRows.meaningNotes,
    (n) => n.meaningId,
    collectFormIds(values.meanings),
    (id) => `meaning ${id} has attached non-editor notes; cannot delete`,
  );
  assertNoOrphanedDeletion(
    ctx.userId,
    loadedRows.examples,
    loadedRows.exampleNotes,
    (n) => n.exampleId,
    collectFormIds(values.examples),
    (id) => `example ${id} has attached non-editor notes; cannot delete`,
  );
  assertNoOrphanedDeletion(
    ctx.userId,
    loadedRows.relatedWords,
    loadedRows.relatedWordNotes,
    (n) => n.relatedWordId,
    collectFormIds(values.relatedWords),
    (id) => `relatedWord ${id} has attached non-editor notes; cannot delete`,
  );
}

/**
 * 編集者自身が所有する親行を削除しようとしたとき、他者（共通）所有の子行が
 * ぶら下がっていれば拒否する（孤児防止）。
 */
function assertNoOrphanedDeletion<C extends { ownerId: string }>(
  userId: string,
  parents: ReadonlyArray<{ id: string; ownerId: string }>,
  children: ReadonlyArray<C>,
  parentIdOf: (child: C) => string,
  idsInForm: Set<string>,
  message: (parentId: string) => string,
): void {
  for (const parent of parents) {
    if (parent.ownerId !== userId) continue;
    if (idsInForm.has(parent.id)) continue;
    const attachedNonEditor = children.some(
      (c) => parentIdOf(c) === parent.id && c.ownerId !== userId,
    );
    if (attachedNonEditor) {
      throw new ForbiddenUpdateError(message(parent.id));
    }
  }
}

function collectFormIds(rows: ReadonlyArray<{ id?: string }>): Set<string> {
  return new Set(rows.map((r) => r.id).filter((id): id is string => !!id));
}
