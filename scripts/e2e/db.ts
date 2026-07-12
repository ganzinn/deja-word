// E2E の DB 直操作ヘルパ（ユーザー用意・後始末）。
// scripts/create-user.ts と同じ相対 import 規約（`../../src/generated/prisma/client` + adapter-pg、
// 接続文字列は DIRECT_URL → DATABASE_URL_UNPOOLED → DATABASE_URL）に従う。
// 掃除はアプリ層の削除ガードを迂回して直に消す（cascade で子行も落ちる）。
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

export type PrismaClientType = InstanceType<typeof PrismaClient>;

function connectionString(): string {
  const cs =
    process.env["DIRECT_URL"] ??
    process.env["DATABASE_URL_UNPOOLED"] ??
    process.env["DATABASE_URL"];
  if (!cs) {
    throw new Error("DATABASE_URL / DATABASE_URL_UNPOOLED / DIRECT_URL is not set");
  }
  return cs;
}

export function makePrisma(): PrismaClientType {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString() }) });
}

export type EnsuredUser = { id: string; email: string; password: string };

/**
 * credential ユーザーを冪等に用意する（無ければ作成、あればパスワード更新）。
 * create-user.ts と同じロジック。emailVerified は true（ログイン検証は元々不要だが明示）。
 */
export async function ensureUser(
  prisma: PrismaClientType,
  emailRaw: string,
  password: string,
  name: string,
): Promise<EnsuredUser> {
  const email = emailRaw.toLowerCase();
  const hash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: { id: randomUUID(), email, name, emailVerified: true },
  });

  const existing = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });
  if (existing) {
    await prisma.account.update({ where: { id: existing.id }, data: { password: hash } });
  } else {
    await prisma.account.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: hash,
      },
    });
  }
  return { id: user.id, email, password };
}

/** 撮影用デモ単語の見出し語（test1 所有）。詳細・編集・重複登録警告の被写体に使う。 */
export const DEMO_WORD_HEADWORD = "vivid";

/** デモ単語を収める掲載箇所名（test1 所有）。 */
export const DEMO_OCCURRENCE_LOCATION = "デモ単語帳";

/**
 * 撮影用のデモ単語（意味・訳語・各種例文・関連語 3 種・メモ・掲載箇所）を冪等に用意し、
 * 作成した Word の id を返す（詳細・編集ページへの遷移に使う）。既存のデモ単語は消してから
 * 作り直す。DB に「意味・例文・関連語・メモが揃った語」が無いため、詳細/編集の被写体として
 * 自作の非著作コンテンツをここで seed する。正規パスを介さず prisma/seed.ts に倣って raw ネスト
 * create する（ops コア規約）。子行はすべて ownerId を非正規化して持つ。
 */
