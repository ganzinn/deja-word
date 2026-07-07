
#### assistant
I'll start by checking the current state of the `word-reminder` design docs to determine the mode.
- TOOL Bash {"command":"ls -la /Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/docs/design/word-reminder/ 2>/dev/null && echo \"---EXISTS---\" || echo \"---NOT FOUND---\"","description":"Chec

#### assistant
This is **セッション継続モード**. Let me read the hub and the target topic (02).
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/docs/design/word-reminder/README.md"}
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/docs/design/word-reminder/02-data-model.md"}

#### assistant
This is a data-model topic touching data ownership (a security boundary). Let me delegate exploration of the existing schema, ownership conventions, and cascade-delete patterns to an Explore agent while I prepare the discussion.
- TOOL Agent {"description":"Explore Prisma schema & ownership conventions","subagent_type":"Explore","prompt":"I'm designing the data model for a new \"word reminder\" feature in this Next.js + Prisma app (deja-w

#### assistant
I'll investigate the codebase structure and key files in parallel.
- TOOL Bash {"command":"find . -path ./node_modules -prune -o -name \"*.prisma\" -print 2>/dev/null; echo \"---AGENTS---\"; find . -path ./node_modules -prune -o -iname \"AGENTS.md\" -print 2>/dev/null; echo \"--
- TOOL Bash {"command":"ls -la; echo \"---prisma dir---\"; find . -path ./node_modules -prune -o -type d -name \"prisma\" -print 2>/dev/null","description":"List root and prisma dirs"}

#### assistant
Let me read the key files.
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/prisma/schema.prisma"}
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/AGENTS.md"}

#### assistant
My context now includes the prisma/CLAUDE.md schema conventions. Let me look at the row-policy, system-user, and a delete handler in parallel.
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/src/lib/words/policy/row-policy.unit.test.ts"}
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/src/lib/system-user.ts"}
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/src/lib/words/policy/editor-context.ts"}
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/src/lib/words-delete.ts"}

#### assistant
I have everything I need. Let me look at one call site to show `scopedOwnerIds` usage.
- TOOL Bash {"command":"grep -n \"scopedOwnerIds\" /Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/src/lib/words-list.ts /Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/s
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/src/lib/words-detail.ts","offset":1,"limit":40}

#### assistant
While the schema exploration runs, let me delegate a focused extraction from the requirements topic (01) — I need to know whether a reminder has a lifecycle/status (pending → reviewed/dismissed), since that determines the schema's columns. Per the read-limiting rule, I'll delegate rather than full-read a sibling topic.
- TOOL Agent {"description":"Extract reminder lifecycle from requirements","subagent_type":"Explore","prompt":"Read only this file: /Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/docs/design/

#### assistant
Both explorations are running. I'll wait for their results before drafting decisions.
- TOOL Bash {"command":"true","description":"noop wait for agents"}

#### assistant
I'll wait for the two Explore agents to report back before drafting the data-model decisions.
- TOOL ToolSearch {"query":"select:Monitor","max_results":3}
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/docs/design/word-reminder/01-requirements.md"}

#### assistant
Both Explore agents are running in the background; I'll continue once they report. No further action needed from me until then.

#### assistant
Here are the facts from `/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/docs/design/word-reminder/01-requirements.md` (status: 確定 2026-07-01). Note: the file is short (33 lines) and does not contain a use-case section or an explicit "やらない / スコープ外" heading. Everything relevant is below.

**1. Lifecycle / status**

Quote (決定 1, line 20):
> 登録済みの単語 1 件に対して、ユーザーが「この日に見返す」という復習予定日を設定できるようにする。予定日は本人のみが閲覧・変更できる。

Interpretation: The requirements describe only a single "復習予定日" (review due-date) that the owner can view and change (閲覧・変更). There is no mention of reviewed/done/dismissed/snooze/reschedule states — it is just a due-date that exists until changed or deleted. No status field is implied.

**2. In-app notification semantics**

Quote (決定 2, line 28):
> 期日が来たリマインダーは、アプリ内の表示（一覧上のバッジ等）で知らせる。メール・プッシュ通知は行わない。

Interpretation: "notify in-app" means showing due reminders via in-app display, e.g. a badge on a list (一覧上のバッジ等). This is purely a presentation of "due date has arrived" and can be derived at query time from the due date vs. today. Nothing implies a persisted "seen/acknowledged" flag or a notification log.

**3. Scope-out list**

There is no dedicated "やらない / スコープ外" section. The scope exclusions appear only as 却下した代替案 (rejected alternatives):
- 決定 1 (line 24): 
> 却下した代替案: 学習履歴からの自動スケジューリング（間隔反復）。... MVP では却下。
- 決定 2 (lines 28, 32): 
> メール・プッシュ通知は行わない。
> 却下した代替案: メール通知。... 却下。

Interpretation: Automatic scheduling / spaced-repetition (repeat schedules) is out of scope; email and push notifications are out of scope. There is no explicit statement about snooze, history, per-word multiple reminders, or a notification log — those topics are simply not mentioned. (Note: 決定 1 says "単語 1 件に対して … 復習予定日を設定" — one due-date per word — which implies a single reminder per word rather than multiple, but the file does not state this as an explicit exclusion.)

**4. Ownership**

Quote (決定 1, lines 18, 20):
> リマインダーは登録済み単語への本人専用の復習予定日設定とする
> 予定日は本人のみが閲覧・変更できる。

Interpretation: A reminder is 本人専用 (self-only) — only the owner may view and change it — supporting an ownership FK to the user who owns the word. The file does not spell out the relationship between the word's owner and the reminder's owner beyond "本人."

Beyond these, the file does not describe additional lifecycle, acknowledgement, or logging behavior, so no further data-model facts can be drawn without speculation.

#### assistant
Requirements are clear: single due-date per word, self-only, notification derived at query-time from the date (no persisted "seen" flag). Now waiting on the schema-conventions agent.
- TOOL Bash {"command":"true","description":"wait"}

#### assistant
I'll wait for the schema exploration to finish.

#### assistant
I have everything needed. Here is my report.

---

# Data model conventions for a new `Reminder` table

## 1. Prisma schema location & the `Word` model

Single schema file: `/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/prisma/schema.prisma`
(Generator outputs to `../src/generated/prisma` — import Prisma types from `@/generated/prisma/client`, not `@prisma/client`. Datasource is PostgreSQL.)

**`Word` model (schema.prisma:116–136), in full:**
```prisma
model Word {
  id        String   @id @default(cuid())
  ownerId   String   @map("owner_id")
  headword  String
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  owner                  User             @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  meanings               Meaning[]
  examples               Example[]
  relatedWords           RelatedWord[]    @relation("RelatedWordOnWord")
  linkedFromRelatedWords RelatedWord[]    @relation("RelatedWordLinkedWord")
  memos                  Memo[]
  wordOccurrences        WordOccurrence[]
  quizAnswers            QuizAnswer[]
  drillWords             DrillWord[]

  @@unique([ownerId, headword])
  @@index([ownerId])
  @@map("word")
}
```

**PK strategy:** content tables use `id String @id @default(cuid())`. (Note: the auth tables `User`/`Session`/`Account` use bare `@id String` with no default — IDs supplied by Better Auth. For a new content table, follow the `cuid()` convention.)

**Naming/mapping conventions:**
- Table names: snake_case via `@@map("word")`, `@@map("meaning_text")`, etc.
- Column names: camelCase field in Prisma, snake_case in DB via `@map("owner_id")`, `@map("created_at")`. Single-word columns (`headword`, `remaining`, `text`) are left unmapped.
- Related child models (`Meaning`, `Example`, `Memo`, `WordOccurrence`, `QuizAnswer`, `DrillWord`) all live in the same file. `Meaning` is the closest analog (child-of-Word), schema.prisma:138–155.

## 2. User / ownership model

`User` model at schema.prisma:10–41 (`@@map("user")`, `@@unique([email])`).

**Ownership FK convention:** content/word-family tables carry a denormalized `ownerId String @map("owner_id")` plus an `owner User @relation(...)` and `@@index([ownerId])`. FK field is **`ownerId`** (mapped `owner_id`), not `userId`.

Important distinction, documented in `prisma/CLAUDE.md`:
- **Content tables** (Word family, Occurrence, Drill, QuizAnswer) use `ownerId`, and a special `"system"` owner row acts as a shared master visible to all users.
- **Per-user settings tables** (`UserPreference`, `QuizDefaultSetting`, `QuizDefaultTimeout`, `OccurrencePresetSetting`) instead use `userId` as the primary key and carry **no** `ownerId`.

A reminder is a per-user review date attached to a Word — it's content-shaped (references a Word, one row per user per word), so it should carry `ownerId` following the `Meaning`/`Memo` pattern.

**System user:** `/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/src/lib/system-user.ts`
```ts
export const SYSTEM_USER_ID = "system";
export function scopedOwnerIds(userId: string): string[] {
  return [SYSTEM_USER_ID, userId];
}
```

## 3. Cascade delete convention

**`onDelete: Cascade` is the default** (stated explicitly in `prisma/CLAUDE.md`). Every child-of-Word relation uses it, e.g. `Meaning` (schema.prisma:147): `word Word @relation(fields: [wordId], references: [id], onDelete: Cascade)`. Owner relations also cascade: `owner User @relation(..., onDelete: Cascade)`.

Two deliberate `SetNull` exceptions (do not "fix" to Cascade): `RelatedWord.linkedWordId` (schema.prisma:235) and `QuizDefaultSetting.occurrenceId` (schema.prisma:409).

**Application-level delete guard on top of DB cascade** — `/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/src/lib/words-delete.ts`. Because of pass-through (a non-owner can attach their own child rows to a `"system"` word), a raw `prisma.word.delete` would cascade-delete another user's private rows. So `deleteWordForUser` scans all 10 owned descendant tables for distinct `ownerId`, calls `assertWordDeletable(word.ownerId, descendantOwnerIds)` to block deletion if any descendant is owned by someone else, then does `prisma.word.delete({ where: { id } })` and lets the DB cascade handle removal (words-delete.ts:75–86). Blob audio is cleaned up best-effort after, since cascade doesn't reach blob storage.

**Implication for `Reminder`:** it becomes an 11th owned descendant of Word. If a reminder's `onDelete: Cascade` on `wordId` should let system words be deleted while a user's reminder exists, the delete-guard scan in `words-delete.ts` would need to include the new table (that's application code, out of scope for the schema itself, but worth flagging to the parent).

## 4. Timestamps & soft-delete

No soft-delete anywhere — **all deletes are hard deletes** (relying on `onDelete: Cascade`). No `deletedAt`/`isDeleted` columns exist.

Timestamp conventions vary by table type:
- Full content roots: both `createdAt DateTime @default(now()) @map("created_at")` and `updatedAt DateTime @updatedAt @map("updated_at")` (e.g. `Word`, `Drill`).
- Append-only / log rows: `createdAt` only (`Occurrence`, `QuizAnswer`).
- Small child rows (`Meaning`, `MeaningText`, `Memo`, `Example`): **no timestamps at all**.
- Settings tables: `updatedAt` only.

A `Reminder` (a mutable due-date) fits the `updatedAt`+`createdAt` pattern; follow `Word`'s exact form with `@map`.

## 5. Tenant isolation / row-policy

Two mechanisms:

**(a) Read scoping via `scopedOwnerIds`** (`src/lib/system-user.ts`). User-facing reads filter `ownerId: { in: scopedOwnerIds(userId) }` = `["system", userId]`, so shared master rows plus the user's own rows are returned. Call site — `/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/src/lib/words-detail.ts:6-12`:
```ts
export async function getWordDetailForUser(userId: string, wordId: string) {
  const allowed = scopedOwnerIds(userId);
  return prisma.word.findFirst({
    where: { id: wordId, ownerId: { in: allowed } },
    include: { meanings: { where: { ownerId: { in: allowed } }, ... } },
  });
}
```
Per `src/lib/CLAUDE.md`: reads use `scopedOwnerIds(userId)`; **writes/ownership checks use bare `ownerId: userId`** (read/write asymmetry is the rule). `words-list.ts` has more call sites (lines 121, 159, 174, 336).

**(b) Row-level write policy** — `/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/src/lib/words/policy/row-policy.ts` (behavior covered by `row-policy.unit.test.ts`), paired with `policy/editor-context.ts`:
```ts
export type EditorContext = { userId: string; isSystem: boolean };
export function editorContextFor(userId: string) {
  return { userId, isSystem: userId === SYSTEM_USER_ID };
}
```
row-policy exposes `isSystemOwned`, `isPassThroughSystemRow`, `assertRowsAllowed`, `assertWordDeletable`, `assertHeadwordChangeAllowed`, `assertWordUpdateAllowed`, and `ForbiddenDeleteError`/`ForbiddenUpdateError`. This is where owner-mismatch, system-row protection, and pass-through rules are enforced for writes. Authorization logic is centralized here — handlers must not add their own branching (`src/lib/words/CLAUDE.md`).

---

## Recommended `Reminder` shape (matching house style)

Content-shaped, per-user, child-of-Word — mirror `Meaning`:
```prisma
model Reminder {
  id        String   @id @default(cuid())
  wordId    String   @map("word_id")
  ownerId   String   @map("owner_id")
  dueAt     DateTime @map("due_at")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  word  Word @relation(fields: [wordId], references: [id], onDelete: Cascade)
  owner User @relation(fields: [ownerId], references: [id], onDelete: Cascade)

  @@unique([ownerId, wordId])   // one reminder per user per word — mirrors Word's @@unique([ownerId, headword])
  @@index([wordId])
  @@index([ownerId])
  @@map("reminder")
}
```
Also add the back-relations `reminders Reminder[]` to both `User` and `Word`. Note two follow-ups for the parent (application code, not schema): the delete guard in `src/lib/words-delete.ts` scans 10 owned descendant tables and would need `Reminder` added if you want the same pass-through protection; and reads should use `ownerId: { in: scopedOwnerIds(userId) }` while writes use bare `ownerId: userId`.

#### assistant
Comprehensive. This topic touches data ownership (a security boundary), and the naming-book governs domain terms. Let me check both the security checklist and the naming-book for `reminder`/due-date terms before recording decisions.
- TOOL Bash {"command":"echo \"=== naming-book: reminder/due/復習/予定 ===\" && grep -niE \"remind|リマインダ|復習|予定|due|dueOn|dueAt\" docs/reference/naming-book.md 2>/dev/null | head -30; echo \"=== memo entry (precedent)
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/docs/reference/security-design-checklist.md"}

#### assistant
No existing naming-book entry for "reminder" — I'll record the term in the design topic and flag a naming-book entry as an implementation follow-up (naming-book documents landed code, not pre-implementation designs). The security checklist confirms this is the **Memo pattern**: a per-user child attached to possibly-`system` words, so read/write asymmetry and pass-through delete protection apply.

All three pre-answered items map cleanly onto house conventions, and the additional decisions are technically determined (no preference tradeoffs), so I'll proceed without further questions. Writing the finalized topic 02:
- TOOL Write {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/docs/design/word-reminder/02-data-model.md","content":"# 02. データモデル\n\n状態: **確定**（2026-07-08）\n\n## 前提（確定事項の再掲）\n\nこの

#### assistant
Now the mandatory integrity review, reading as an implementer. I found one mis-attribution: my third 前提 bullet attributes "no lifecycle states" to 01, but per the requirements extraction, 01 only establishes a *single settable/changeable due-date per word* — the "no reviewed/done/dismissed" conclusion is my own 決定 6, not an 01 premise. Fixing the attribution:
- TOOL Edit {"replace_all":false,"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/docs/design/word-reminder/02-data-model.md","old_string":"- リマインダーは登録済み単語への本人専用の復習予定日設定（01 確定）。\n

#### assistant
Rest of the review passes (single source for `dueOn`, no derived+stored conflict, decisions mutually consistent, correct relative link paths). Now session-end processing. Let me read topic 03 to update its 前提 re-statement (required end-step; 03 is the next topic and depends on 02's decisions).
- TOOL Read {"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/docs/design/word-reminder/03-ui.md"}
- TOOL Edit {"replace_all":false,"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/docs/design/word-reminder/03-ui.md","old_string":"- リマインダーは登録済み単語への本人専用の復習予定日設定（01 確定）。\n- MVP の通

#### assistant
Now the hub: promote the confirmed summary, flip 02's state, and reset the next-topic pointer to 03.
- TOOL Edit {"replace_all":false,"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/docs/design/word-reminder/README.md","old_string":"- **リマインダーは登録済み単語への本人専用の復習予定日設定**。→ [01](01-re
- TOOL Edit {"replace_all":false,"file_path":"/Users/shusuke/rep/github.com/ganzinn/deja-word-eval-20260708-011210/docs/design/word-reminder/README.md","old_string":"| [02-data-model.md](02-data-model.md) | 議論中 |

#### assistant
Integrity re-review after hub update passes: summary matches 02's body, state row/date match the topic's state line (`**確定**（2026-07-08）`), 03's 前提 is consistent, and no decisions were overturned so no other files need updating. Committing (pre-authorized):
- TOOL Bash {"command":"git add docs/design/word-reminder/ && git status --short && git commit -q -m \"$(cat <<'EOF'\nword-reminder 設計: 02 データモデルを確定\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>\nEOF

#### assistant
トピック **02（データモデル）を確定**しました。コミット済み（`f7f0ae3`）。

## 決定サマリ

| # | 決定 | 要点 |
|---|------|------|
| 1 | 独立テーブル `Reminder` | Word カラム追加は却下。system 共有単語は複数ユーザーで共有されるため、本人専用の予定日は共有行に載せられない。**Memo と同型** |
| 2 | 多重度 1 ユーザー×1 単語=1 件 | `@@unique([ownerId, wordId])`。`wordId` 単独一意にしないのは、同一 system 単語に複数ユーザーが各自の予定を持てる必要があるため |
| 3 | 期日は日付のみ | `dueOn DateTime @db.Date`。「本日到来」判定の TZ 基準は 03 へ申し送り |
| 4 | 所有は content 系規約 | `ownerId` 保持、read=`scopedOwnerIds` / write=`ownerId: userId` の非対称 |
| 5 | 単語削除でカスケード | `onDelete: Cascade` ＋ delete-guard の所有子孫走査に `Reminder` 追加（pass-through 保護維持、実装申し送り） |
| 6 | ステータス列なし | 通知は `dueOn ≤ 今日` をクエリ時に導出。done/dismissed/snooze は要求に無く却下 |
| 7 | `createdAt`+`updatedAt` | 可変 content 行として Word と同形 |

事前指示の3論点（多重度・粒度・削除時）はそのまま反映し、それ以外（テーブル分離・所有規約・カスケード＋guard・ステータス非保持・タイムスタンプ）は house 規約から技術的に定まるため推奨案で確定しました。

## セキュリティ観点

データ所有境界に触れるトピックのため security-design-checklist を通しました。リマインダーは **Memo と同じ pass-through 型**（本人が system 共有単語に個人子データを付加）であり、read/write 非対称と delete-guard への追加を明示的な申し送りとして記録済みです。

## 引き継ぎ

- ハブの確定事項サマリ・状態表を更新、**次セッションの推奨トピックを 03（UI）** に設定
- 03 の「前提」に 02 の依存決定（1件/日付のみ・ステータス非保持で導出・TZ 判定は 03 で定義）を再掲
- 実装申し送り: `words-delete.ts` の走査に `Reminder` 追加、naming-book への語登録は実装フェーズで実施

今回は指示どおり **02 の確定まで**で、03 の議論には入っていません。ここで `/clear` して 03 は別セッションで進めるのが安全です。

---
result: subtype=success cost_usd=1.200947 turns=8 denials=0

---
result: subtype=success cost_usd=1.347008 turns=2 denials=0

---
result: subtype=success cost_usd=2.368556 turns=10 denials=0
