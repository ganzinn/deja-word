# ADR（Architecture Decision Records）

このコードベースに埋まっている設計判断を、AI エージェント・開発者が設計判断に迷ったときに参照できるよう ADR として書き出したもの。

> **全 ADR 共通の免責**: 各 ADR はコード・コミット履歴・既存ドキュメントからの**事後的な推定**であり、当時の意思決定の記録ではない。当時を知るメンバーのレビューを経てステータスを更新すること。捏造防止のため、全 ADR は根拠となるコード・コミット・文書への参照を必ず持ち、記録に無い理由は「（推定）」と明記している。

## ステータス定義

| ステータス | 意味 |
| --- | --- |
| 提案 | 起票済み・レビュー待ち（**現在すべての ADR がこの状態**） |
| 承認 | 当時を知るメンバーが内容を確認し、確定した決定として扱ってよい |
| 却下 | レビューの結果、事実と異なる・決定として存在しなかったと判断された |
| 廃止 | かつて有効だったが、後続の決定に置き換えられた（置換先を明記する） |

## 運用ルール

- 1 ADR = 1 判断。新しい設計判断をしたら新規 ADR を起票する（今後は事後推定ではなくリアルタイムの記録として）
- 既存の決定を覆す場合は、旧 ADR を「廃止」にして新 ADR から参照する（本文の書き換えで上書きしない）
- 廃止した ADR は A〜H のテーマ一覧から外し、末尾の「廃止済み ADR」節へ移す。ファイルは残し冒頭に廃止バナー（ステータス: 廃止 ＋ 置換先）を置く（生きた判断の一覧をノイズなく保つ）
- `docs/design/` は実装済みの設計文書を削除していく運用のため、design/ 由来の決定は該当 ADR が長期の引き継ぎ先になる
- 用語は `docs/reference/naming-book.md` に準拠する

## 一覧（確信度リスト）

確信度: **高** = 理由が記録に残っている / **中** = 決定は明確だが理由の記録が部分的 / **低** = 事実の痕跡のみで理由が未記録（→ 確認質問あり）

### A. 基盤・スタック

| ID | タイトル | 確信度 | 確認質問 |
| --- | --- | --- | --- |
| [0001](0001-nextjs-app-router-stack.md) | Next.js 16 App Router + React 19 + Tailwind v4 スタック採用 | **低** | あり |
| [0002](0002-exact-version-pinning.md) | mise + engines + packageManager の3点同期による exact pin | 中 | あり |
| [0003](0003-prisma7-driver-adapter-generated-client.md) | Prisma 7 + driver adapter、client 生成先 src/generated | 高 | — |
| [0004](0004-better-auth-two-stage-session-check.md) | Better Auth、proxy 楽観チェック + DB 正検証 | 高 | — |
| [0005](0005-zod-v3-subpath.md) | zod v4 パッケージを zod/v3 サブパス API で統一使用 | 中 | あり |

### B. データモデル

| ID | タイトル | 確信度 | 確認質問 |
| --- | --- | --- | --- |
| [0006](0006-owner-vs-user-table-families.md) | コンテンツ系 ownerId / 設定系 userId のテーブル2ファミリー | 高 | — |
| [0007](0007-system-user-as-admin.md) | system ユーザー = 共有マスタ所有者 = 管理者（role 不採用） | 高 | — |
| [0008](0008-side-table-addition.md) | スキーマ進化は side table 加算 | 高 | — |
| [0009](0009-cascade-default-setnull-exceptions.md) | onDelete Cascade 既定 + SetNull 2箇所の意図的例外 | 高 | — |
| [0010](0010-no-soft-delete.md) | ソフトデリート不採用（物理削除のみ） | **低** | あり |
| [0011](0011-occurrence-concept-many-to-many.md) | 掲載箇所（Occurrence）概念と WordOccurrence 多対多 | 中 | あり |
| [0012](0012-note-child-tables.md) | note 単一カラム → *Note 子テーブル化 | 中 | — |
| [0013](0013-enum-addition-backfill-migration.md) | enum 値追加時は推奨デフォルトの backfill migration | 高 | — |
| [0065](0065-system-word-coexistence.md) | system 単語作成は共存させる（昇格マージ廃止、0062 を置換） | 高 | — |
| [0066](0066-system-word-deletion-guard.md) | system 所有単語の削除方針（pass-through 子を持つ共有単語は削除拒否） | 高 | — |
| [0069](0069-bookmark-per-user-side-table-start-time-eval.md) | ブックマークは per-user side table・quiz 絞り込みは開始時評価 | 高 | — |

