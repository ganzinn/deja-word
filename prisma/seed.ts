import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { SYSTEM_USER_ID } from "../src/lib/system-user";

const adapter = new PrismaPg({
  connectionString:
    process.env["DIRECT_URL"] ??
    process.env["DATABASE_URL_UNPOOLED"] ??
    process.env["DATABASE_URL"],
});
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.user.upsert({
    where: { id: SYSTEM_USER_ID },
    update: {},
    create: {
      id: SYSTEM_USER_ID,
      email: "system@deja-word.internal",
      name: "共通",
      emailVerified: true,
    },
  });
  console.log(`Seeded system user: ${SYSTEM_USER_ID}`);

  const systemOccurrences = [
    { location: "ターゲット1900", sortOrder: 0 },
    { location: "システム英単語", sortOrder: 1 },
  ];
  for (const o of systemOccurrences) {
    await prisma.occurrence.upsert({
      where: {
        ownerId_location: { ownerId: SYSTEM_USER_ID, location: o.location },
      },
      update: { sortOrder: o.sortOrder },
      create: {
        ownerId: SYSTEM_USER_ID,
        location: o.location,
        sortOrder: o.sortOrder,
      },
    });
  }
  console.log(
    `Seeded ${systemOccurrences.length} system occurrence(s): ${systemOccurrences
      .map((o) => o.location)
      .join(", ")}`,
  );

  const allUsers = await prisma.user.findMany({ select: { id: true } });
  const allSystemOccurrences = await prisma.occurrence.findMany({
    where: { ownerId: SYSTEM_USER_ID },
    select: { id: true },
  });
  if (allUsers.length > 0 && allSystemOccurrences.length > 0) {
    const settings = allUsers.flatMap((u) =>
      allSystemOccurrences.map((o) => ({ userId: u.id, occurrenceId: o.id })),
    );
    const result = await prisma.occurrencePresetSetting.createMany({
      data: settings,
      skipDuplicates: true,
    });
    console.log(`Seeded ${result.count} occurrence preset setting(s) (skipped existing)`);
  }

  await seedSystemWord({
    headword: "ubiquitous",
    meanings: [
      {
        partOfSpeech: "adjective",
        pronunciation: "/juːˈbɪkwɪtəs/",
        texts: ["どこにでもある、遍在する", "至る所に存在する"],
        notes: ["フォーマルな場面で使われる"],
      },
    ],
    examples: [
      {
        kind: "SENTENCE",
        text: "Smartphones have become ubiquitous in modern society.",
        meaning: "スマートフォンは現代社会に遍在している。",
      },
      { kind: "PHRASE", text: "ubiquitous computing" },
    ],
    relatedWords: [
      { kind: "SYNONYM", term: "omnipresent" },
      { kind: "SYNONYM", term: "pervasive" },
    ],
    memos: ["語源: ラテン語 ubique (どこでも)"],
    occurrenceLocations: ["ターゲット1900", "システム英単語"],
  });
}

type SystemWordSeed = {
  headword: string;
  meanings: {
    partOfSpeech?: string;
    pronunciation?: string;
    texts: string[];
    notes?: string[];
  }[];
  examples: {
    kind: "PHRASE" | "SENTENCE" | "TARGET" | "MINIMAL";
    text: string;
    meaning?: string;
    notes?: string[];
  }[];
  relatedWords: {
    kind?: "SYNONYM" | "ANTONYM" | "DERIVATIVE";
    term: string;
  }[];
  memos: string[];
  occurrenceLocations: string[];
};

async function seedSystemWord(seed: SystemWordSeed): Promise<void> {
  const existing = await prisma.word.findFirst({
    where: { ownerId: SYSTEM_USER_ID, headword: seed.headword },
    select: { id: true },
  });
  if (existing) {
    console.log(`Skipped existing system word: ${seed.headword}`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    const word = await tx.word.create({
      data: { ownerId: SYSTEM_USER_ID, headword: seed.headword },
      select: { id: true },
    });
    for (let i = 0; i < seed.meanings.length; i++) {
      const m = seed.meanings[i];
      await tx.meaning.create({
        data: {
          wordId: word.id,
          ownerId: SYSTEM_USER_ID,
          partOfSpeech: m.partOfSpeech ?? null,
          pronunciation: m.pronunciation ?? null,
          sortOrder: i,
          texts: {
            createMany: {
              data: m.texts.map((t, j) => ({
                ownerId: SYSTEM_USER_ID,
                text: t,
                sortOrder: j,
              })),
            },
          },
          notes: {
            createMany: {
              data: (m.notes ?? []).map((t, j) => ({
                ownerId: SYSTEM_USER_ID,
                text: t,
                sortOrder: j,
              })),
            },
          },
        },
        select: { id: true },
      });
    }
    for (let i = 0; i < seed.examples.length; i++) {
      const e = seed.examples[i];
      await tx.example.create({
        data: {
          wordId: word.id,
          ownerId: SYSTEM_USER_ID,
          kind: e.kind,
          text: e.text,
          meaning: e.meaning ?? null,
          sortOrder: i,
          notes: {
            createMany: {
              data: (e.notes ?? []).map((t, j) => ({
                ownerId: SYSTEM_USER_ID,
                text: t,
                sortOrder: j,
              })),
            },
          },
        },
        select: { id: true },
      });
    }
    if (seed.relatedWords.length > 0) {
      await tx.relatedWord.createMany({
        data: seed.relatedWords.map((r, i) => ({
          wordId: word.id,
          ownerId: SYSTEM_USER_ID,
          kind: r.kind ?? null,
          term: r.term,
          sortOrder: i,
        })),
      });
    }
    if (seed.memos.length > 0) {
      await tx.memo.createMany({
        data: seed.memos.map((text, i) => ({
          wordId: word.id,
          ownerId: SYSTEM_USER_ID,
          text,
          sortOrder: i,
        })),
      });
    }
    for (let i = 0; i < seed.occurrenceLocations.length; i++) {
      const location = seed.occurrenceLocations[i];
      const occ = await tx.occurrence.findFirst({
        where: { ownerId: SYSTEM_USER_ID, location },
        select: { id: true },
      });
      if (!occ) continue;
      await tx.wordOccurrence.create({
        data: {
          wordId: word.id,
          occurrenceId: occ.id,
          ownerId: SYSTEM_USER_ID,
          sortOrder: i,
        },
        select: { id: true },
      });
    }
  });
  console.log(`Seeded system word: ${seed.headword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
