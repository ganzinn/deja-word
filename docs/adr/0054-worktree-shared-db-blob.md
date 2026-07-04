# ADR-0054: git worktree 並行開発 — DB と .dev-blob は本体と共有

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-04

> **注意**: 本 ADR はコード・コミット履歴からの事後的な推定であり、当時の意思決定の記録ではない。
> 当時を知るメンバーのレビューを経てステータスを更新すること。

## 背景

複数機能を並行開発するために git worktree でブランチごとの作業ディレクトリを分ける。このとき DB とローカル Blob（発音音源の実体）を worktree ごとに分けるか共有するかを決める必要があった。

## 決定内容

- worktree の作成・撤去は `scripts/wt-new.sh` / `wt-rm.sh` に定型化する（branch `feat/<name>`、dir `../deja-word-<name>`、`.env` コピー、`pnpm install` まで自動）
- **DB は単一の `dejaword` を本体と共有**する。dev サーバは 1 つずつ起動する運用のため同時アクセス競合は無い。ブランチ間で migration が食い違うと drift が出るため、worktree 切替後の `pnpm db:migrate` / drift 時の `migrate reset` 手順を規約化
- **発音音源（`.dev-blob/`）も本体と共有**する。DB には相対 key だけが入る（[ADR-0043](0043-blob-di-driver-switching.md)）ため、共有しないと「DB に URL はあるが実体が別 worktree にしか無い → 404」が起きる。`wt-new.sh` が各 worktree の `.env` に `DEV_BLOB_ROOT="<本体>/.dev-blob"` を追記して共有させる
- `node_modules` / `src/generated` / `.next` は worktree ごとに独立

## 採らなかった代替案

- worktree ごとに独立 DB —（推定）migration の食い違い管理より、テストデータ（1900 語規模）を作り直すコストの方が大きいため共有を選んだと考えられる。明示的な比較記録は無いが、共有に伴う drift 対処は文書化されている
- `.dev-blob` を worktree ごとに持つ — 相対 key 設計により 404 が必然的に起きるため共有一択（AGENTS.md に因果関係が明記）

## 影響

- 同時に 2 つの dev を見比べる場合のみ `PORT=3001 pnpm dev`（別ポート起動時は BETTER_AUTH_URL の上書きが必要）
- worktree 撤去で DB・音源が失われることはない（実体は本体側にある）

## 根拠（コード・コミット・文書参照）

- commit `aab95cc` "feat(dev): git worktree 並行開発のセットアップを追加"（PR #46）
- `AGENTS.md` Worktree 節 — DB/Blob 共有の理由と drift 対処
- `scripts/wt-new.sh` / `scripts/wt-rm.sh`
