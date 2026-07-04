# src/lib/words

- `handlers/index.ts` の子エンティティ書き込み順序は旧実装と同一に保つ契約 (ファイル内コメント参照)。並べ替え・並列化をしない。
- 認可は 2 層: `policy/editor-context.ts` が「誰として書くか」、`policy/row-policy.ts` が「行ごとの可否」。一般ユーザーは system 行の pass-through (無変更で通す) はできるが改変・削除はできない。認可の変更は row-policy に集約し、handler 内に条件分岐を書かない。