### C. アーキテクチャ・レイヤリング

| ID | タイトル | 確信度 | 確認質問 |
| --- | --- | --- | --- |
| [0014](0014-three-layer-architecture.md) | 3層構成、Repository/DDD 不採用 | 高 | — |
| [0015](0015-usecase-owns-transaction.md) | UseCase がトランザクション所有、handler は tx 受領 | 高 | — |
| [0016](0016-server-action-result-type.md) | Server Action は throw せず Result 型（error-map 境界） | 高 | — |
| [0017](0017-server-actions-over-route-handlers.md) | インターフェースは Server Action 統一（Route Handler は例外4件） | 高 | — |
| [0018](0018-scoped-owner-ids-read-scope.md) | 読み取り認可は scopedOwnerIds の where 注入 | 高 | — |
| [0019](0019-two-layer-write-authorization.md) | words の二層書き込み認可、quiz は意図的に不適用 | 高 | — |
| [0068](0068-content-input-max-limits.md) | コンテンツ系入力テキスト・配列の zod 上限（短文 100 / 長文 2000 / 配列 50、quiz 解答系 5000） | 高 | — |
| [0077](0077-rich-text-markup.md) | 文章系フィールドの装飾は Markdown 風記法・生テキスト保存（見出し語等は対象外） | 高 | — |
| [0083](0083-placeholder-italic-shared.md) | プレースホルダ do/doing の斜体は訳語・TG 例文で共通、色と A/B の斜体は TG 例文限定 | 高 | — |
| [0084](0084-search-keyword-accent-normalization.md) | 単語検索はキーワード側のアクセント記号を落として照合（保存データは正規化しない） | 高 | — |
| [0085](0085-swipe-nav-window-touch.md) | 前後ナビの横フリックは window の touch イベントで判定（左＝次 / 右＝前、画面端除外） | 高 | — |
| [0086](0086-word-nav-transition-feedback-prefetch.md) | 前後ナビに遷移中フィードバック（淡色化＋方向スライド）とプリフェッチを追加（0085 追補。ページ側プリフェッチは 0090 で廃止） | 高 | — |
| [0087](0087-occurrence-number-beside-headword.md) | 掲載番号は見出し語の右に `#N`（中央ラベル `No.N` 廃止）、前後ナビは 2 ボタン右詰め | 高 | — |
| [0088](0088-quiz-dialog-list-order-nav.md) | テスト結果ダイアログの前後ナビは結果一覧順のクライアント配列（サーバ隣接取得廃止、0086 決定 3 の隣接先読みを置き換え） | 高 | — |
| [0089](0089-word-detail-nav-list-context.md) | 単語詳細の前後ナビは一覧コンテキストに追随（`view=word` URL コンテキスト、kind 付き union、一覧と where 共有の隣接クエリ） | 高 | — |
| [0090](0090-word-nav-no-prefetch.md) | 前後ナビのフルプリフェッチ廃止・毎回サーバー取得で一覧の表示順と同期（0086 決定 3 のページ側プリフェッチを置き換え） | 高 | — |
| [0094](0094-bulk-bookmark-skip-and-colocation.md) | ブックマーク一括登録は検証落ちを skip（1 件版との非対称）・変換は action 内・UseCase は bookmark-settings.ts へ相乗り（0063 の適用例、0014 からの明示的逸脱） | 高 | — |

### D. quiz 機能

