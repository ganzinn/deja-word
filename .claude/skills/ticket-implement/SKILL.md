---
name: ticket-implement
description: docs/plan/<機能名>/ のチケット群を、機能の起点 worktree 上の統合ブランチへ依存順に並行実装する（1 チケット = 1 squash コミット、機能全体で 1 PR）。実装の委譲先は herdr 環境（HERDR_ENV=1 かつ claude integration が current）なら herdr の独立ペインで動く claude CLI がデフォルト、それ以外はサブエージェント。--teams で agent teams の teammate、--subagent でサブエージェント固定に切り替える。
argument-hint: "[機能名] [--herdr|--teams|--subagent]"
disable-model-invocation: true
---

# ticket-implement

`design-session（docs/design）→ ticket-split（docs/plan）→ ticket-implement（実装）` パイプラインの最終工程。plan ハブ（`docs/plan/<機能名>/README.md`）を唯一の入口とし、チケット一覧表の依存・状態列から「今並行着手できるチケット集合」を判定して、worktree 上の実装エージェントに実装を委譲する。

用語: **「実装エージェント」は委譲先の総称**（委譲手段は「引数」節で選択）。**「サブエージェント」は Agent ツールによる委譲手段だけ**を指す。

plan ハブの「ステータス運用ルール」が言う**「実装セッション」は本スキルのメインセッションのこと**。着手時・PR 作成時・マージ時のステータス更新責務は本スキルが引き受ける（計画の変更 — チケットの追加・削除・依存の組み替え — は ticket-split の管轄のまま）。

## 引数

対象: `$ARGUMENTS`（`<機能名> [--herdr|--teams|--subagent]`）

- 機能名は `docs/plan/<機能名>/` のディレクトリ名
- 委譲手段は 3 種（herdr ペイン / teams / サブエージェント）。**フラグ未指定時は自動選択**: `HERDR_ENV=1` かつ herdr の claude integration が current（「herdr ペイン委譲」節の前提参照）なら herdr ペイン委譲、満たさなければサブエージェント委譲
- `--herdr` は herdr ペイン委譲の明示指定（前提を満たさなければサブエージェント委譲にフォールバックし、その旨を計画ドラフト提示で伝える）。`--teams` は teams 委譲（「teams 委譲」節参照）、`--subagent` はサブエージェント委譲の強制。3 つは排他（複数指定されたら計画ドラフト提示でどれにするか確認する）
- 機能名未指定の場合: 本体の checkout に依存せず走査する。`git fetch origin main` の上で `git ls-tree --name-only origin/main docs/plan/` と統合ブランチの有無（`git branch --list 'feature/*'` のうち `docs/plan/` のディレクトリ名と一致するもの。チケットブランチ `feature/<機能名>-NN-*` は含めない）から機能を列挙し、ハブを `git show <統合ブランチまたは origin/main>:docs/plan/<機能名>/README.md` で読んで、機能ごとに「完了 / 全チケット数」「今着手可能なチケット」の一覧を提示して選んでもらう

## 前提条件チェックと作業場所（起点 worktree）

- 本スキルは機能の起点 worktree（`../deja-word-worktrees/<機能名>`。命名族・ライフサイクルの共通定義は worktree スキル）を作業場所とする。設計〜計画シリーズから保持されている worktree をそのまま使い、無ければ `scripts/wt-new.sh <機能名> origin/main --branch feature/<機能名>`（worktree スキル。統合ブランチが既存ならそれを checkout する = 再開）で用意する。以降の git 操作・検証・ステータス更新・push はすべて起点 worktree の絶対パス配下で行う（本体の checkout は使わない。チケット worktree の準備・撤去も起点 worktree 内から実行してよい）
- 起点 worktree に `node_modules` が無い場合（設計フェーズを `--no-install` で始めた場合）や設計期間が長く陳腐化している場合は、起点 worktree で `pnpm install` を実行してから始める（メイン自身がマージ後検証で使うため）
- `docs/plan/<機能名>/README.md` が統合ブランチ `feature/<機能名>`（再開時）または origin/main に存在すること。なければ中断し、状態で誘導先を分岐する: 設計＋計画の PR（作業ブランチ `docs/<機能名>-design-plan`）が未マージならそのマージを促し、チケット分割自体が未実施なら ticket-split スキルへ誘導する
- 起点 worktree の working tree が clean であること。main の最新化は `git fetch origin main` で行う（起点 worktree では main を checkout しない。以降の main 参照はすべて `origin/main`）。**main は統合ブランチへ取り込まない**（main との差分は統合 PR のマージ時に解消する）
- ハブの一覧表に「ファイル未作成」のチケットが残っていれば中断し、ticket-split の見直し・追加モードへ誘導する
- 未マージの plan-update PR が無いこと。統合ブランチ作成前ならそのマージを促し、マージ後に統合ブランチを作成する（統合ブランチは `origin/main` 起点のため計画変更が取り込まれる）。統合ブランチ作成後（再開時）に見つかった場合は close を促し、内容は統合ブランチ上の見直し（ticket-split の管轄）で反映し直す
- マージ済み plan-update PR の残存物があれば後片付けする: worktree `../deja-word-worktrees/<機能名>-plan-update` を `scripts/wt-rm.sh <機能名>-plan-update` で撤去し、ブランチを `git branch -D docs/<機能名>-plan-update` で削除する（PR の状態を正とした単純な後片付けで、未マージなら手を付けない）

