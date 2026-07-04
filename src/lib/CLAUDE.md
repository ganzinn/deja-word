# src/lib (サービス層)

構造: UseCase は `src/lib/*.ts` 直下フラット (`words-*.ts` / `quiz-*.ts` / `drill-*.ts` 等)、機能サブディレクトリ (`words/` / `quiz/`) は handler・純関数・クエリの置き場。UseCase が `prisma.$transaction` を張り、handler は受け取った `tx` を使う (handler 内でトランザクションを張らない)。

- サービス層はカスタム Error クラスを throw する。Result 型に畳むのは Action 層の責務。
- Prisma のユニーク制約違反は `prisma-errors.ts` の `isUniqueConstraintOn(e, "Model")` で判定する (driver adapter 構成では P2002 の meta が modelName 形式のため)。
- ユーザー向け読み取りは `scopedOwnerIds(userId)` (`system-user.ts`) で system + 本人の行を引く。`ownerId: userId` 単独では共有マスタが欠ける。
- 単語の書き込みは正規パス (`createWordForUser` 等 → `writeWordChildren`) を通す。`tx.word.create` 等での迂回は row-policy と書き込み順序の契約を壊す。
- 入力バリデーションの zod スキーマは `src/lib/schema/` に置き client と共用する (Action ファイル内に書かない)。
- `src/lib/mock/` は品詞などの本番用定数定義。テストダブルではない。
- drill のラウンド送信は `Drill.roundCount` の compare-and-swap で冪等化している (`quiz/handlers/drill-round-handler.ts` の `updateMany`、where に期待値)。楽観ロックや素の update に書き換えない (docs/design/word-quiz/05-architecture.md 決定 4)。
- TG 例文形式の出題適格判定は「意味 1 件以上」の AND ではなく述語ごと置換 (`quiz/queries/quiz-source.ts`)。意味未登録の単語が TG 形式で出題されるのは仕様 (05-architecture.md 決定 8)。

## ops ツール用コアモジュール (tsx から呼ぶもの)

`scripts/*.ts` から import されるモジュール (`occurrence-purge.ts` / `bulk-word-import.ts` が手本) は次を守る。tsx は `import "server-only"` と `@/` エイリアスの実行時 import を解決できず、破ると import 時点で落ちる。

- `server-only` を付けない。`prisma` (必要なら `blob`) は引数注入し、`@/lib/prisma` シングルトンを import しない。
- `@/` 参照は `import type` のみ。実行時に値が要るものは相対 import し、その依存先も同条件を満たすこと。`./prisma-errors` は `@/generated` を実行時 import するため使えない。
- 書き込みは正規パスを再利用できないぶん、`prisma/seed.ts` の raw ネスト create を手本に最小限を書く。
