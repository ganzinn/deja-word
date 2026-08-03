# 06. アーキテクチャ・テスト戦略

状態: **未着手**

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- 例文にも発音音源（mp3）を登録でき、未登録のときだけ TTS にフォールバックする（01 確定）。
- 対象画面は単語詳細（全例文種別）と単語テストの TG 形式（TG例文のみ）（01 確定）。
- 単語テスト TG 形式ではボタンを増やさず、いま見出し語を鳴らしているボタンの対象を TG例文へ差し替える（01 確定）。
- `Example` に `pronunciationAudioUrl String?` を追加し、blob key は `audio/example/<exampleId>/pronunciation.mp3`（02 確定）。
- 音源 URL を横断で扱う 6 経路すべてに Example を追加し、カラム追加・登録・削除経路は同一チケットで揃える（02 確定）。
- 一括プリフェッチはグループ別（見出し語・関連語 / 例文）にダウンロードでき、Cache Storage は 1 つのまま prune は和集合で判定する（02 確定）。
- `pronunciation-audio.ts` は `exampleTarget` ディスクリプタと公開 API 2 本（`uploadExampleAudioForUser` / `deleteExampleAudioForUser`）の追加のみで、共通コアは無改造（03 確定）。`ExampleNotFoundError` を新設する。
- 入口は `words/[id]/edit/actions.ts` への action 2 本追加で、route handler は新設しない（03 確定）。
- 音源の登録 UI は例文カードの例文テキスト直後に `PronunciationAudioManager` を再利用して置く（03 確定）。
- `exampleSchema` に `pronunciationAudioUrl` を足すが UI 表示専用で、`upsertExamples` は読み書きしない（03 確定）。
- 読み上げ正規化の括弧規則は `toSpokenText`（`src/lib/speech.ts`）1 箇所への追加で、除去順序は「装飾記法 → `【…】` → `[…]` → 残存括弧記号 → プレースホルダ → 空白畳み込み」（04 確定）。既存テスト `speech.unit.test.ts` の期待値 `suggest (to ) that` は更新対象。
- 括弧は半角・全角の両字形が対象で、表示側 `TG_TEXT_PATTERN`（`src/components/tg-example-text.tsx`）にも全角括弧を足して同一チケットで揃える（04 確定）。表示変更を伴うため `docs/features/` の再撮影要否を棚卸しする。
- 単語詳細の例文カード上部にメタ行を新設し、`AudioPlayButton`（`src` = 例文の音源、`ttsText` = 例文の英文）を 1 つ置く（05 確定）。`AudioPlayButton` 自体は変更しない。
- TG 4 形式では発音ボタン・自動再生・プリロードの対象を TG例文に差し替え、見出し語の音源へはフォールバックしない（05 確定）。差し替え箇所は `quiz-flow.tsx` / `question-choice.tsx` / `revealed-headword-card.tsx` / `result-list.tsx` の 4 つ。
- 「鳴らす対象」は `questionBaseOf` の段階で音源 URL と読み上げテキストの 1 組に決め、`QuestionBase` に載せる。UI 側は形式分岐しない（05 確定）。フィールド名・型は 06 で決める。
- ダミー選択肢には音源・読み上げを持たせない（05 確定）。
- 設定画面は 1 セクション内にグループ別 2 行を並べ、「端末から削除」は共通 1 つのまま（05 確定）。同時ダウンロードはしない。

## 検討事項リスト

- [ ] quiz のデータフロー（`quiz-source.ts` → `material.ts` の `TgExampleRow` / `QuizWord.tgExample` → `payload.ts`）への音源 URL の載せ方
- [ ] モジュール配置（`pronunciation-audio.ts` の拡張範囲、共有コンポーネントの切り出し単位）
- [ ] 単語詳細側のデータ取得経路（例文の音源 URL をどのクエリで返すか）
- [ ] テスト戦略（unit / integration の割り当て、E2E で確認する範囲）。既存 E2E スクリプト `pnpm e2e:audio-cache` / `pnpm e2e:audio-prefetch` はプリフェッチのグループ分け（02 確定）に追随が要るか
- [ ] 機能紹介ドキュメント（`docs/features/`）の更新対象とスクリーンショット再撮影の要否
- [ ] `docs/reference/naming-book.md` への用語追加（例文の音源の呼び方。既存の「発音音源」との言い分け）
- [ ] 実装後に起票する ADR の候補

## 議論・決定

（未着手。見出しは「決定 N: タイトル」形式で番号を振り、本文に「採用理由:」「却下した代替案:」のラベル付き行を置く。）