## オーケストレーション原則

メインセッションは**オーケストレーター専任**。コンテキストを温存するため、以下を厳守する:

- **メインが読むのは plan ハブ＋実装エージェントの報告のみ**。チケット本文・実装コード・diff は読まない（チケット本文は実装エージェントが読む。自己完結は ticket-split が保証済み）。例外は、ステータス更新・実装メモ転記のために開く**チケット冒頭の状態行と「実装メモ」節だけ**（それ以外の本文には目を通さない）
- メインの担当: ready 判定／worktree 準備／委譲／マージ／統合ブランチでの検証／ステータス更新／push・PR 作成（gh）
- **実装エージェントの担当: worktree 内での実装＋検証＋コミット**。push・PR 作成・`docs/plan/` の編集はしない
- **ステータス更新（ハブの一覧表＋チケット冒頭の状態行）はメイン専任**。実装エージェントは `docs/plan/` を編集禁止のため、同時書き込み競合は構造的に起きない。実装メモは実装エージェントの報告をメインが転記する

### ready 集合の判定

`ready = 状態が「未着手」かつ 依存列の全チケットが「完了」（= 統合ブランチへマージ済み）`。ハブの一覧表だけで判定する。

### worktree の扱い

- 置き場: `../deja-word-worktrees/<機能名>-NN-<チケット名>`
- 準備手順: `scripts/wt-new.sh <機能名>-NN-<チケット名> feature/<機能名> --branch feature/<機能名>-NN-<チケット名>`（worktree スキル。起点は統合ブランチ）で準備し、実装エージェントへ委譲する
- 並行度の上限は 3（推奨 2）。worktree ごとの install コストと、マージ待ち行列が長いほどコンフリクト窓が広がることを踏まえる

### 検証の分担

- **worktree 内（実装エージェント）**: `pnpm format`（整形）→ `pnpm format:check` / `pnpm lint` / `pnpm typecheck` / `pnpm test:unit`（env 非依存で並行安全。整形差分は実装コミットに含める）
  - 任意: devman が導入済みの環境では `devman run <worktreeディレクトリ名> <タスク>` 経由で実行してもよい（cd 不要で worktree を名前指定でき、mise 経由のツールチェーンが保証される。`docs/ops/devman.md` 参照）。未導入なら pnpm 直実行のまま
- **`pnpm test:integration` は実装エージェントに実行させない**。共有 DB `dejaword_test` を各テスト前に TRUNCATE するため並行実行できない。メインがマージ後の統合ブランチ（起点 worktree）で**直列**（同時に 1 箇所のみ）に実行する。並行開発中の他機能とも同時に走らせない
- integration テストの有無は**実装エージェントの報告（変更ファイル一覧）で判定する**（メインがチケット本文を読まない原則を守るため）
- **共有 dev DB `dejaword` への migration 適用は、実装エージェントもメインも実装中は行わない**（worktree 間の drift を防ぐ。検証は共有 dev DB 非依存で完結する — unit は DB を使わず、integration は `dejaword_test` へ起動時に migration が自動適用される）。migration を含むチケットがあった場合は、最終報告の手動確認案内に「手動確認で dev サーバを動かす checkout（通常は起点 worktree）で `pnpm db:migrate` を実行する（worktree 切替・drift 時の対処は AGENTS.md「Worktree」節）」を含める

## 計画ドラフト提示と合意（唯一のユーザー確認）

着手前に以下を提示して合意を取る。**合意後は完了または手詰まりまで自律で進め、追加の確認はしない**:

- 統合ブランチ名・委譲手段
- ウェーブ表: どのチケットをどの順・どの並行グループで実装するか（例: wave1 = 01+02 → wave2 = 03+04 → …）。**ウェーブ表は見込みの提示用で、実行時は ready 判定が正**（バリア同期ではなく、マージ完了のたびに ready を再評価して次を投入してよい）
- 並行度・worktree 置き場
- 前回の残骸の扱い: 状態と実体が食い違う「実装中」行（対応するマージ済みコミットが無い行）と、検査用に残した残存 worktree（前回のスキップ・失敗分）について、未着手扱いでやり直すか残存 worktree から続行するかを確認する

## 実装フロー

