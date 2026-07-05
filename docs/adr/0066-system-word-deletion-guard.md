# ADR-0066: system 所有単語の削除方針（pass-through 子を持つ共有単語は削除拒否）

- ステータス: 承認
- 確信度: 高
- 起票日: 2026-07-05

## 背景

pass-through 編集（[ADR-0019](0019-two-layer-write-authorization.md)、意図的仕様）により、一般ユーザーは system 所有の共有単語に**自分所有の子行**（メモ・意味・掲載詳細など、`ownerId = 本人`）を付加できる。一方 `Word` 配下の子テーブルはすべて `onDelete: Cascade`。

したがって admin（system principal）が共有単語を削除すると、そこにぶら下がる**他ユーザーの私物注釈が巻き添えでカスケード削除**される。共存モデル（[ADR-0065](0065-system-word-coexistence.md)）では共有単語は長期にわたり多ユーザーで共有される前提のため、この削除カスケードは看過できない（昇格マージ廃止で作成経路の相乗りは消えたが、pass-through 由来の相乗りは正常に残るため、削除側で別途保護が要る）。

## 決定内容

`deleteWordForUser`（`src/lib/words-delete.ts`）に**削除ガード**を追加する。

- 削除対象 Word の owner 以外が所有する子孫が 1 件でも存在すれば、削除を拒否して `ForbiddenDeleteError` を throw する。
- 判定は純関数 `assertWordDeletable(wordOwnerId, descendantOwnerIds)`（`src/lib/words/policy/row-policy.ts`）に集約し、unit テストで境界を固定する（認可の単一境界原則、ADR-0019 に沿う）。
- UseCase は owner 系 10 テーブル（子＋孫: `Meaning` / `Example` / `RelatedWord` / `Memo` / `WordOccurrence` および `MeaningText` / `MeaningNote` / `ExampleNote` / `RelatedWordNote` / `OccurrenceDetail`）を distinct owner で走査し、純関数へ渡す。
- 削除 Server Action（`src/app/words/[id]/actions.ts`）は `ForbiddenDeleteError` を `{ error: "forbidden" }` に変換し、UI で拒否メッセージ（「他のユーザーが追記した項目があるため、この単語は削除できません。」）を表示する。

一般ユーザーが自分の私有単語を削除する経路は、子孫がすべて本人所有のためガードを素通りし、従来どおり動く。実際に効くのは「他ユーザーが pass-through 追記した共有単語を admin が削除しようとした」ケースのみ。

## 採らなかった代替案

- **降格再配布してから削除**（他 owner 子を per-user 単語へ戻してから共有単語を消す） — 昇格マージの逆操作に相当し複雑。ユースケースが乏しいため初手は拒否ガードのみ採用。必要になれば別途起票する。
- **そのまま削除して損失を受容** — 他ユーザーの私物が無告知で消えるため却下（本 ADR の動機そのもの）。
- **スキーマの `onDelete` を SetNull 等へ変更** — 子行の `wordId` は必須で親を失うと孤児になる。影響範囲が広く、共存モデルとガードで解決できるため不要。

## 影響

- admin は、他ユーザーが pass-through 追記した共有単語を**即時削除できなくなる**（私物保護のトレードオフ）。削除するには追記を持つユーザー側の対応が要る。
- 一般ユーザーの自己所有単語の削除は不変。
- 削除は稀な操作のため、追加の 10 テーブル走査コストは許容。

## 根拠（コード・コミット・文書参照）

- `src/lib/words/policy/row-policy.ts`（純関数 `assertWordDeletable` / `ForbiddenDeleteError`）
- `src/lib/words-delete.ts`（10 テーブル走査 → ガード呼び出し）
- `src/app/words/[id]/actions.ts`（`forbidden` への変換と拒否メッセージ）
- テスト: `src/lib/words-delete.integration.test.ts`（pass-through 子／孫があると削除拒否・データ残存、自己所有のみなら削除可）、`src/lib/words/policy/row-policy.unit.test.ts`（`assertWordDeletable` の境界）
- 前提: pass-through は [ADR-0019](0019-two-layer-write-authorization.md)、共存モデルは [ADR-0065](0065-system-word-coexistence.md)
