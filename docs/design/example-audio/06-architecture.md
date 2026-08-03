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