1. 起点 worktree で統合ブランチ `feature/<機能名>` を `origin/main` から作成する（`git switch -c feature/<機能名> origin/main`。既存なら `git switch feature/<機能名>` = 再開。設計〜計画シリーズから続く場合はここで作業ブランチ `docs/<機能名>-design-plan` から切り替わる）
2. **wave ループ**: ready 集合から並行度上限まで選び、チケットごとに worktree を準備する（「worktree の扱い」どおり、起点は統合ブランチ）→ **メインが統合ブランチ上で**、選んだチケットをまとめて「実装中」に更新し **1 コミット**（チケットに紐づかない運用コミット）→ 実装エージェントを並行起動（worktree は状態更新コミットの前に分岐するが、worktree 側は `docs/plan/` を編集しないため squash マージで衝突しない）
3. 報告を受けたら**チケット番号順に**統合ブランチへ取り込む:
   - `git merge --squash <worktreeブランチ>`（ステージのみでコミットは作られない）→ ハブとチケット冒頭の状態行を「完了＋日付」に編集・実装メモを転記 → まとめて 1 コミット。メッセージ `<機能名>: NN <チケット名>`（PR タイトル規約と同形。**実装差分は 1 チケット = 1 コミット**を保つ。手順 2 のステータス運用コミットはこれとは別勘定）
   - マージ後検証: `pnpm format:check` / `pnpm lint` / `pnpm typecheck` / `pnpm test:unit`。報告に integration テストが含まれていれば `pnpm test:integration` を直列実行
   - 成功したら worktree とブランチを削除する。**チケットブランチの取り込みが必ず squash マージのため `--delete-branch` は使えない**。worktree スキル「撤去」節の `-d` が通らない場合の手順（worktree だけ撤去 →`git branch -D`）に従う
   - コンフリクトはハブの「共有物・競合点」を根拠にメインが解決する（ticket-split が同一ファイル競合を直列依存化済みのため原則小さい）。判断できなければ当該チケットをマージ保留にしてエスカレーションする
4. チケット間の整合調整が必要な場合は追加コミット可。メッセージ `<機能名>: 調整 — <内容>`（どのチケット間の整合かを本文に書く）
5. 全チケット完了後: `pnpm test` を一括実行 → push → `gh pr create`（`feature/<機能名>` → main。タイトル例 `word-quiz: 実装一式（01〜10）`、本文に plan ハブへのリンク＋チケット別サマリ）→ **ハブ PR 列の全行に同一 PR URL を記載**してコミット・push
6. 最終報告: 完了チケット一覧／調整コミット／未実施の手動確認項目（チケット DoD のうち手動確認の項目を列挙）／PR URL／統合 PR マージ後の後片付けの案内（起点 worktree・関連ブランチの一括撤去は本体側から行う — worktree スキルの「機能完了時の一括撤去」）

状態の意味: 「実装中」= worktree 作成時、「完了」= 統合ブランチへのマージ時。PR 列は統合 PR 作成時に一括記載する。

## サブエージェント委譲

[templates/implement-agent-prompt.md](templates/implement-agent-prompt.md) のプレースホルダ（`{機能名}` `{NN}` `{チケット名}` `{worktree絶対パス}`。`{報告ファイル絶対パス}` は herdr ペイン委譲のみ — テンプレ冒頭の注記に従う）を埋めて委譲する。チケット本文の転記はしない（実装エージェントが worktree 内のハブ＋チケットを読む）。

## teams 委譲（--teams）

委譲手段をサブエージェントから agent teams（実験的機能）の teammate に切り替える。**役割分担・ブランチ運用・状態の意味・ウェーブの回し方は一切変わらない**: メイン = リードが ready 判定・マージ・ステータス更新・integration テストの直列実行を担い、teammate が worktree 内で実装・検証・コミットする。

- 前提: agent teams が有効であること（repo の `.claude/settings.json` の `env`〈`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`〉で有効化済み）。無効化されている環境では委譲手段の自動選択（「引数」節）にフォールバックし、その旨を計画ドラフト提示で伝える
- ready チケットごとに teammate を 1 人スポーンする。指示は同じ [templates/implement-agent-prompt.md](templates/implement-agent-prompt.md) を埋めて渡し、担当 worktree の絶対パス配下だけで作業させる（テンプレの禁止事項 — `docs/plan/` 編集・push・PR 作成の禁止 — はそのまま適用）
- 並行度上限は「worktree の扱い」どおり。トークンコストは teammate 数に比例して嵩むため、計画ドラフト提示に含める
- 完了・手詰まりは teammate からの通知・メッセージで受け、報告（変更ファイル一覧・DoD 結果・実装メモ）をメインが回収する。マージして worktree を削除したら当該 teammate は解放する
- 「失敗・中断時の扱い」の共通規則を適用する（「再委譲」= 同一 worktree を担当する teammate への再指示メッセージ）
- teams 特有の制約: セッションは `/resume` で teammate を復元しない。中断・再開は本スキルの既存フロー（ready 判定）がそのまま吸収するため追加の再開処理は不要。teammate の権限確認はリードへバブルアップされるため、承認待ちで停滞しない permission mode で開始する

