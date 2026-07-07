# 02. データモデル

状態: **確定**（2026-07-08）

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- リマインダーは登録済み単語への本人専用の復習予定日設定（01 確定）。
- MVP の通知はアプリ内表示のみ（01 確定）。

## 検討事項リスト

- [x] リマインダーの多重度: 1 単語につき 1 件か、複数件を持てるか
- [x] 期日の粒度: 日付のみか、日時（時刻まで）か
- [x] 単語削除時のリマインダーの扱い

## 議論・決定

決定の土台となる既存コード・規約（調査結果）:

- Word は `id String @id @default(cuid())` / `ownerId`（`owner User @relation(onDelete: Cascade)`）/ `@@index([ownerId])` / `@@map("word")`（`prisma/schema.prisma`）。子テーブルの最小実例は Memo（`wordId` + `ownerId` の 2 本の FK をいずれも Cascade、`@@index` を FK ごとに個別付与）。
- コンテンツ系子テーブルは全行 `ownerId` を非正規化して持つのが規約（`prisma/CLAUDE.md`）。読み取りは `scopedOwnerIds(userId)`（system 共有マスタ + 本人）、書き込み所有検証は素の `ownerId: userId`（`src/lib/CLAUDE.md`）。
- 削除の既定は Cascade、SetNull は例外用途のみ（ADR-0009）。子テーブルは既存無変更で横に足す（ADR-0008 / 0012）。
- Word 配下に word.owner 以外が所有する子孫が 1 件でもあると Word 削除を拒否する削除ガードがある（ADR-0066 / `src/lib/words/policy/row-policy.ts`）。
- 日付のみを保持する Prisma 型の前例は**なし**（全日時が素の `DateTime` = Postgres `timestamp`）。

### 決定 1: リマインダーは Word に 1:0..1 で従属する別テーブル `Reminder` とする

Word 本体に列を足すのではなく、独立した子テーブル `Reminder` を新設し、`wordId` FK で Word に従属させる。1 単語につきリマインダーは最大 1 件（0 or 1）。

コード名は `Reminder`（テーブル `reminder`）、期日フィールドは `remindOn`。想定スキーマ:

```prisma
model Reminder {
  id        String   @id @default(cuid())
  wordId    String   @map("word_id")
  ownerId   String   @map("owner_id")
  remindOn  DateTime @db.Date @map("remind_on")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt      @map("updated_at")

  word  Word @relation(fields: [wordId], references: [id], onDelete: Cascade)
  owner User @relation(fields: [ownerId], references: [id], onDelete: Cascade)

  @@unique([wordId, ownerId])
  @@index([ownerId])
  @@map("reminder")
}
```

`@@index([wordId])` は付けない。`@@unique([wordId, ownerId])` が先頭列 `word_id` の複合 index を兼ねるため、単語からの引きはこれで賄える（owner 単独引き用に `@@index([ownerId])` のみ張る）。`User` モデルへ逆リレーション `reminders Reminder[]` を追加する（owner を持つ全モデルが User に列挙される規約のため）。`createdAt` / `updatedAt` は「いつ予定を立て・変えたか」を追える設定変更履歴として持つ（Word / Occurrence 等のエンティティ的テーブルに合わせる）。

採用理由: リマインダーは大半の単語には付かない疎な任意設定であり、Word 行に nullable 列を持たせると疎データになる。また将来リマインダー固有の属性（完了フラグ・メモ等）が増えたとき Word が肥大する。子テーブル分離は既存の子テーブル追加方針（ADR-0008 / 0012）と一貫し、Memo と同型で実装できる。

却下した代替案: Word に `remindOn` 列を直接追加（1:1 埋め込み）。最小変更だが上記の疎データ・肥大の懸念があり、Word の関心（語そのもの）に「個人の学習計画」を混ぜることになるため却下。

### 決定 2: 多重度は複合ユニーク `@@unique([wordId, ownerId])` で担保し、`ownerId` を非正規化して保持する

「1 単語 1 件」は「1 ユーザーの 1 単語につき最大 1 件」と解釈し、`@@unique([wordId, ownerId])` で担保する。子行は `ownerId` を非正規化して持つ。

採用理由（多重度）: 繰り返し予定・複数予定は MVP のスコープ外（用途に対して過剰）と確定済み。1 件制約はアプリ層ではなくスキーマの一意制約で担保する方が、競合登録に対して堅い。

