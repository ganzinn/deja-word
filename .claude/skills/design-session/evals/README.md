# design-session skill eval（凍結資産）

design-session スキルを「新しいコンテキストの実行エージェントが、人間の介在なしに完走できるか」で機械的に評価するための資産。改善（skill 本文の修正）と評価（本ディレクトリ）を分離するため、**評価側は改善ループ中に緩める方向へ変更しない**。

## 構成

```
evals/
├── README.md                  # 本ファイル（完走の凍結定義・運用手順・監査マップ）
├── criteria/                  # judge サブエージェントに渡す判定基準（凍結）
├── bin/
│   ├── run-scenario.sh        # 1 シナリオを隔離 worktree で実行し判定材料を収集
│   └── summarize-transcript.sh # stream-json transcript の人間可読要約
├── scenarios/
│   ├── s1-new-word-tags/           # 新規立ち上げ（典型）
│   ├── s2-continue-word-memo/      # セッション継続（典型）
│   ├── s3-overturn-word-bookmark/  # 確定事項を覆す（エッジ）
│   └── holdout-complete-word-export/ # 設計完了セッション（封印ホールドアウト）
└── runs/                      # 各周回の実行記録（transcript.jsonl は gitignore）
```

各シナリオ: `feature.txt`（機能名）・`prompt.txt`（executor へ渡す入力全文 = スラッシュコマンド + ユーザー事前指示）・`checks.sh`（機械判定）・`fixture/`（事前状態、継続系のみ）。

## 完走の定義（凍結 2026-07-08）

シナリオ 1 実行が「完走」であるのは、以下**すべて**を満たす場合に限る:

1. executor（`claude -p`）が exit 0、かつ transcript の最終 `result` イベントが `subtype: success`
2. `checks.sh <worktree> <base_sha>` が exit 0（シナリオ固有の成果物・コミット条件）
3. transcript 上で `AskUserQuestion` の呼び出しが 0 件、`permission_denials` が 0 件
4. judge-artifact / judge-hesitation の両判定が `OVERALL: PASS`

**INFRA 失敗**（ラウンドを消費しない。ハーネスを修正して再実行する）: permission 拒否・予算上限到達（`--max-budget-usd 15`）・CLI エラー。skill 本文の欠陥ではなくハーネスの欠陥として扱う。

## 質問せず進めてよい範囲（裁量範囲、凍結 2026-07-08）

executor は以下を**質問せずに**進めてよい:

- (i) prompt.txt の事前指示が明示的に回答・許可している事項
- (ii) skill が「技術的に明確な答えがあるものは推奨で進めてよい」とする事項
- (iii) テンプレート内の文言・整形の範囲の判断

以下は**違反（fail）**:

- (a) 事前指示が回答済みの事項をユーザーに問い返す・確認待ちで停止する
- (b) skill がユーザー判断と定める事項のうち、事前指示が回答していないものを無断で決める
- (c) `docs/design/<機能名>/` の外のファイルを変更する

## 引き締めルール（凍結 2026-07-08）

- 基準・check は**追加・強化のみ可**（緩和は不可）
- 変更した場合はコミットに残し、次ラウンドで s1〜s3 を全再実行する

## 新規立ち上げセッション（S1）のコミット要件について

SKILL.md の新規立ち上げモードにはコミット手順が明記されていないが、本 eval では S1 でもコミットを完走条件とする。根拠: (1) セッション継続モードは終了処理にコミットを含み、ドキュメントを未コミットのまま終わるセッションは引き継ぎとして成立しない (2) 後続の ticket-split はコミット済みの設計ドキュメントを前提とする。この非対称は skill 本文の曖昧さであり、ループでの観測対象。

## 実行手順

```sh
# 1 シナリオ実行（リポジトリ直下で）
.claude/skills/design-session/evals/bin/run-scenario.sh \
  .claude/skills/design-session/evals/scenarios/s1-new-word-tags \
  .claude/skills/design-session/evals/runs/round-1/s1
```

run-scenario.sh の動作: main から worktree を作成 → 改善候補の SKILL.md + templates/ を上書きコピー → fixture を配置してコミット（ここまでがセットアップコミット。BASE はこの後の HEAD）→ `claude -p`（claude-opus-4-8）で prompt.txt を実行 → checks.sh + transcript 検査 → 成果物スナップショット・commits.txt・要約を run-dir に収集 → worktree を撤去。

executor には「本番同等のリポジトリ + 改善候補 skill + prompt.txt」だけが見える（evals/ や改善履歴は見えない）。

judge の起動（改善側セッションから、シナリオごとに 2 本・新しいコンテキストで）:

- judge-artifact: `criteria/judge-artifact.md` の基準に従い、`runs/<round>/<s>/artifact/` と `scenarios/<s>/prompt.txt` **だけ**を読んで判定させる
- judge-hesitation: `criteria/judge-hesitation.md` の基準に従い、`runs/<round>/<s>/transcript-summary.md` と `scenarios/<s>/prompt.txt` **だけ**を読んで判定させる
- いずれにも skill の diff・周回履歴・他シナリオの結果を渡さない

各ラウンドの記録は `runs/round-N/summary.md`（pass/fail 表・fail 詳細・迷い記録・修正方針）。raw transcript（transcript.jsonl）はローカル保管のみ（gitignore）。コミットするのは要約・判定・成果物スナップショット・commits.txt・meta.txt。

## preflight 検証記録（2026-07-07〜08）

| # | 検証項目 | 結果 |
| --- | --- | --- |
| 1 | `claude -p --model claude-opus-4-8` + `--output-format stream-json` | 動作確認。`result` イベントに `subtype` / `total_cost_usd` / `permission_denials` が含まれる（claude CLI v2.1.202） |
| 2 | `-p` モードでのスラッシュコマンド展開 | 展開される。`$ARGUMENTS` には**コマンド名以降の全文**（機能名 + 空行 + 事前指示）が入る → skill の引数節に「1 行目の最初のトークンが機能名、以降は事前指示」を凍結前に追記（ベースライン v0） |
| 3 | `--permission-mode acceptEdits` + allowedTools（Read/Write/Edit/Glob/Grep/Task/TodoWrite/Bash(git status/log/diff/add/commit/ls)） | Write と `git commit` が denials 0 で通過（Haiku での安価な probe で確認） |

## G1 ゲート記録（凍結前の健全性確認、2026-07-08）

1. **check の弁別性**: 全シナリオの checks.sh を「実行前の fixture 状態」に対して実行し、成果物系 check が全て名前付きで FAIL することを確認（常時 pass する check の検出）。初回実行で 4 件の非弁別的 check（テンプレートのプレースホルダ文にマッチする採用/却下 check、状態表の要約列にマッチする引き継ぎ check）を検出し、決定セクション・引き継ぎセクション内にスコープを絞って強化した。ガード系 check（clean tree / 変更スコープ）が pre-run で pass するのは想定どおり（実行後の逸脱を検出する向きの check のため）。
2. **fixture の整合性**: 新しいコンテキストのサブエージェントに 3 fixture セット + prompt.txt の噛み合わせをレビューさせ、「3 セットとも内部矛盾・転記ずれ・不成立の記述なし、使用可」の判定を得た。

## 制約検証メモ

- SKILL.md にモデル名指定が存在しないことを確認（2026-07-07、grep）。「モデル名指定の削除」対応は不要（no-op）
- eval ハーネス側のモデル指定: executor = claude-opus-4-8（評価対象モデルのため固定）、preflight の機械的 probe = Haiku（下請け工程のため許容）

## 監査マップ

（各ラウンド終了時に追記: どの run がどの主張を裏付けるか）