| ID | タイトル | 確信度 | 確認質問 |
| --- | --- | --- | --- |
| [0020](0020-feature-named-quiz.md) | 機能名は quiz（「テスト」回避） | 高 | — |
| [0021](0021-voluntary-self-test-no-srs.md) | 任意起動の腕試しモデル（SRS スコープ外） | 高 | — |
| [0022](0022-quiz-source-occurrence-range.md) | 出題対象は掲載箇所 + 番号範囲、範囲内全件出題 | 高 | — |
| [0023](0023-batch-submit-discard-on-abort.md) | 履歴は終了時一括送信、中断 = 破棄 | 高 | — |
| [0024](0024-no-quiz-session-table.md) | テストセッションテーブル非採用（append-only） | 高 | — |
| [0025](0025-server-side-generation-cheating-accepted.md) | サーバ側全生成・正答同梱（カンニング許容） | 高 | — |
| [0026](0026-dummy-choices-same-occurrence-first.md) | ダミーは同一掲載箇所優先 → 全単語補充 | 高 | — |
| [0027](0027-meaningless-words-excluded-tg-exception.md) | 意味未登録語は対象外（TG 形式のみ例外） | 高 | — |
| [0028](0028-rng-injected-pure-generation.md) | RNG 注入の純関数生成 + Fisher–Yates、シード非永続 | 高 | — |
| [0029](0029-format-extension-exhaustive-switch.md) | 形式拡張は exhaustive switch 方式 | 高 | — |
| [0030](0030-dummy-pool-bounded-fetch.md) | dummy-pool 上限フェッチ + プレビュー軽量化（実測駆動改訂） | 高 | — |
| [0031](0031-client-state-screen-flow.md) | /quiz 内クライアント状態遷移（URL 分割なし） | 高 | — |
| [0032](0032-history-submit-single-flight.md) | 履歴送信 single-flight + 存在フィルタ、TEST 重複は MVP 許容 | 高 | — |
| [0033](0033-drill-round-count-cas.md) | drill ラウンド冪等性は roundCount の CAS | 高 | — |
| [0034](0034-per-format-timeout-setting.md) | 制限時間は形式別オプション設定 | 高 | — |
| [0035](0035-vague-self-judge-option.md) | 自己判定に「うろ覚え」導入、GAVE_UP 転用 | 高 | — |
| [0070](0070-bookmark-all-scope-quiz.md) | ブックマーク全件モード（掲載箇所なし出題、0022 の明示的例外） | 高 | — |
| [0072](0072-quiz-order-by-occurrence-number.md) | 掲載番号順出題（出題順の決定を buildQuiz に集約、0039 の明示的例外） | 高 | — |
| [0074](0074-quiz-question-count-sampling.md) | 出題数の指定（範囲からランダム抽選、再テストは再抽選） | 高 | — |

### E. drill（定着モード）

| ID | タイトル | 確信度 | 確認質問 |
| --- | --- | --- | --- |
| [0036](0036-drill-remaining-count-model.md) | 残数モデル | 高 | — |
| [0037](0037-drill-per-source-test.md) | 元テスト単位の独立 drill、都度生成 | 高 | — |
| [0038](0038-drill-inherits-format-timeout.md) | 形式・制限時間は元テストから継承 | 高 | — |
| [0039](0039-drill-reshuffle-each-round.md) | 毎ラウンド再シャッフル | 高 | — |
| [0040](0040-drill-default-wrong-only.md) | 既定は誤答のみ、正解含むはオプトイン | 高 | — |
| [0041](0041-drill-retry.md) | DRILL_RETRY（残数無影響の再演習） | 高 | — |
| [0042](0042-retest-same-range.md) | 「同じ範囲でもう一度テストする」（sourceRange 保持） | 高 | — |
| [0067](0067-drill-unaskable-members.md) | 投入後に出題不能化した DrillWord メンバーはラウンド生成時に自動削除（自己修復） | 高 | — |

### F. 音源

