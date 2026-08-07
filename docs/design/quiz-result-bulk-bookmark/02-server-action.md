# 02. サーバー処理

状態: **確定**（2026-08-08）

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- 一括操作は登録のみ（解除なし）。既ブックマーク済みも対象に含め冪等に扱う（01 確定）。
- 対象 wordId 群はクライアント（結果画面の表示行、削除済み行を除外済み）から渡す。受け渡しのシグネチャはこのトピックで決める（01 確定）。
- クライアントの削除済み判定はスナップショットのため、押下時点までに削除された単語は混入し得る。混入時のサーバー側の扱いはこのトピックで決める（01 確定）。
- 一括操作は履歴送信の成功後のみ実行される（01 確定）。
- 全モード共通（TEST / DRILL / DRILL_RETRY）で仕様・挙動を分けない。入力に mode を含めるか等のシグネチャは本トピックで決める（01 確定）。

## 検討事項リスト

- [x] 一括登録の Server Action のシグネチャ（既存 `toggleBookmark` / `getBookmarkStates` との関係。ファイル配置は 04 の管轄）
- [x] UseCase のシグネチャ・トランザクション方針（既存 `setBookmarkForUser` の scoped 検証との整合）
- [x] 入力スキーマの内容（wordIds 上限。既存 `BOOKMARK_WORD_IDS_MAX_COUNT = 3000` の流用可否）
- [x] 冪等性・部分失敗の扱い（範囲外・削除済み単語の混入時）
- [x] 戻り値の形（登録件数・失敗情報をどこまで返すか）

## 議論・決定

### 決定 1: UseCase は `addBookmarksForUser(userId, wordIds)` — 検証 1 回＋一括 INSERT 1 回の 2 クエリ

```ts
async function addBookmarksForUser(
  userId: string,
  wordIds: readonly string[],
): Promise<{ bookmarkedWordIds: string[]; skippedWordIds: string[] }>;
```

処理（手順 2〜3 は決定 3 のトランザクション内で実行）:

1. UseCase 入口で `wordIds` を一意化する（uniqueIds。入力の重複はここで吸収し、以降は集合として扱う）。
2. `tx.word.findMany({ where: { id: { in: uniqueIds }, ownerId: { in: scopedOwnerIds(userId) } }, select: { id: true } })` で検証を通過した wordId 群（validIds）を得る。
3. validIds が空でなければ `tx.bookmark.createMany({ data: validIds.map(...), skipDuplicates: true })` で本人行として一括登録する（空なら INSERT を発行しない）。
4. `bookmarkedWordIds = validIds`、`skippedWordIds = uniqueIds − validIds` として返す。

戻り値の意味は決定 5 に一本化する。UseCase 内の層の切り方（handler を分けるか UseCase 直書きか）は 04 の 3 層適合確認の管轄。

- 採用理由: 対象 word の scoped 検証（system + 本人の word のみ許可）→ 本人行への書き込み、という形は既存 `setBookmarkForUser` と同一で、`src/lib/CLAUDE.md` の「純 per-user 設定」パターン（書き込み先が本人の Bookmark 行のみのため、対象 word は scoped 検証して system 語にも付与できる）に適合する。`createMany` の `skipDuplicates: true`（PostgreSQL の ON CONFLICT DO NOTHING。Prisma 7 + PostgreSQL で使用可、リポジトリ先行例は `src/lib/drill-create.ts`）が既ブックマーク済みの冪等スキップ（01 決定 4）をそのまま実現し、クエリ数は単語数によらず最大 2 で済む。
- 却下した代替案: `setBookmarkForUser` の N 回ループ（クエリ数が単語数の 2 倍になる。1 件でも範囲外があると途中で throw し半端な部分適用が起きる）。upsert の N 回ループ（同上のクエリ数問題）。

### 決定 2: 範囲外・削除済みの混入はスキップして続行する（1 件版の「拒否」とは異なる）

検証で弾かれた wordId（削除済み・scoped 範囲外。DB 上は「validIds に無い」としてまとめて skip し、理由は区別しない）はエラーにせず、残りを登録して `skippedWordIds` として返す。全件が弾かれた場合もエラーにしない（正常系の表現は決定 5）。

- 採用理由: 01 決定 3 のとおり、クライアントの削除済み判定はスナップショットであり、押下時点までに削除された単語の混入は正当に起こり得る。そこで全体を失敗させるとユーザーは正常な残りも登録できない。「保存できなかった wordId を skippedWordIds として返す」形は quiz 履歴送信の存在フィルタ（`src/lib/quiz/handlers/quiz-answer-handler.ts` の `insertQuizAnswers`、決定の一次情報は ADR-0032）と同型。スキップ＝書き込みを行わないことなので、拒否と比べてセキュリティ上の差はない。
- 却下した代替案: 1 件版 `setBookmarkForUser` と同じく範囲外検出で全体をエラー（`forbidden`）にする（正当な race を異常系として扱ってしまう。1 件版は対象が単一で「その 1 件が不正＝操作全体が不正」だから拒否が適切という違いがある）。

### 決定 3: UseCase が `prisma.$transaction` を張り、検証と登録を同一トランザクションで実行する

- 採用理由: 「UseCase がトランザクションを所有する」規約（ADR-0015、`src/lib/CLAUDE.md`）に従う。quiz 履歴送信の UseCase（`src/lib/quiz-answers-submit.ts` の `prisma.$transaction((tx) => insertQuizAnswers(...))`）と同じ形。失敗は常に全体失敗（部分適用なし）になり、冪等（決定 5）なので再実行が安全。トランザクション中の並行削除による FK 違反（`skipDuplicates` は重複キーにのみ効き、FK 違反には効かない）は理論上残るが、その場合も全体失敗 → `unknown` で、再実行で解消する。
- 却下した代替案: 非トランザクションの 2 クエリ（`setBookmarkForUser` は単一対象・単一書き込みで tx を張っていないが、本件は検証と登録の 2 ステップを持つ複数行書き込みであり、ADR-0015 の規約適合と全体失敗の保証を優先。コスト差は無視できる）。