## herdr ペイン委譲（herdr 環境でのデフォルト。--herdr で明示指定）

委譲先を herdr の独立ペインで動く claude CLI に切り替える。**役割分担・ブランチ運用・状態の意味・ウェーブの回し方は一切変わらない**（委譲手段のみの切替）。実装エージェントごとに実ターミナルペインを持つため、**herdr サイドバーで各エージェントの idle / working / blocked が個別に可視化される**。herdr の操作コマンドは herdr スキル（`HERDR_ENV=1` で利用可）を参照する。

- 前提: `HERDR_ENV=1`（herdr 管理下のペインで実行中）かつ herdr の claude integration 導入済み（`herdr integration status` で `claude: current`）。満たさなければサブエージェント委譲にフォールバックし、その旨を計画ドラフト提示で伝える
- **エージェントのハンドルは名前**（`<機能名>-NN`）。pane_id は保存しない（ペイン ID は不変でないため控えても腐る）。pane_id が必要な操作は直前に `herdr agent get <名前>` で解決する
- 委譲プロンプトは他の委譲手段と同じ [templates/implement-agent-prompt.md](templates/implement-agent-prompt.md) を埋める（herdr ペイン委譲のみ `{報告ファイル絶対パス}` も使う — テンプレ冒頭の注記に従う）
- 起動前の環境条件（trust / permission）・起動・完了待ち・承認待ちループ・承認プロンプトのログ収集と切り分け・報告回収・再委譲・後片付けの運用手順は [references/herdr-delegation.md](references/herdr-delegation.md) に従う
- ペイン＝独立した claude セッションのためトークンコストは並行数に比例して嵩む（並行度上限は「worktree の扱い」どおり。計画ドラフト提示に含める）
- 中断・再開は既存フロー（ready 判定）がそのまま吸収する。再開時に前回の実装ペインが残っていれば `herdr agent list` で状態を確認し、idle なら報告回収から続行、消えていれば計画ドラフト提示の「前回の残骸の扱い」に従う

## 失敗・中断時の扱い

- **DoD 未達・テスト失敗**: 失敗内容（テスト出力の要約）を添えて**同一 worktree で 1 回だけ再委譲**する。再失敗したらそのチケットをスキップし、それに依存する後続もスキップ、独立チケットは続行する。worktree は検査用に残し、最終報告でパスとともにエスカレーションする。スキップの状態記録は「実装中」のまま、実装メモに状況を記入する
- **設計・計画の矛盾を発見**: 実装エージェントは補完実装せず報告で返す。メインは当該チケットを停止し、ticket-split（設計問題なら design-session）への差し戻しを最終報告に含める
- **マージコンフリクト**: 実装フローの手順 3 を参照。解決根拠はハブの「共有物・競合点」
- **コンテキスト肥大**（次 wave の消費量を見積もり、対応後の使用量が 200K トークン前後を超えそうなら中断。見積もりに迷うなら現在使用量 150K を一律閾値とする）: wave 境界が自然なチェックポイント。ハブのステータス更新をコミットして現状を報告し、/clear を促す。再実行が続きを拾う（ready 判定が再開処理を兼ねる）。再開コマンドはそのまま入力できる形（`/ticket-implement <機能名>`）で提示し、それ以外のオプションの解説は聞かれるまで並べない

## 注意事項

- 計画との差分・後続チケットへの申し送りは、実装エージェントの報告からメインがチケットの「実装メモ」に転記する
- DoD の手動確認項目（画面の目視確認など）は自動化せず、最終報告に「未実施」として列挙する
- 実装中に計画の変更（チケットの追加・削除・依存の組み替え・設計改訂）が必要になったら、勝手に書き換えず ticket-split / design-session への差し戻しを提案する
- worktree の掃除の規則は実装フロー内に定義済み（チケット worktree はマージ成功時に削除。起点 worktree は保持し、機能完了時に本体側から一括撤去する）。失敗で残したものは最終報告にパスを明記する

## スキル終了時の改善提案

セッションを閉じる報告（最終報告・PR 作成後の報告・/clear 案内）の際、今回の実行で得た学びから本スキルまたはパイプライン隣接スキルの改善候補があれば提案する。提案するのは、個別機能の事情に閉じない汎用性があり、スキルの成果物品質・効率への効果が大きいものだけ（実行手順に落ちない一般論は提案せず、該当が無ければ省略する）。反映はこのセッションでは行わず、ユーザー合意の上で別途スキル改善の PR として行う。