| ID | タイトル | 確信度 | 確認質問 |
| --- | --- | --- | --- |
| [0043](0043-blob-di-driver-switching.md) | Blob DI 境界 + env による driver 切替（dev はローカルディスク） | 高 | — |
| [0044](0044-blob-best-effort-delete.md) | put → update → del 順序、削除ベストエフォート（DB が真実源） | 高 | — |
| [0045](0045-remove-translation-audio.md) | 意味読み上げ音源の廃止 | 高 | — |
| [0046](0046-tts-fallback.md) | TTS フォールバック（mp3 優先） | 高 | — |
| [0047](0047-quiz-audio-autoplay-preload.md) | quiz 中の自動再生 + プリロード、失敗非ブロック | 高 | — |
| [0075](0075-audio-local-cache-and-prefetch.md) | SW cache-first で端末に保持 + 設定画面から一括プリフェッチ（掃除は manifest 差分） | 高 | — |
| [0076](0076-audio-source-visual-distinction.md) | 発音ボタンは音源／自動音声をアイコン＋濃淡で区別（ラベル文字は変えない。詳細カードは 0092 でアイコンのみに） | 高 | — |
| [0078](0078-speech-text-normalization.md) | 自動音声は表示用の記号（装飾記法・チルダ・【…】）を落として読む | 高 | — |
| [0079](0079-example-pronunciation-audio.md) | 例文にも発音音源を持たせ、TG 形式の発音ボタンは TG例文を鳴らす | 高 | — |
| [0080](0080-audio-prefetch-grouping.md) | 一括プリフェッチは見出し語・関連語／例文のグループ別（Cache Storage は 1 つ・掃除は和集合） | 高 | — |
| [0081](0081-speech-bracket-normalization.md) | 読み上げの括弧は意味で出し分け（`(…)` は中身を読む／`[…]` は中身ごと落とす） | 高 | — |
| [0082](0082-second-meaning-audio-only.md) | 2 個目以降の意味の発音は登録済み音源のみ（自動音声を与えない） | 高 | — |
| [0092](0092-detail-card-pronunciation-tap.md) | 単語詳細のカードは全体がタップで発音を鳴らす（右上のアイコンのみバッジが音源の有無を示す。0076 追補） | 高 | — |

### G. 認証・デプロイ・運用

| ID | タイトル | 確信度 | 確認質問 |
| --- | --- | --- | --- |
| [0048](0048-admin-invite-without-email.md) | サインアップ無効 + 管理者招待（メール送信なし） | 高 | — |
| [0049](0049-staged-email-change-accepted-risk.md) | ステージング型メール変更、リスク許容 + requireEmailVerification 禁止 | 高 | — |
| [0050](0050-vercel-managed-integration.md) | Vercel-Managed Integration（Terraform 撤回） | 高 | — |
| [0051](0051-release-tag-triggered-deploy.md) | Release タグトリガー本番デプロイ + Preview 抑止 | 高 | — |
| [0052](0052-ops-scripts-di-core.md) | Ops スクリプト規約（tsx + DI コア + dry-run 既定） | 高 | — |
| [0053](0053-intermediate-csv-import.md) | 中間 CSV 分解パイプラインでの取り込み | 高 | — |
| [0054](0054-worktree-shared-db-blob.md) | worktree 並行開発（DB・.dev-blob 共有） | 高 | — |
| [0055](0055-occurrence-presets-opt-in.md) | 共有掲載箇所プリセット既定 OFF（オプトイン） | 高 | — |
| [0073](0073-webview-android-app.md) | Android 提供は WebView シェル + ネイティブ TTS ブリッジ | 高 | — |
| [0091](0091-worktree-unified-creation.md) | worktree 作成の wt-new.sh 一本化＋置き場統一（0054 部分置き換え） | 高 | — |
| [0093](0093-occurrence-content-export-import-sync.md) | 掲載箇所の単語コンテンツ同期は中間 JSON を挟む 2 段構成 | 高 | — |
| [0094](0094-feature-origin-worktree-model.md) | 機能開発は起点 worktree モデル（フェーズ横断保持・チケット単位 PR モード廃止） | 高 | — |