### 決定 4: Server Action は `addBookmarks(input: AddBookmarksInput)` — Result 型は `getBookmarkStates` と同型

```ts
type AddBookmarksError = "unauthorized" | "invalid" | "unknown";
type AddBookmarksResult =
  | { ok: true; bookmarkedWordIds: string[]; skippedWordIds: string[] }
  | { ok: false; error: AddBookmarksError; message: string };

// AddBookmarksInput = { wordIds: string[] }（決定 6 のスキーマから導出した型）
async function addBookmarks(input: AddBookmarksInput): Promise<AddBookmarksResult>;
```

既存 `getBookmarkStates` は入力をインライン型リテラルで書いているが、本 action は決定 6 で追加する `AddBookmarksInput` を import して使う（追加した型を未使用にしないため）。

- セッション無し → `unauthorized`（message「ログインが必要です。再度ログインしてください。」= 既存 actions と同一文言）、zod 検証失敗 → `invalid`（「ブックマークの一括登録リクエストが不正です。」）、UseCase の例外 → `unknown`（「ブックマークの一括登録に失敗しました。」）。ADR-0016 の Result 型（throw せず ok/error を返す）に従う。
- `forbidden` 変種は持たない（決定 2 のスキップ方式のため発生しない）。
- 入力に mode は含めない（サーバー処理はモード無関係。01 決定 2 の全モード共通）。
- `revalidatePath` は呼ばない（既存ブックマーク actions と同じ楽観的更新方針。一覧・詳細のサーバ供給値は次の遷移・リロードで最新化される）。
- エラー分類は action 内で分岐し、error-map モジュールは使わない。ADR-0016 の「変換は error-map に集約」からの逸脱だが、既存ブックマーク actions（`toggleBookmark` / `getBookmarkStates`）が同じ形で先行しており、エラー変種が少ないブックマーク系はこれに揃える（規約適合の再確認は 04 の管轄）。

- 採用理由: 既存の `getBookmarkStates`（入力オブジェクト＋zod＋3 分類エラー）と対称で、呼び出し側（結果画面）が既に同型の Result を扱っている。
- 却下した代替案: `toggleBookmark` 型の位置引数（配列を含む入力は zod スキーマを通すオブジェクト入力が適切）。skippedWordIds を返さず件数のみ返す（UI が行単位の状態更新（`bookmarkStates`）に使えなくなる。見せ方の選択肢を 03 に残すため ID 群で返す）。

### 決定 5: 戻り値のセマンティクス

- `bookmarkedWordIds`: scoped 検証を通過し、操作後にブックマーク ON 状態にある wordId 群（新規登録か既存かは区別しない）。全件スキップ時は空配列＋`ok: true` になり得る。
- `skippedWordIds`: 検証で弾かれた wordId 群（削除済み・範囲外の区別なし）。
- どちらも**集合**であり順序は保証しない（クライアントは `bookmarkStates` の Map 更新・件数表示に使う想定で、順序に依存しない）。入力の重複 wordId は UseCase 入口の一意化（決定 1 手順 1）で吸収されるため、どちらにも重複は現れない。
- 同じ入力で再実行しても結果は同じ（冪等）。

### 決定 6: 入力スキーマは `addBookmarksInputSchema` — `wordIds: z.array(z.string()).min(1).max(BOOKMARK_WORD_IDS_MAX_COUNT)`

`addBookmarksInputSchema` と型 `AddBookmarksInput` を追加し、上限は既存の `BOOKMARK_WORD_IDS_MAX_COUNT = 3000` を流用する。追加先は流用する定数と同じ `src/lib/schema/bookmark.ts`（定数と同居が必然のため、スキーマの配置のみ本トピックで確定し、04 の配置検討からは外す）。定数の doc コメントは「一括取得 action（06 `getBookmarkStates`）用」の記述を「ブックマーク系一括 action（一括取得・一括登録）用」へ汎用化する（旧「06」参照表記もこのとき除去）。

- `min(1)` はこのトピックの決定であり、**03 への制約**として「対象 0 件では action を呼ばない UI にすること」を課す（空配列は不正入力として `invalid` に落とす）。
- 既存 `getBookmarkStatesInputSchema` には `min` を追加しない（0 件取得は無害な正常系）。同一ファイル内で片方だけ `min(1)` を持つ非対称は意図的。

- 採用理由: 上限の母集団はどちらも「結果一覧の単語数 = 1 回の quiz の出題数」で同一。同じ母集団に別定数を立てると、上限変更時に 2 箇所の同期が必要になる。
- 却下した代替案: 一括登録専用の新定数（母集団が同じなのに管理箇所が増える）。`min` 無し（空配列の成功応答という無意味な正常系が増える）。

### セキュリティ確認（設計チェックリスト通過メモ）

- read/write 非対称の維持: 対象 word の検証は `scopedOwnerIds`（system + 本人）の read、書き込みは本人の Bookmark 行（`userId` 固定）のみ — チェックリストの原則および既存 `setBookmarkForUser` と同一で、前提を破らない。
- 新規エンドポイントは Server Action のみで、CSRF は same-origin 保護に依存する既存方針（`docs/reference/security-design-checklist.md` 外部との境界の節）のまま。新ルートセグメント・権限モデル変更・外部入出力の追加はない。
