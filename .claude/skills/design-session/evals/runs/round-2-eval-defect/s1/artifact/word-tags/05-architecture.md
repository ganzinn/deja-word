# 05. アーキテクチャ

状態: **未着手**

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

（依存する決定が確定したら、ここに 1 行ずつ再掲する。形式: 「- {依存する決定の要約}（{NN} 確定）。」）

参考（確定ではなく既存コード規約。words 機能を手本とする）:
- UseCase は `src/lib/*.ts` 直下フラット（`words-create.ts` 等の相似形で `tags-*.ts`）。機能サブディレクトリ `src/lib/tags/` に query / handler / policy を置く。
- Server Action は `src/app/words/**/actions.ts`（`"use server"`）で throw せず Result 型を返す。読み取り一覧は Server Component が UseCase を直接 await。
- zod スキーマは `src/lib/schema/`（`zod/v3` から import）。認可は「読み取り = `scopedOwnerIds`、所有検証 = 素の `ownerId: userId`」の非対称（`src/lib/CLAUDE.md`）。row-policy は `src/lib/words/policy/`。
- 認証・認可境界に触れるため、整合性レビューでは `docs/reference/security-design-checklist.md` を通す。

## 検討事項リスト

- [ ] モジュール配置（UseCase `src/lib/tags-*.ts` の分割単位、`src/lib/tags/` 配下の query / handler / policy）
- [ ] インターフェース（作成・付与・解除・削除の Server Action と、一覧絞り込み読み取りの経路）
- [ ] 認可: 読み取り `scopedOwnerIds` / 書き込み 素の `ownerId: userId` の非対称の適用。system 共有マスタ単語へのタグ付与を許す場合のガードと孤児防止（row-policy 拡張の要否）
- [ ] zod スキーマの置き場・粒度（`src/lib/schema/tag*.ts`）とタグ名バリデーション（03 の正規化ルールとの責務分担）
- [ ] マイグレーション（side table 加算、命名 `add_word_tags` 系。既存テーブル無変更で済むか）
- [ ] テスト戦略（正規化・絞り込み条件化は unit、所有スコープ・system 単語付与・孤児防止は integration。`tx-mock` / fixtures 拡張の要否）

## 議論・決定

（未着手。採用理由と却下した代替案もここに残す。見出しは「決定 N: タイトル」形式で番号を振る。）
