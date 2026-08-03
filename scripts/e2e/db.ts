// E2E の DB 直操作ヘルパ（ユーザー用意・後始末）。
// scripts/create-user.ts と同じ相対 import 規約（`../../src/generated/prisma/client` + adapter-pg、
// 接続文字列は DIRECT_URL → DATABASE_URL_UNPOOLED → DATABASE_URL）に従う。
// 掃除はアプリ層の削除ガードを迂回して直に消す（cascade で子行も落ちる）。
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { hashPassword } from "better-auth/crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { DEV_BLOB_ROOT, DEV_BLOB_URL_PREFIX } from "../../src/lib/blob-client-impl";
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
 * デモ単語の意味・関連語・一部の例文に発音音源を付ける（冪等）。DB に音源付きの語が 1 件も無いと、
 * 単語詳細の再生ボタンと設定の「発音音源のダウンロード」（対象件数）が撮れないため。
 *
 * 例文は TARGET / SENTENCE にだけ付ける。全例文に付けると単語詳細の例文カードが
 * 「音源あり（マイク）」だけになり、未登録時の「自動音声（再生）」の見た目が撮れない
 * （描き分けは docs/adr/0076-audio-source-visual-distinction.md）。
 *
 * 音源は fixtures の無音 mp3 を**固定 key** で dev blob に置く（addRandomSuffix を使わないので
 * 再実行しても実体が増えない）。ローカルディスク driver（dev）前提の撮影専用ヘルパ。
 */
export async function ensureDemoAudio(prisma: PrismaClientType, wordId: string): Promise<number> {
  const silentMp3 = await readFile(join(__dirname, "fixtures", "silent.mp3"));

  async function putFixedKey(slug: string): Promise<string> {
    const key = `audio/docs-demo-${slug}.mp3`;
    const full = join(DEV_BLOB_ROOT, key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, silentMp3);
    return `${DEV_BLOB_URL_PREFIX}${key}`;
  }

  const meanings = await prisma.meaning.findMany({ where: { wordId }, select: { id: true } });
  for (const [i, meaning] of meanings.entries()) {
    await prisma.meaning.update({
      where: { id: meaning.id },
      data: { pronunciationAudioUrl: await putFixedKey(`meaning-${i}`) },
    });
  }

  const relatedWords = await prisma.relatedWord.findMany({
    where: { wordId },
    select: { id: true },
  });
  for (const [i, relatedWord] of relatedWords.entries()) {
    await prisma.relatedWord.update({
      where: { id: relatedWord.id },
      data: { pronunciationAudioUrl: await putFixedKey(`related-${i}`) },
    });
  }

  // key は index ではなく種別で決める（撮影のたびに blob の実体が増えないよう固定する）
  const examples = await prisma.example.findMany({
    where: { wordId, kind: { in: ["TARGET", "SENTENCE"] } },
    select: { id: true, kind: true },
  });
  for (const example of examples) {
    await prisma.example.update({
      where: { id: example.id },
      data: { pronunciationAudioUrl: await putFixedKey(`example-${example.kind.toLowerCase()}`) },
    });
  }

  return meanings.length + relatedWords.length + examples.length;
}

/** quiz デッキを収める掲載箇所名（test1 所有）。②の「デモ単語帳」とは別掲載箇所にして両セクションを独立させる。 */
export const QUIZ_OCCURRENCE_LOCATION = "デモ英単語帳";

/**
 * 単語テスト・定着モードの撮影用デッキ（自作の非著作単語）。各語に意味・訳語・TG例文を持たせ、
 * 四択の distractor（複数の意味）と TG 形式（TARGET 例文）の両方を成立させる。掲載番号は 1..8。
 */
