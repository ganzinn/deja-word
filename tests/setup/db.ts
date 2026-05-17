import { prisma } from "@/lib/prisma";

const TABLES = [
  "occurrence_detail",
  "word_occurrence",
  "occurrence",
  "meaning_text",
  "meaning",
  "example",
  "related_word",
  "memo",
  "word",
  "session",
  "account",
  "verification",
  "user",
];

export async function truncateAll() {
  const list = TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
