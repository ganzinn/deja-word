import "server-only";

import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export async function mergeWordInto(tx: Tx, sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) return;

  await tx.meaning.updateMany({
    where: { wordId: sourceId },
    data: { wordId: targetId },
  });
  await tx.example.updateMany({
    where: { wordId: sourceId },
    data: { wordId: targetId },
  });
  await tx.relatedWord.updateMany({
    where: { wordId: sourceId },
    data: { wordId: targetId },
  });
  await tx.memo.updateMany({
    where: { wordId: sourceId },
    data: { wordId: targetId },
  });

  const sourceWordOccurrences = await tx.wordOccurrence.findMany({
    where: { wordId: sourceId },
    select: { id: true, occurrenceId: true },
  });
  for (const swo of sourceWordOccurrences) {
    const conflict = await tx.wordOccurrence.findUnique({
      where: { wordId_occurrenceId: { wordId: targetId, occurrenceId: swo.occurrenceId } },
      select: { id: true },
    });
    if (conflict) {
      await tx.occurrenceDetail.updateMany({
        where: { wordOccurrenceId: swo.id },
        data: { wordOccurrenceId: conflict.id },
      });
      await tx.wordOccurrence.delete({ where: { id: swo.id } });
    } else {
      await tx.wordOccurrence.update({
        where: { id: swo.id },
        data: { wordId: targetId },
      });
    }
  }

  await tx.relatedWord.updateMany({
    where: { linkedWordId: sourceId },
    data: { linkedWordId: targetId },
  });

  await tx.word.delete({ where: { id: sourceId } });
}