const QUIZ_DECK: {
  headword: string;
  pronunciation: string;
  partOfSpeech: string;
  texts: string[];
  tg: { text: string; meaning: string };
}[] = [
  {
    headword: "brisk",
    pronunciation: "brɪsk",
    partOfSpeech: "adjective",
    texts: ["きびきびした、活発な", "（風などが）さわやかな"],
    tg: { text: "walk at a brisk pace", meaning: "きびきびした足取りで歩く" },
  },
  {
    headword: "cautious",
    pronunciation: "ˈkɔːʃəs",
    partOfSpeech: "adjective",
    texts: ["用心深い、慎重な"],
    tg: { text: "a cautious first step", meaning: "慎重な第一歩" },
  },
  {
    headword: "gather",
    pronunciation: "ˈɡæðər",
    partOfSpeech: "verb",
    texts: ["集める、集まる"],
    tg: { text: "gather the loose papers", meaning: "散らばった紙を集める" },
  },
  {
    headword: "remote",
    pronunciation: "rɪˈmoʊt",
    partOfSpeech: "adjective",
    texts: ["遠く離れた、人里離れた"],
    tg: { text: "a remote mountain village", meaning: "人里離れた山村" },
  },
  {
    headword: "sturdy",
    pronunciation: "ˈstɜːrdi",
    partOfSpeech: "adjective",
    texts: ["頑丈な、丈夫な"],
    tg: { text: "a sturdy wooden chair", meaning: "頑丈な木の椅子" },
  },
  {
    headword: "vanish",
    pronunciation: "ˈvænɪʃ",
    partOfSpeech: "verb",
    texts: ["消える、見えなくなる"],
    tg: { text: "vanish into the fog", meaning: "霧の中へ消える" },
  },
  {
    headword: "gaze",
    pronunciation: "ɡeɪz",
    partOfSpeech: "verb",
    texts: ["じっと見つめる"],
    tg: { text: "gaze at the night sky", meaning: "夜空をじっと見つめる" },
  },
  {
    headword: "murmur",
    pronunciation: "ˈmɜːrmər",
    partOfSpeech: "verb",
    texts: ["つぶやく、ささやく"],
    tg: { text: "murmur a soft reply", meaning: "小声で返事をつぶやく" },
  },
];

/**
 * 単語テスト・定着モードの撮影に使う被写体デッキ（test1 所有）を冪等に用意し、掲載箇所の情報を返す。
 * quiz は seed から再現不可（`prisma/seed.ts` は system ユーザーのみ）・TG 例文はどの committed
 * スクリプトも作らないため、`ensureDemoWord` に倣って自作の非著作コンテンツをここで seed する。
 * 既存デッキ語は消してから作り直す（冪等）。正規パスを介さず raw ネスト create（ops コア規約）。
 */
export async function ensureQuizDeck(
  prisma: PrismaClientType,
  ownerEmailRaw: string,
): Promise<{ occurrenceId: string; location: string; wordCount: number }> {
  const email = ownerEmailRaw.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    throw new Error(
      `ensureQuizDeck: ユーザー ${email} が未用意です（先に ensureUser を呼んでください）。`,
    );
  }
  const ownerId = user.id;

  const occurrence = await prisma.occurrence.upsert({
    where: { ownerId_location: { ownerId, location: QUIZ_OCCURRENCE_LOCATION } },
    update: {},
    create: { ownerId, location: QUIZ_OCCURRENCE_LOCATION, autoNumbering: false },
    select: { id: true },
  });

  // 撮影で作った進行中の定着モードを消してから作り直す（掲載箇所は upsert で残るため drill も残り、
  // 再開一覧に前回分が累積・孤児化する）。DrillWord は cascade で落ちる。
  await prisma.drill.deleteMany({ where: { ownerId, occurrenceId: occurrence.id } });

  await prisma.word.deleteMany({
    where: { ownerId, headword: { in: QUIZ_DECK.map((w) => w.headword) } },
  });

  for (const [i, spec] of QUIZ_DECK.entries()) {
    await prisma.word.create({
      data: {
        ownerId,
        headword: spec.headword,
        meanings: {
          create: [
            {
              ownerId,
              partOfSpeech: spec.partOfSpeech,
              pronunciation: spec.pronunciation,
              sortOrder: 0,
              texts: {
                create: spec.texts.map((text, j) => ({ ownerId, text, sortOrder: j })),
              },
            },
          ],
        },
        examples: {
          create: [
            { ownerId, kind: "TARGET", text: spec.tg.text, meaning: spec.tg.meaning, sortOrder: 0 },
          ],
        },
        wordOccurrences: {
          create: [{ ownerId, occurrenceId: occurrence.id, occurrenceNumber: i + 1, sortOrder: 0 }],
        },
      },
    });
  }

  return {
    occurrenceId: occurrence.id,
    location: QUIZ_OCCURRENCE_LOCATION,
    wordCount: QUIZ_DECK.length,
  };
}