### H. テスト・開発プロセス

| ID | タイトル | 確信度 | 確認質問 |
| --- | --- | --- | --- |
| [0056](0056-test-split-unit-integration.md) | unit/integration 拡張子分割 + 専用 DB + truncate/reseed | 高 | — |
| [0057](0057-integration-tests-not-in-ci.md) | integration テストは CI で走らせない | **低** | あり |
| [0058](0058-nested-claude-md.md) | 規約はネスト CLAUDE.md に配置、AGENTS.md スリム化 | 高 | — |
| [0059](0059-naming-book-and-issue-backlog.md) | naming-book が用語の権威、バックログは GitHub Issues | 高 | — |
| [0060](0060-two-layer-format-enforcement.md) | 整形強制は Stop hook + CI の二層 | 高 | — |

### I. コード監査起票（2026-07-04）

0061 / 0063 / 0064 はコード監査からの**改善提案**（既存決定の記録ではなく、これから決める判断）。※同批で起票した 0062 は廃止し「廃止済み ADR」節へ移動、置換先は 0065（B）/ 0066（B）。

| ID | タイトル | 確信度 | 確認質問 |
| --- | --- | --- | --- |
| [0061](0061-destructive-ops-confirmation-gate.md) | 破壊的 ops スクリプトの確認ゲート統一（TTY + 対象名確認） | **低** | あり |
| [0063](0063-error-map-boundary.md) | エラー→Result 変換の集約線引き | **低** | あり |
| [0064](0064-db-check-constraints.md) | 数値不変条件の DB CHECK 制約（raw SQL migration 規約化） | **低** | あり |

## 廃止済み ADR

後続の決定に置き換えられた ADR。ファイルは履歴として残し冒頭に置換先バナーを持つ。A〜H の一覧からは外してここへ集約する（生きた判断の一覧をノイズなく保つため）。

| ID | タイトル | 置換先 |
| --- | --- | --- |
| [0062](0062-system-word-promotion-merge.md) | system 単語作成時の「昇格マージ」（暗黙統合と所有権移譲） | [0065](0065-system-word-coexistence.md)（作成）/ [0066](0066-system-word-deletion-guard.md)（削除） |
| [0071](0071-twa-android-app.md) | Android 提供は TWA + APK サイドロード（Capacitor 不採用） | [0073](0073-webview-android-app.md) |

## 人間への確認質問（レビュー時にまとめて回答用）

回答は issue #101 で追跡する。回答が得られ次第、該当 ADR へ反映して確信度を更新する。

確信度「低」（必須）:

- **[0001](0001-nextjs-app-router-stack.md)** スタック採用: Next.js を選んだ動機は？比較した候補（Remix、Rails 等）はあったか？
- **[0010](0010-no-soft-delete.md)** ソフトデリート不採用: 意図的な判断か？履歴保全・誤削除復旧の要求が将来も無い前提でよいか？
- **[0057](0057-integration-tests-not-in-ci.md)** integration の CI 除外: 主因は DB 用意コスト / 実行時間 / secrets 管理のどれか？将来 CI に載せる意向は？
- **[0061](0061-destructive-ops-confirmation-gate.md)** 破壊的 ops の確認ゲート: 非対話 `--execute` 前提の運用（CI・自動化）は実在するか？
- **[0063](0063-error-map-boundary.md)** error-map の線引き: 「共有ドメインエラーのみ集約」でよいか、全集約に倒すか？
- **[0064](0064-db-check-constraints.md)** CHECK 制約: raw migration と drift 検出の折り合いを許容するか？対象カラムの過不足は？

確信度「中」（任意の補足）:

- **[0002](0002-exact-version-pinning.md)** exact pin の動機（再現性以外の背景があれば）
- **[0005](0005-zod-v3-subpath.md)** zod v3 API に留まるのは暫定か恒久か
- **[0011](0011-occurrence-concept-many-to-many.md)** タグ → 掲載箇所刷新時に他に検討した概念モデルがあれば
