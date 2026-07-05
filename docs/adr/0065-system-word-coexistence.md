# ADR-0065: system 単語作成は共存させる（昇格マージの廃止）

- ステータス: 承認
- 確信度: 高
- 起票日: 2026-07-05
- 置換: [ADR-0062](0062-system-word-promotion-merge.md) を廃止し、本 ADR が置き換える

## 背景

[ADR-0062](0062-system-word-promotion-merge.md) が記述する「昇格マージ」（system 単語作成時に同一 headword の非 system 私有単語を最古 1 件へ統合し、所有権を `SYSTEM_USER_ID` へ移譲する挙動、旧 `createWordAsSystem` → `mergeWordInto`）をレビューした結果、次が確定した:

1. **共存が正準仕様**。「system 単語と同名の私有単語が同一ユーザーのスコープに共存できる」のは**意図的な仕様**（ユーザーは共有マスタとは別に自分専用の単語を持てる）。`Word` の一意制約は `@@unique([ownerId, headword])` のみで、read は `scopedOwnerIds` が system + 本人を引くため、実際に「system 先 → ユーザー後」の作成順では吸収は起きず共存していた。ADR-0062 が背景と推定した「二重表示の防止」は、防ぐべき問題ではなく仕様だった。
2. **作成順で結果が非対称**。「ユーザー先 → system 後」だけマージが発火して私有単語を破壊的に吸収し、逆順は共存する。同じ最終入力で挙動が割れる不整合。
3. **設計根拠が不在**。導入経緯とされる `docs/refactor/word-registration.md` は「動作・スキーマ不変」を掲げたリファクタで、マージを既存挙動として温存しただけ（N3 / 「やらないこと」）。正当化の記述はどこにも無い。
4. **データ損失**（監査で確認）。`mergeWordInto` は `wordId` を参照する子テーブルのうち `QuizAnswer` / `DrillWord` を付け替えないまま `word.delete` するため、吸収された側ユーザーのクイズ履歴・drill 進捗が `onDelete: Cascade` で消失していた。

## 決定内容

**昇格マージを廃止し、共存を正準とする。**

- `createWordForUser`（`src/lib/words-create.ts`）を system・一般とも「単独作成」に統一する（`ownerId` は編集者自身。system principal のときは `SYSTEM_USER_ID` が `userId` として渡る）。system 分岐 `createWordAsSystem` を撤去し、`src/lib/words-merge.ts` を削除。
- system 作成時に他 owner の単語へ一切触れない。同名 system 単語の重複は `@@unique([ownerId, headword])` 違反 → 既存の catch（`isUniqueConstraintOn(e, "Word")`）で `DuplicateHeadwordError` を投げる（挙動同値）。

## 採らなかった代替案

- **昇格マージを非破壊化して残す**（`QuizAnswer` / `DrillWord` も付け替える等） — 破壊は止まるが、共存仕様と矛盾する「作成順で結果が変わる非対称」は残る。設計根拠のない挙動を延命することになるため却下。

## 影響

- system 単語作成でユーザーの私有単語が改変されなくなる（吸収なし）。学習履歴・私物子行は自分の単語に留まる。
- 「昇格マージ」という用語は廃止。naming-book への収録は行わない。
- pass-through（[ADR-0019](0019-two-layer-write-authorization.md)）で共有単語に付いた他 owner 子行の削除カスケード保護は、別判断として [ADR-0066](0066-system-word-deletion-guard.md) で扱う。
- 過去にマージが走っていた場合の既存データ（吸収済み・削除済み）は本決定では復元しない。web 単体作成の admin 操作でしか発火せず、bulk-import 経路（`bulk-word-import.ts`）はマージしないため痕跡は限定的の見込み。実装前に「system 所有 Word に非 system owner の子孫がぶら下がる件数」を確認して規模を把握する。

## 根拠（コード・コミット・文書参照）

- `src/lib/words-create.ts`（単独作成に統一。旧 `createWordAsSystem` / `src/lib/words-merge.ts` は削除）
- 回帰テスト: `src/lib/words-create.integration.test.ts`（同名 system 作成が吸収されず別 id で共存すること・私有単語と子行が無改変であることを検証）
- 廃止した旧挙動の記述: [ADR-0062](0062-system-word-promotion-merge.md)
- 導入経緯（マージを温存しただけで正当化していない原典）: `docs/refactor/word-registration.md`