/** ブックマーク撮影でブックマーク済みにするデッキ語（QUIZ_DECK の headword から選ぶ）。 */
const BOOKMARKED_DECK_HEADWORDS = ["brisk", "remote", "gaze"];

/**
 * ブックマーク機能の撮影用に、quiz デッキの一部の単語へ本人のブックマークを冪等に付ける。
 * ensureQuizDeck がデッキ語を作り直す（＝旧 Bookmark 行は cascade で消える）ため、必ずその後に呼ぶ。
 */
export async function ensureQuizDeckBookmarks(
  prisma: PrismaClientType,
  ownerEmailRaw: string,
): Promise<number> {
  const email = ownerEmailRaw.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    throw new Error(
      `ensureQuizDeckBookmarks: ユーザー ${email} が未用意です（先に ensureUser を呼んでください）。`,
    );
  }
  const words = await prisma.word.findMany({
    where: { ownerId: user.id, headword: { in: BOOKMARKED_DECK_HEADWORDS } },
    select: { id: true },
  });
  if (words.length !== BOOKMARKED_DECK_HEADWORDS.length) {
    throw new Error(
      "ensureQuizDeckBookmarks: デッキ語が不足しています（先に ensureQuizDeck を呼んでください）。",
    );
  }
  await prisma.bookmark.createMany({
    data: words.map((w) => ({ userId: user.id, wordId: w.id })),
    skipDuplicates: true,
  });
  return words.length;
}

/**
 * 撮影用に単語テストのデフォルト設定を冪等に確定させる（掲載箇所 = quiz デッキ、出題形式 = 四択、
 * 四択の制限時間 = 推奨 5 秒）。開始画面・設定画面のスクリーンショットが「未設定／未選択」で
 * 写らないようにする。必ず ensureQuizDeck の後に呼ぶ（掲載箇所 id を渡す）。
 */
export async function ensureQuizDefaultsForDocs(
  prisma: PrismaClientType,
  ownerEmailRaw: string,
  occurrenceId: string,
): Promise<void> {
  const email = ownerEmailRaw.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    throw new Error(
      `ensureQuizDefaultsForDocs: ユーザー ${email} が未用意です（先に ensureUser を呼んでください）。`,
    );
  }
  await prisma.quizDefaultSetting.upsert({
    where: { userId: user.id },
    update: { occurrenceId, format: "CHOICE" },
    create: { userId: user.id, occurrenceId, format: "CHOICE" },
  });
  await prisma.quizDefaultTimeout.upsert({
    where: { userId_format: { userId: user.id, format: "CHOICE" } },
    update: { timeoutSeconds: 5 },
    create: { userId: user.id, format: "CHOICE", timeoutSeconds: 5 },
  });
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

/** 管理画面（ユーザー管理）の撮影用デモ被写体の email（一般ユーザー扱い、非 system）。 */
export const ADMIN_DEMO_INVITEE_EMAIL = "invited-member@example.com";

/**
 * ユーザー管理画面の撮影用に「招待済み・パスワード未設定」状態のデモユーザーを冪等に用意する。
 * 一覧に「パスワード未設定・メール未確認」バッジの行を出し、招待→本人パスワード設定フローの
 * 途中状態を見せる。credential アカウントは作らない（＝未設定状態）。前回 seed で付いていても消して
 * 未設定へ戻す。system ユーザーは id 固定の不変条件を壊すため対象外（この email なら衝突しない）。
 */
export async function ensureAdminDemoInvitee(prisma: PrismaClientType): Promise<void> {
  const email = ADMIN_DEMO_INVITEE_EMAIL.toLowerCase();
  const name = email.split("@")[0] ?? email; // 一覧は email 表示だが仮名として local 部を入れる
  const user = await prisma.user.upsert({
    where: { email },
    update: { emailVerified: false, name },
    create: { id: randomUUID(), email, name, emailVerified: false },
    select: { id: true },
  });
  await prisma.account.deleteMany({ where: { userId: user.id, providerId: "credential" } });
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
