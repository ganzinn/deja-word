# ADR-0067: 投入後に出題不能化した DrillWord メンバーはラウンド生成時に自動削除（自己修復）

- ステータス: 承認
- 確信度: 高
- 起票日: 2026-07-11
- 決定日: 2026-07-11

## 背景

drill の完了判定は「全 DrillWord 行の `remaining === 0`」（`src/lib/quiz/handlers/drill-round-handler.ts` の `remaining.every(w => w.remaining === 0)`）。一方ラウンド生成の出題対象は取得クエリの適格述語（対象 Occurrence への番号付きリンク ∧ 形式適格）を満たすメンバーに限られるため、投入後の通常編集でメンバーが出題不能になると `remaining > 0` のまま二度と出題されず、**drill が恒久に完了不能**になる（issue #106）。

issue #106 手順 1〜2（マージ済み緩和策）で経路の大半は塞いだ:

- 手順 1（`src/lib/drill-create.ts`）: 作成時に番号付きリンクの無い単語を DrillWord に投入しない（混入防止）
- 手順 2（`src/lib/quiz/queries/quiz-source.ts` の `ensureTargetWordIds`）: 番号が範囲外へ移動したメンバーも範囲と独立に出題する（範囲外化の救済）

それでも残る出題不能化の経路は**投入後の通常編集**によるもの:

- **意味の全削除**: 可視 MeaningText が 0 件になると非 TG 形式の形式適格（`eligibleWord`）を満たさない（TG 例文形式では「使える TG 例文」の全削除が同型）
- **番号付きリンクの喪失**: WordOccurrence のリンク解除、または occurrenceNumber の null 化

単語自体の削除は `onDelete: Cascade` で DrillWord ごと消えるため問題にならない。本決定以前は、上記の経路で完了不能化した drill からユーザーが脱出する手段は **drill の削除のみ**だった。

## 決定内容

**(b) ラウンド生成時に出題不能 DrillWord 行を自動削除する（自己修復）** を採用する。

- `generateDrillRoundForUser`（`src/lib/drill-round-generate.ts`）は、`remaining > 0` なのに出題対象として返ってこなかったメンバー（＝対象 Occurrence への番号付きリンク喪失、または形式適格性喪失）の DrillWord 行を削除する。
- 削除の結果、未定着メンバーが 0 になった場合はその場で `completedAt` を設定する（送信側 `applyDrillRound` の完了判定の**鏡像**。これが無いと送信すべきラウンドが発生せず、完了機会が永久に失われる）。このとき関数は問題を返せないため `DrillNoAskableWordsError` を throw し、action 層（`src/lib/quiz/error-map.ts`）が「出題できない単語を対象から外したため、この定着モードは完了になりました。」の Result（code `generation_failed`）へ変換する。クライアントは既存のロードエラー表示（`quiz-flow.tsx` の `loadError`）で伝えるのみで、新規 UI は無い。drill は完了扱いになり進行中一覧（`completedAt IS NULL`）から消える。
- 適用範囲は**ラウンド生成のみ**。再テスト生成（`src/lib/drill-retry-generate.ts`）には削除を入れない（再テストは残数・完了判定に関与せず、出題不能メンバーは単に出題されないだけで完了不能化の害が無いため）。

採用理由:

- 無意味な行（出題も定着もできない DrillWord）を残さず、不変条件「DrillWord のメンバー = 出題可能」をデータ側で回復する。完了判定・送信パスは無変更で、変更がラウンド生成 1 箇所に閉じる。
- 単語削除の Cascade（DrillWord ごと消える）＋「完了判定は残っている DrillWord 行だけで行う」（docs/design/word-quiz/05-architecture.md 決定 4）という既存前例の自然な拡張。

注意点（意図的な割り切り）:

1. 読み取り経路であるラウンド生成が書き込み（削除・完了確定）を持つのは、自己修復としての**意図的な例外**。
2. 削除後に意味（や番号付きリンク）を復元してもメンバーは drill に戻らない。単語を削除→再作成しても Cascade で消えた DrillWord が戻らないのと同じ割り切り（手順 1〜2 により対象は「投入後に意味を全削除 / 番号付きリンクを失った」稀なケースに限定され、発生頻度・影響が小さい前提）。

## 採らなかった代替案

- **(a) 完了判定から出題不能メンバーを除外する** — 出題不能行が DB に恒久に残り、不変条件「completed = 全 DrillWord 行 remaining 0」が壊れ、以後のコードが「残っているが数えない」第 3 の状態を常に意識する必要がある。完了判定を持つ送信 tx（#105 でタイムアウト対策済み）に適格性判定クエリを足すことにもなる。
- **(c) UI 通知のみ（データ不変）** — 出題不能メンバーの可視化はできるが、drill が完了不能のまま残り（脱出手段は依然 drill 削除のみ）、無意味な行も残る。issue #106 の完了条件「投入後に意味削除しても完了可能」を満たさない。

## 影響

- ラウンド生成（`generateDrillRoundForUser`）が `drillWord.deleteMany` の書き込みを持つ。未定着メンバー全滅時は削除と `completedAt` 設定（未設定時のみ）を `prisma.$transaction` の逐次バッチで行い、`DrillNoAskableWordsError` を throw する。
- 全滅時のユーザー体験: 再開クリック → エラーメッセージ「出題できない単語を対象から外したため、この定着モードは完了になりました。」→ drill は進行中一覧から消える（完了扱い）。
- 送信パス（roundCount CAS、[ADR-0033](0033-drill-round-count-cas.md)）・進捗表示・再テスト（[ADR-0041](0041-drill-retry.md)）は無変更。範囲外へ移動しただけのメンバーは従来どおり `ensureTargetWordIds` で出題され続け、削除対象にならない。

## 根拠（コード・コミット・文書参照）

- issue #106（2026-07-04 コード監査。手順 3 として本判断を分離）
- `src/lib/drill-round-generate.ts`（自己修復削除＋生成時完了確定、`DrillNoAskableWordsError`）
- `src/lib/quiz/error-map.ts`（`generation_failed` への変換）
- `src/lib/quiz/handlers/drill-round-handler.ts`（送信側の完了判定 `remaining.every(w => w.remaining === 0)`）
- `src/lib/drill-create.ts` / `src/lib/quiz/queries/quiz-source.ts`（手順 1〜2 の緩和策）
- テスト: `src/lib/drill-round-generate.integration.test.ts`（出題不能メンバーの行削除・生き残りメンバーでの完了到達・全滅時の完了確定と throw・範囲外メンバーの非削除）
- 残数モデルは [ADR-0036](0036-drill-remaining-count-model.md)、Cascade 既定は [ADR-0009](0009-cascade-default-setnull-exceptions.md)
