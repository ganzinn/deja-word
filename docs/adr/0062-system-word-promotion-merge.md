# ADR-0062: system 単語作成は共存させる（「昇格マージ」の廃止）

- ステータス: 承認
- 確信度: 高
- 起票日: 2026-07-04
- 改訂日: 2026-07-05（当初の「昇格マージを是認」する内容を、廃止の決定へ全面改訂）

> **改訂の経緯**: 本 ADR は当初、コード・コミット履歴からの事後推定として「昇格マージ」（system 単語作成時に同名の私有単語を統合し所有権を system へ移譲する挙動）を是認する内容だった。レビューの結果、この挙動は**設計根拠のない後付けの不整合**であり、データ損失を起こすことが判明したため、**廃止**する決定に改訂した。

## 背景

`createWordAsSystem`（旧 `src/lib/words-create.ts`）は、system principal での単語作成時に、同一 headword の非 system 私有単語を `createdAt` 昇順で最古 1 件へ統合（`mergeWordInto`）し、残った単語の `ownerId` を `SYSTEM_USER_ID` へ移譲していた。ユーザーの私有単語が、同名 system 単語の作成時点で暗黙に共有マスタへ吸収される挙動（当時「昇格マージ」と仮称）。

しかしレビューで次が確定した:

1. **共存が正準仕様**。「system 単語と同名の私有単語が同一ユーザーのスコープに共存できる」のは**意図的な仕様**（ユーザーは共有マスタとは別に自分専用の単語を持てる）。実際、コードは共存を許しており（`Word` の一意制約は `@@unique([ownerId, headword])` のみ、read は `scopedOwnerIds` で system+本人を引く）、「system 先 → ユーザー後」の作成順では吸収は起きず共存していた。当初 ADR が背景と推定した「二重表示の防止」は、防ぐべき問題ではなく仕様だった。
2. **作成順で結果が非対称**。「ユーザー先 → system 後」だけマージが発火して私有単語を破壊的に吸収し、逆順は共存する。同じ最終入力で挙動が割れる不整合。
3. **設計根拠が不在**。導入経緯とされる `docs/refactor/word-registration.md` は「動作・スキーマ不変」を掲げたリファクタで、マージを**既存挙動として温存しただけ**（N3 / 「やらないこと」）。正当化の記述はどこにも無い。
4. **データ損失を起こす**（監査で確認）:
   - `mergeWordInto` は `wordId` を参照する子テーブルのうち `QuizAnswer` / `DrillWord` を付け替えないまま `word.delete` するため、両者が `onDelete: Cascade` で消える。吸収された側ユーザーのクイズ履歴・drill 進捗が全消失。
   - 統合後の子行は per-user `ownerId` のまま system 単語にぶら下がるため、system 単語削除で全ユーザーの私物子行がカスケード全消しになる。

## 決定内容

**昇格マージを廃止し、共存を正準とする。**

1. system 単語作成を一般作成と同じ「単独作成」に統一する（`createWordForUser` の system 分岐と `createWordAsSystem` を撤去、`src/lib/words-merge.ts` を削除）。system 作成時に他 owner の単語へ一切触れない。同名 system 単語の重複は `@@unique([ownerId, headword])` 違反 → `DuplicateHeadwordError` で従来どおり弾く。
2. **system 単語削除ガード**を追加する。pass-through（ADR-0019、意図的仕様）でも「system 単語に他ユーザーが自分の子行を付ける」状態は正常に生じ、system 単語削除で `onDelete: Cascade` によりその私物が巻き添えに消える。`deleteWordForUser` に「削除対象 Word の owner 以外が所有する子孫が 1 件でもあれば削除を拒否」するガード（`assertWordDeletable`、`src/lib/words/policy/row-policy.ts` の純関数）を追加し、`ForbiddenDeleteError` を throw する。

これにより問題4 の 2 経路（マージ由来の履歴カスケード損失／統合後の削除カスケード）は根絶され、pass-through 由来の削除カスケードも塞がれる。

## 採らなかった代替案

- **昇格マージを非破壊化して残す**（`QuizAnswer` / `DrillWord` を付け替える等） — 破壊は止まるが、共存仕様と矛盾する「作成順で結果が変わる非対称」は残る。根拠のない挙動を延命することになるため却下。
- **削除時に他 owner 子を per-user 単語へ降格再配布してから削除** — 複雑でユースケースが乏しい。初手は拒否ガードのみ採用。必要になれば別途起票する。
- **スキーマの `onDelete` を SetNull 等へ変更** — 共存モデルとガードで解決するため不要。

## 影響

- system 単語作成でユーザーの私有単語が改変されなくなる（吸収なし）。ユーザーの学習履歴・私物子行は自分の単語に留まる。
- 「昇格マージ」という用語は廃止。naming-book への収録は行わない。
- 削除ガードにより、他ユーザーが pass-through で追記した system 単語は admin でも即時削除できなくなる（意図的。私物保護のトレードオフ）。
- 過去にマージが走っていた場合の既存データ（吸収済み・削除済み）は本改訂では復元しない。実運用では web 単体作成の admin 操作でしか発火せず、bulk-import 経路（`bulk-word-import.ts`）はマージしないため、痕跡は限定的と見込む。実装前に「system 所有 Word に非 system owner の子孫がぶら下がる件数」を確認して規模を把握する。

## 根拠（コード・コミット・文書参照）

- 廃止した実装: 旧 `src/lib/words-create.ts` の `createWordAsSystem` / 旧 `src/lib/words-merge.ts`
- 是正後: `src/lib/words-create.ts`（単独作成に統一）、`src/lib/words-delete.ts` + `src/lib/words/policy/row-policy.ts`（`assertWordDeletable` / `ForbiddenDeleteError`）
- 回帰テスト: `src/lib/words-create.integration.test.ts`（共存を検証）、`src/lib/words-delete.integration.test.ts`（ガードを検証）、`src/lib/words/policy/row-policy.unit.test.ts`
- pass-through 仕様: ADR-0019
- 導入経緯（マージを温存しただけで正当化していない原典）: `docs/refactor/word-registration.md`