採用理由（`ownerId` 保持・複合ユニーク）: コンテンツ系子テーブルは全行 `ownerId` を持つ規約に従うことで、所有者スコープの読み書きを Word への join なしに行える。かつ、ユーザーが閲覧する単語一覧には system 共有マスタ単語も含まれ得る（読み取りは `scopedOwnerIds`）ため、将来「共有単語にも各自のリマインダーを付ける」運用を許すなら、一意性は単語グローバルではなく (単語, 所有者) で切る必要がある。複合ユニークにしておけばどちらの運用にも破綻しない。

却下した代替案: `ownerId` を省き `@@unique([wordId])` の単一制約（DrillWord 型）。「対象は本人所有単語のみ」と割り切れば成立し最小構成になるが、(1) 共有 system 単語へリマインダーを付ける余地を塞ぐ、(2) owner を Word 経由 join でしか辿れず所有者フィルタ規約から外れる、ため却下。

### 決定 3: 期日は日付のみとし、Prisma 型は `DateTime @db.Date` を新規に導入する

`remindOn` は `DateTime @db.Date`（Postgres `date` 型）で保持し、時刻を持たない。

採用理由: 時刻までの管理は用途に対して過剰と確定済み。既存に日付のみ型の前例はなく全て素の `DateTime`（`timestamp`）だが、素の `DateTime` を流用すると時刻成分とタイムゾーンが混入し、「日付のみ」という不変条件をアプリ層の切り詰め規約に頼ることになる（整合性上、二重定義・曖昧なシグネチャに該当する）。`@db.Date` は Postgres `date` 型でタイムゾーン非依存に日付のみを厳密表現でき、期日到来判定（`今日 >= remindOn`）も日付比較として素直に書ける。

却下した代替案: 素の `DateTime`（`timestamp`）で時刻を `00:00` 固定運用。前例踏襲だが、タイムゾーン換算で日付がずれる余地があり、切り詰めをアプリ層で強いる。スキーマで不変条件を担保できる `@db.Date` を採る。

注記: これは「日付のみ型」の新規規約導入であり、実装着手時に ADR 起票を推奨する（設計完了時にハブの引き継ぎへ転記する）。

### 決定 4: 単語削除時はリマインダーを Cascade で自動削除する

`word Word @relation(..., onDelete: Cascade)`（および `owner User @relation(..., onDelete: Cascade)`）とし、単語削除に追随してリマインダーも削除する。

採用理由: リマインダーは単語に付随する情報であり、対象単語なしでは意味を持たない。削除既定の Cascade 方針（ADR-0009）にも一致する。ユーザー削除時に本人のリマインダーが消えるのも同様に自然。

却下した代替案: SetNull / 手動削除。単語を失ったリマインダーを残す用途がないため不要。

### 決定 5: リマインダーは system 共有行を持たず、読み取りも `ownerId: userId` 単独でよい

`Reminder` は owner を持つコンテンツ系テーブルだが、system がリマインダーを持つ概念はない（共有マスタが存在しない）。したがって読み取りは `scopedOwnerIds(userId)` ではなく `ownerId: userId` 単独でよく、書き込み所有検証も `ownerId: userId` とする。これはコンテンツ系の「読み取りは scopedOwnerIds」規約に対する明示的な例外である（設定系に近い性質）。

削除ガード（ADR-0066）との整合: `Reminder` は Word の子孫として削除ガードの走査対象に入る。対象が本人所有単語（`word.owner == reminder.owner`）であれば word.owner 以外の子孫は生まれず無影響。ただし共有 system 単語（owner=system）に本人（owner≠system）のリマインダーを付けた場合、その system 単語は「word.owner 以外が所有する子孫」を持つことになり削除ガードに掛かる。system 単語の削除は運用管理操作に限られるため実害は限定的だが、要考慮点として記録する（03 UI で「リマインダー対象を本人所有単語に限る」と決めれば、この論点自体が発生しない）。

採用理由: 共有マスタを持たないデータに対し無条件で `scopedOwnerIds` を適用すると、他者の予定日を巻き込む余地が生まれ本人専用に反する。system 行が存在しない以上 `ownerId: userId` 単独が正しく、かつ最も安全。

却下した代替案: コンテンツ系規約どおり読み取りに `scopedOwnerIds` を機械適用。system リマインダーが存在しないため実質同値になるが、「system の予定日を本人が読む」ことを許すかのような誤読を招くため、例外として明記する方を採る。
</content>
</invoke>
