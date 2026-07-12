# 機能紹介ドキュメント（docs/features/）整備プラン

リポジトリ公開に向けて、機能ごとの紹介ページ（スクリーンショット付き）を `docs/features/` に整備する。
将来的にアプリ内ヘルプページへ転用できる「機能ごとの大枠」を作ることが目的。

コンテキスト肥大を避けるためセッションを分割して進める。**本ファイルが進行状況の単一の真実源**。
各チケット完了時に該当セクションを消し込み、全チケット完了時に本ファイルを削除する
（docs/design/ と同じライフサイクル運用）。

## 共通事項（全チケット）

### 撮影環境

- 通常のローカル dev（`docker compose up -d` → `pnpm dev`、localhost:3000）と既存 DB を使う。
- 撮影スクリプトは `scripts/e2e/capture-docs-screenshots.ts`（`pnpm e2e:capture-docs [--only <section>]`）。
  セクション単位で追記していき、部分実行で既存画像を再撮影せずに済むようにする。
- 一般ユーザーは `test1@example.com`（`ensureUser` で冪等用意）、admin 画面は system ユーザー
  （`assertSystemUserReady` で preflight、1 ユーザー 1 context 規約で別 context）。
- 出力は `docs/features/images/<name>.png`。viewport 1280x800 / **deviceScaleFactor 2**（文字の鮮明化）/
  colorScheme "light" / reducedMotion "reduce" 固定。ページ全体ではなく、`shot()` に
  コンテンツコンテナの Locator を渡して **bounding box ＋余白でクリップ**する
  （余白だらけの画像を避ける。縦方向は子要素の実範囲を採るため flex-1 の伸びは写らない）。
- 撮影内容はローカル DB の登録データに依存する（ターゲット1900 の**部分的な**写り込みは許容、
  一式がわかる形での掲載は不可）。commit 前に目視レビューする
  （写り込み範囲・ダークモード/トースト混入なし）。
- 被写体の headword 等はスクリプト定数で固定し、DB に無ければ明示エラーにする。

### ドキュメント共通フォーマット

- 各ページ: `## 概要` / `## 主な画面と操作`（H3 ごとに画像 1 枚＋2〜4 文）/ `## 補足`。
- 用語は `docs/reference/naming-book.md` 準拠（単語テスト・定着〔「卒業」禁止〕・ラウンド・
  掲載箇所〔「出典」禁止〕・うろ覚え・メニュー・訳語・同意語/反意語/派生語 など）。
- 記載後に整合性セルフレビュー（用語・相対リンク・画像参照の突合）を行う。
- `docs/features/README.md` の目次には全機能が並んでいる。ページを執筆したら「準備中」を
  リンクに置き換える。

## チケット②: 単語管理

- capture スクリプトに `words` セクションを追加（6 枚）:

  | 画像 | 画面・状態 |
  | --- | --- |
  | words-list-word-view.png | `/words` 単語ビュー |
  | words-list-occurrence-view.png | `/words` 掲載箇所ビュー（ビュー切替後） |
  | word-new.png | `/words/new` 空フォーム |
  | word-new-duplicate-warning.png | `/words/new` に既存 headword を入力し重複登録警告を表示（保存しない） |
  | word-new-ai-button.png | AI 入力ボタン（**optional**: 短 timeout で探し、無ければ WARN でスキップ。AI Gateway 未設定環境では表示されない） |
  | word-detail.png / word-edit.png | 定数で固定した語の詳細・編集（関連語・例文・メモが揃った語を選定） |

- `docs/features/word-management.md` を執筆。章立て: 単語一覧（単語ビュー/掲載箇所ビュー・検索）/
  単語登録（**重複登録警告＝アプリのコア体験**として強調）/ AI 下書き（環境条件も明記）/
  単語詳細（意味・訳語・例文種別・関連語・メモ）/ 編集 / 掲載箇所と掲載番号（概念説明の正置き場所。
  単語テストの出題範囲との関係）/ 補足: 発音音源（アップロードと TTS 代替 → settings 相互参照）。
- セレクタは実装が一次情報: `src/app/words/new/_components/basic-fields.tsx`（重複警告文言）、
  `src/app/words/_components/`（ビュー切替）。
- 完了条件: 画像 6 枚（AI ボタンは optional）＋ページ執筆＋README 目次リンク化＋目視レビュー。

## チケット③: 単語テスト＋定着モード（最重量）

- capture スクリプトに `quiz` セクションを追加（8 枚）。UI 駆動の注意点は
  `.claude/skills/e2e-verify/references/quiz.md` を必ず参照:
  - 形式選択後に `#quiz-timeout-enabled` が自動 ON になるため**明示 OFF** にする。
  - 四択・TG 四択は設問表示だけ撮って離脱。**完走は自己判定形式**（「解答を表示」→ 3 判定ボタン）で、
    「合っていた・うろ覚え・間違っていた」を織り交ぜた固定パターン → 結果画面に 3 種バッジを出す。
  - 定着モードは結果画面で残数 1 に設定 → 開始 → 1 問目撮影 → いったん `/quiz` へ離脱して
    **再開一覧**を撮影 → 再開 → 完走してラウンド結果撮影。
  - 撮影で作った解答履歴・定着モードは test1 に残ってよい（test1 は使い回し・削除しない規約）。

  | 画像 | 画面・状態 |
  | --- | --- |
  | quiz-start.png | 開始画面（掲載箇所・掲載番号範囲・対象語数プレビュー） |
  | quiz-play-choice.png / quiz-play-tg-choice.png | 四択・TG 四択の設問 |
  | quiz-play-self-judge.png | 自己判定（解答表示後の 3 判定ボタン） |
  | quiz-result.png | 完走結果（正解/うろ覚え/不正解＋定着モード導線） |
  | drill-round-play.png / drill-resume-list.png / drill-round-result.png | ラウンド設問・再開一覧・ラウンド結果 |

- `docs/features/word-quiz.md` を執筆。章立て: テスト開始（掲載箇所・範囲・形式・制限時間・プレビュー）/
  出題形式（10 形式の一覧表、画像は代表 3 形式）/ 解答と結果（正解・うろ覚え・不正解・わからない・時間切れ）/
  補足: デフォルト設定（→ settings）・カウントダウン演出。
- `docs/features/drill.md` を執筆。章立て: 定着モードをはじめる（テスト結果から・残数設定）/
  ラウンドの進行（残数カウントダウン: 正解で −1・誤答/うろ覚えでリセット）/ 中断と再開 / 完了 /
  補足: 同じ問題で再テスト・同じ範囲でもう一度。
- 完了条件: 画像 8 枚＋2 ページ執筆＋README 目次リンク化＋目視レビュー。

## チケット④: 設定＋管理

- capture スクリプトに `settings` セクション（4 枚: settings-home / settings-general /
  settings-occurrences / settings-quiz-defaults）と `admin` セクション（1 枚: admin-users、
  **system ログイン・別 context**）を追加。
- `docs/features/settings.md` を執筆。章立て: 全般（発音音源未登録時の TTS 代替）/
  掲載箇所の管理とプリセット / 単語テストのデフォルト設定（形式別制限時間含む）。
- `docs/features/admin.md` を執筆。章立て: ユーザー管理（`/admin/users`・招待 → 本人パスワード設定
  `/set-password`）。補足: 管理者 = system ユーザー・共有マスタの所有者。
  `docs/ops/admin-user-invite.md` へリンク。
- 完了条件: 画像 5 枚＋2 ページ執筆＋README 目次リンク化＋目視レビュー。
