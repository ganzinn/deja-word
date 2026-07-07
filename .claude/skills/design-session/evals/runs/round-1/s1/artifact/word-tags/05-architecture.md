# 05. アーキテクチャ（モジュール配置・Action・認可・テスト戦略）

状態: **未着手**

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

（依存する決定が確定したら、ここに 1 行ずつ再掲する。02 のスキーマ形状、03 の純関数／クエリの線引き、04 の画面・URL 設計に依存する。）

参考: モジュール配置規約は `src/lib/CLAUDE.md`。UseCase は `src/lib/*.ts` 直下フラット（例: `words-list.ts` / `words-create.ts`）で `prisma.$transaction` を張り、handler・純関数・クエリは機能サブディレクトリ（`src/lib/words/` の handlers/ ・policy/ ・error-map.ts）。Server Action はルート直下 `actions.ts` で throw せず Result 型 `{ ok: true, ... } | { ok: false, error, message }` を返す。zod は `src/lib/schema/` に集約し client と共用。

## 検討事項リスト

- [ ] モジュール配置（words の相似形）: UseCase `src/lib/tags-*.ts`（create / attach / detach / list / 一覧絞り込みへの組み込み）、支援モジュール `src/lib/tags/`（handlers / error-map / 純関数）、zod `src/lib/schema/tag-form.ts`
- [ ] インターフェース: 全部 Server Action（`src/app/tags/actions.ts` or `/words/[id]/actions.ts` への追加）か、Route Handler が要るか。既存 `words-list.ts` の一覧クエリにタグ条件を組み込む形
- [ ] 認可: 読み取りは `scopedOwnerIds(userId)`、書き込みの所有検証は素の `ownerId: userId`（読み書き非対称）。タグ付け対象単語の所有検証・削除ガードを row-policy 相当に集約するか
- [ ] system 共有単語へのタグ付け（01 次第）の pass-through 認可の扱い
- [ ] 既存一覧クエリ（`listWordsForUser` / `listWordsByOccurrence`）へのタグ join の入れ方（where 句注入・N+1 回避・ページング 20 との整合）
- [ ] エラーマップ `src/lib/tags/error-map.ts`（重複タグ名・不正入力・所有外単語）
- [ ] テスト戦略: 純関数（正規化・絞り込み条件組み立て）は unit、クエリ（可視性スコープ・タグ join）は integration、Action は unit（認証なし・zod 不正・エラーマップ）。`tx-mock` / fixtures の拡張要否
- [ ] マイグレーション適用手順・seed への影響（system タグは持たない想定なら seed 変更なし）

## 議論・決定

（未着手。採用理由と却下した代替案もここに残す。見出しは「決定 N: タイトル」形式で番号を振る。）
