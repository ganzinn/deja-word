import "server-only";

import { SYSTEM_USER_ID, scopedOwnerIds } from "@/lib/system-user";

import type { EditorContext, Tx } from "./shared";

import type { WordFormValues } from "@/lib/schema/word-form";

export async function upsertWordOccurrences(
  tx: Tx,
  ctx: EditorContext,
  rows: WordFormValues["occurrences"],
  opts: { wordId: string; allowedPresetIds: Set<string> },
): Promise<void> {
  const seenOccurrenceIds = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const oc = rows[i];

    // 共通行の pass-through: WordOccurrence は並び順だけ更新し、自分の detail を追記する
    if (oc.id && oc.ownerId === SYSTEM_USER_ID && !ctx.isSystem) {
      await tx.wordOccurrence.update({
        where: { id: oc.id },
        data: { sortOrder: i },
        select: { id: true },
      });
      for (let j = 0; j < oc.details.length; j++) {
        const d = oc.details[j];
        const detailText = (d.detail ?? "").trim();
        if (detailText.length === 0) continue;
        if (d.id && d.ownerId === SYSTEM_USER_ID) {
          await tx.occurrenceDetail.update({
            where: { id: d.id },
            data: { sortOrder: j },
            select: { id: true },
          });
        } else {
          await tx.occurrenceDetail.create({
            data: {
              wordOccurrenceId: oc.id,
              ownerId: ctx.userId,
              detail: detailText,
              sortOrder: j,
            },
            select: { id: true },
          });
        }
      }
      continue;
    }

    // system 編集者が自分所有の WordOccurrence を更新するケース（occurrenceNumber を維持）
    if (oc.id && oc.ownerId === ctx.userId && ctx.isSystem) {
      await tx.wordOccurrence.update({
        where: { id: oc.id },
        data: {
          sortOrder: i,
          occurrenceNumber: oc.occurrenceNumber ?? null,
        },
        select: { id: true },
      });
      const details = oc.details.map((d) => (d.detail ?? "").trim()).filter((d) => d.length > 0);
      if (details.length > 0) {
        await tx.occurrenceDetail.createMany({
          data: details.map((detail, di) => ({
            wordOccurrenceId: oc.id!,
            ownerId: ctx.userId,
            detail,
            sortOrder: di,
          })),
        });
      }
      continue;
    }

    // 一般ユーザーが自分の既存 WordOccurrence を編集 → 旧行を消して下で作り直す
    if (oc.id && oc.ownerId === ctx.userId && !ctx.isSystem) {
      await tx.wordOccurrence.delete({ where: { id: oc.id } });
    }

    let occurrenceId: string;
    let occurrenceOwnerIdResolved: string;
    if (oc.occurrenceId && opts.allowedPresetIds.has(oc.occurrenceId)) {
      occurrenceId = oc.occurrenceId;
      const presetRow = await tx.occurrence.findUniqueOrThrow({
        where: { id: occurrenceId },
        select: { ownerId: true },
      });
      occurrenceOwnerIdResolved = presetRow.ownerId;
    } else {
      const location = oc.location.trim();
      if (location === "") continue;
      const existing = await tx.occurrence.findFirst({
        where: { ownerId: { in: scopedOwnerIds(ctx.userId) }, location },
        select: { id: true, ownerId: true },
      });
      if (existing) {
        occurrenceId = existing.id;
        occurrenceOwnerIdResolved = existing.ownerId;
      } else {
        const created = await tx.occurrence.create({
          data: { ownerId: ctx.userId, location },
          select: { id: true, ownerId: true },
        });
        occurrenceId = created.id;
        occurrenceOwnerIdResolved = created.ownerId;
      }
    }

    // 同一 occurrence への二重作成を防ぐ（複数フォーム行が同じ出典に解決した場合）
    if (seenOccurrenceIds.has(occurrenceId)) continue;
    seenOccurrenceIds.add(occurrenceId);

    // 共通 Occurrence に一般ユーザーが番号を付けることは許さない（強制 null）
    const occurrenceIsSystem = occurrenceOwnerIdResolved === SYSTEM_USER_ID;
    const effectiveOccurrenceNumber =
      occurrenceIsSystem && !ctx.isSystem ? null : (oc.occurrenceNumber ?? null);

    const wordOccurrence = await tx.wordOccurrence.create({
      data: {
        wordId: opts.wordId,
        occurrenceId,
        ownerId: ctx.userId,
        sortOrder: i,
        occurrenceNumber: effectiveOccurrenceNumber,
      },
      select: { id: true },
    });

    const details = oc.details.map((d) => (d.detail ?? "").trim()).filter((d) => d.length > 0);
    if (details.length > 0) {
      await tx.occurrenceDetail.createMany({
        data: details.map((detail, di) => ({
          wordOccurrenceId: wordOccurrence.id,
          ownerId: ctx.userId,
          detail,
          sortOrder: di,
        })),
      });
    }
  }
}
