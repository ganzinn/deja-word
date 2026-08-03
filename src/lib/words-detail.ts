import "server-only";

import { prisma } from "@/lib/prisma";
import { scopedOwnerIds } from "@/lib/system-user";

export async function getWordDetailForUser(userId: string, wordId: string) {
  const allowed = scopedOwnerIds(userId);
  return prisma.word.findFirst({
    where: { id: wordId, ownerId: { in: allowed } },
    include: {
      meanings: {
        where: { ownerId: { in: allowed } },
        orderBy: { sortOrder: "asc" },
        include: {
          texts: {
            where: { ownerId: { in: allowed } },
            orderBy: { sortOrder: "asc" },
          },
          notes: {
            where: { ownerId: { in: allowed } },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      examples: {
        where: { ownerId: { in: allowed } },
        orderBy: { sortOrder: "asc" },
        include: {
          notes: {
            where: { ownerId: { in: allowed } },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      relatedWords: {
        where: { ownerId: { in: allowed } },
        orderBy: { sortOrder: "asc" },
        include: {
          // linkedWord の meanings は「関連語自身に音源が無いとき、リンク先英単語の音源で
          // 発音ボタンを鳴らす」ためだけに引く（word-detail-view.tsx の RelatedWordCard）。
          // 音源が登録された先頭の Meaning を 1 件だけ取る（音源は同じ見出し語の発音なので
          // どの意味に紐づくかは問わない。先頭 Meaning 固定だと、2 番目以降にだけ音源が
          // ある単語で「音源はあるのに鳴らない」になる）。
          // ネストした meanings は親 Word と別 owner の行を含みうる（pass-through で共有単語に
          // 他ユーザーが自分の Meaning を付加できる）ため owner で再スコープする。
          // 怠ると take: 1 が他ユーザー所有の Meaning を拾い、私的な音源が漏れる。
          linkedWord: {
            select: {
              id: true,
              headword: true,
              meanings: {
                where: { ownerId: { in: allowed }, pronunciationAudioUrl: { not: null } },
                orderBy: { sortOrder: "asc" },
                take: 1,
                select: { pronunciationAudioUrl: true },
              },
            },
          },
          notes: {
            where: { ownerId: { in: allowed } },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      memos: {
        where: { ownerId: { in: allowed } },
        orderBy: { sortOrder: "asc" },
      },
      wordOccurrences: {
        where: { ownerId: { in: allowed } },
        orderBy: { sortOrder: "asc" },
        include: {
          occurrence: { select: { id: true, ownerId: true, location: true } },
          details: {
            where: { ownerId: { in: allowed } },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });
}

export type WordDetail = NonNullable<Awaited<ReturnType<typeof getWordDetailForUser>>>;