export async function ensureDemoWord(
  prisma: PrismaClientType,
  ownerEmailRaw: string,
): Promise<string> {
  const email = ownerEmailRaw.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    throw new Error(
      `ensureDemoWord: ユーザー ${email} が未用意です（先に ensureUser を呼んでください）。`,
    );
  }
  const ownerId = user.id;

  const occurrence = await prisma.occurrence.upsert({
    where: { ownerId_location: { ownerId, location: DEMO_OCCURRENCE_LOCATION } },
    update: {},
    create: { ownerId, location: DEMO_OCCURRENCE_LOCATION, autoNumbering: false },
    select: { id: true },
  });

  await prisma.word.deleteMany({ where: { ownerId, headword: DEMO_WORD_HEADWORD } });

  const word = await prisma.word.create({
    data: {
      ownerId,
      headword: DEMO_WORD_HEADWORD,
      meanings: {
        create: [
          {
            ownerId,
            partOfSpeech: "adjective",
            pronunciation: "ˈvɪvɪd",
            sortOrder: 0,
            texts: {
              create: [
                { ownerId, text: "鮮やかな、あざやかな", sortOrder: 0 },
                { ownerId, text: "（記憶・描写などが）生き生きとした", sortOrder: 1 },
              ],
            },
          },
        ],
      },
      examples: {
        create: [
          {
            ownerId,
            kind: "TARGET",
            text: "a vivid memory of 〜",
            meaning: "〜の鮮明な記憶",
            sortOrder: 0,
          },
          {
            ownerId,
            kind: "PHRASE",
            text: "a vivid imagination",
            meaning: "豊かな想像力",
            sortOrder: 0,
          },
          { ownerId, kind: "MINIMAL", text: "vivid colors", meaning: "鮮やかな色彩", sortOrder: 0 },
          {
            ownerId,
            kind: "SENTENCE",
            text: "I still have vivid memories of that summer.",
            meaning: "その夏の鮮明な記憶が今も残っている。",
            sortOrder: 0,
          },
        ],
      },
      relatedWords: {
        create: [
          {
            ownerId,
            kind: "SYNONYM",
            term: "bright",
            partOfSpeech: "adjective",
            meaning: "明るい、鮮やかな",
            sortOrder: 0,
          },
          {
            ownerId,
            kind: "ANTONYM",
            term: "dull",
            partOfSpeech: "adjective",
            meaning: "くすんだ、さえない",
            sortOrder: 1,
          },
          {
            ownerId,
            kind: "DERIVATIVE",
            term: "vividly",
            partOfSpeech: "adverb",
            meaning: "鮮やかに、生き生きと",
            sortOrder: 2,
          },
        ],
      },
      memos: {
        create: [
          {
            ownerId,
            text: "語源はラテン語 vivere（＝生きる）。「生き生きと目に浮かぶ」イメージで覚える。",
            sortOrder: 0,
          },
        ],
      },
      wordOccurrences: {
        create: [{ ownerId, occurrenceId: occurrence.id, occurrenceNumber: 1, sortOrder: 0 }],
      },
    },
    select: { id: true },
  });
  return word.id;
}

/**
 * 掲載箇所ビューの撮影用に、最も単語数の多い共有（system 所有）掲載箇所を返す（読み取りのみ）。
 * 番号付きの一覧を映すのに使い、無ければ明示エラーにする（ターゲット1900 等を db:import-words で用意する）。
 */
export async function getLargestSharedOccurrence(
  prisma: PrismaClientType,
): Promise<{ id: string; location: string }> {
  // ownerId="system" は共有マスタ（naming-book: system user）。db.ts は @/ を実行時 import できないため文字列で持つ。
  const occ = await prisma.occurrence.findFirst({
    where: { ownerId: "system" },
    orderBy: { wordLinks: { _count: "desc" } },
    select: { id: true, location: true },
  });
  if (!occ) {
    throw new Error(
      "掲載箇所ビュー撮影用の共有掲載箇所（system 所有）がありません。`pnpm db:import-words` 等で用意してください。",
    );
  }
  return occ;
}

/**
 * system ユーザー（id="system"）が seed 済み・パスワード設定済みかを確認する（読み取りのみ）。
 * 未整備なら分かりやすい remediation メッセージで throw する。system ユーザーは
 * ensureUser で作ってはいけない（id が "system" 固定という不変条件を壊すため）。
 */
export async function assertSystemUserReady(prisma: PrismaClientType): Promise<void> {
  const sys = await prisma.user.findUnique({
    where: { id: "system" },
    include: { accounts: { where: { providerId: "credential" }, select: { id: true } } },
  });
  if (!sys) {
    throw new Error(
      "system ユーザーが未 seed です。`pnpm db:seed && pnpm db:set-system-password` を実行してください。",
    );
  }
  if (sys.accounts.length === 0) {
    throw new Error(
      "system ユーザーにパスワードが未設定です。`pnpm db:set-system-password` を実行してください。",
    );
  }
}

/** headword 前置一致で単語を DB 直削除（cascade で子行も消える）。削除件数を返す。 */
export async function cleanupWordsByPrefix(
  prisma: PrismaClientType,
  prefix: string,
): Promise<number> {
  const res = await prisma.word.deleteMany({ where: { headword: { startsWith: prefix } } });
  return res.count;
}

/** メール指定でユーザーを削除（cascade で単語・履歴も消える）。使い捨てユーザーの後始末用。 */
export async function deleteUserByEmail(prisma: PrismaClientType, emailRaw: string): Promise<void> {
  await prisma.user.deleteMany({ where: { email: emailRaw.toLowerCase() } });
}
