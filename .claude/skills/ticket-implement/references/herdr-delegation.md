# herdr ペイン委譲の運用手順

[SKILL.md](../SKILL.md) の「herdr ペイン委譲」節から参照される運用詳細。前提条件・フォールバック・エージェント名のハンドル規約・並行度とコスト・中断再開の扱いは SKILL.md 側に定義がある。

## trust と permission（起動前の環境条件）

- **worktree 置き場（`../deja-word-worktrees/`）が Claude Code の trust 済みであること**。trust 済みディレクトリの配下では子ディレクトリに trust ダイアログは出ないが、未 trust だと**各ペインが起動直後に trust ダイアログで停止する**。判定: `~/.claude.json` の `projects` に worktree 置き場（またはその祖先）のエントリがあり `hasTrustDialogAccepted: true`。判定ワンライナー:

  ```sh
  jq -r '.projects | to_entries[] | select(.value.hasTrustDialogAccepted == true) | .key' ~/.claude.json | grep -F "<worktree置き場の絶対パス>"
  # 何も出力されなければ未 trust
  ```

  未 trust なら計画ドラフト提示で「worktree 置き場で一度 `claude` を起動して trust を承認 → 終了」をユーザーに依頼する
- **trust ダイアログ・permission プロンプトの代理承認（Enter や選択キーの送信）は絶対にしない**。これらは人間の承認ゲートであり、オーケストレーターが迂回してはならない。検知したら通知してユーザーの操作を待つ。本番リソースに触れるコマンドの `ask` ルール（ADR-0095）も同じ扱いで、代理承認せずユーザーに判断を仰ぐ（実装チケットで踏むなら、そもそもスコープ外の操作を疑う）
- 定型コマンドの許可は、追跡対象の `.claude/settings.json`（`permissions.allow`。worktree には git 経由で入る）で大半が賄われる。`scripts/wt-env.sh` が配る `.claude/settings.local.json` は端末ごとの追加分（「don't ask again」の受け皿）で、有用なルールは追跡対象側へ昇格させる。起動フラグ（下記起動コマンドの `--add-dir` / `--allowedTools`）はそれで消えない分だけを最小限補う — 内訳は「承認プロンプトの切り分け」の表を参照

## 起動

ready チケットごとに、テンプレを埋めたプロンプトをファイルに書き出し（scratchpad 等 **worktree の外**。クォート事故防止のため必ずファイル経由）、**エージェント専用のタブ**で claude を起動する（1 エージェント = 1 タブ。ペイン分割はしない）:

```sh
herdr tab create --label <機能名>-NN --no-focus
# 返却 JSON の result.tab.tab_id と result.root_pane.pane_id を読む
herdr agent start <機能名>-NN --cwd <worktree絶対パス> --tab <tab_id> --no-focus \
  -- claude "$(cat <プロンプトファイル>)" \
     --permission-mode acceptEdits \
     --add-dir <worktree置き場の絶対パス> \
     --allowedTools "Bash(pnpm *)" "Bash(git *)"
herdr pane close <root_paneのpane_id>  # agent start はタブの root ペインを分割するため、元のシェルを閉じてエージェント単独のフルサイズ表示にする
```

- **プロンプト位置引数は必ずフラグより前に置く**。`--allowedTools` は可変長のため、後置した位置引数を許可リストとして飲み込み、プロンプト未実行の空セッションが起動する
- devman 経由で検証させる場合は `"Bash(devman run *)"` を許可リストに追加する（`devman *` にはしない — `devman server` はリポジトリにつき 1 つのサーバ仕様のため、実装エージェントが起動するとユーザーの dev サーバを停止させてしまう）
- 同名エージェントが残っていると `agent_name_taken` で起動に失敗する。起動前（特に再開時）に `herdr agent list` で確認し、残骸ペインは回収・close してから起動する
- 起動確認: `herdr agent wait <名前> --status working --timeout 90000` で着手を確認する（以後の idle 待ちが「完了」を意味するようになる）。タイムアウトしたら `herdr agent read <名前> --source visible` で停止原因（trust ダイアログ等）を確認する

## 完了待ち

**`--status done` は使わない**（done は UI の attention state で、CLI の完了待ちには herdr がエラーで拒否する）。完了シグナルは idle（既に idle なら wait は即時返却するため、完了を取り逃すレースは無い）:

```sh
herdr agent wait <名前> --status idle --timeout 570000
```

- wait の `--timeout` は 570000 を上限にし、実行側（Bash ツール）の timeout は 600000 を指定する（デフォルト 120 秒では wait より先に切られ、600 秒を超える待ちは背景化されて exit 1 の「失敗」通知になる）
- **wait の返却は 3 形（既に目的の状態 → JSON で即時返却／遷移を検知 → JSON／タイムアウト → 素のテキスト `timed out waiting for agent status change`）あり、どれも「エラー」ではない**。タイムアウトは「まだ達していない」だけの正常な結果（エラー扱いして手を止めない）
- タイムアウトしたら `herdr agent get <名前>` で現状を確認して分岐する: working → idle 待ちを再実行 / blocked → 下の「承認待ちループ」へ
- 複数ペイン並行時はチケット番号順に順次待てばよい（マージ順と一致する）

### 承認待ちループ（blocked を検知したら）

blocked（承認プロンプトで停止）を検知したら、**idle ではなく `--status working` を待つ**。承認された瞬間に working へ遷移するため、即座に完了待ちへ復帰できる:

1. `herdr agent read <名前> --source visible` でプロンプト内容を確認する（判断できない内容ならエスカレーション）。visible は描画前の古い画面を返すことがあるため、blocked かどうかは `herdr agent get` のステータスを正とする
2. `herdr notification show "<機能名>-NN が承認待ち" --sound request` でユーザーに通知する（代理承認の禁止は「trust と permission」節のとおり）
3. `herdr agent wait <名前> --status working --timeout 570000` で承認を待つ。**通知だけしてターンを終えない** — 待ちが走っていないと、承認されても再開の契機が無い
4. working が返ったら idle 待ちに戻る。タイムアウトしたら `herdr agent get` で再確認し、blocked のままなら 3 に戻る（再通知は不要）

承認の発生回数と対象コマンドは、worktree 内 `tmp/permission-requests.log`（下記「承認プロンプトのログ収集」）を一次情報として最終報告に含める。

### 承認プロンプトのログ収集（PermissionRequest hook）

repo 管理の `.claude/settings.json` に `PermissionRequest` hook が定義済み（worktree にも git 経由で入る）。承認プロンプトが必要になるたびに 1 行（`tool_input` 込み）が worktree 内 `tmp/permission-requests.log` に追記される。**許可リスト一致で自動許可された場合は発火しない**ため、記録されるのは実際に停止したものだけ（対話セッション専用 — headless `claude -p` では発火しない）。オーケストレーターは worktree 削除前にログを直接読んでよく、記録された `tool_input` は許可リスト・テンプレ禁止事項の継続改善の材料にする。

### 承認プロンプトの切り分け

判定の決定打は、プロンプトに「don't ask again」「allow all ... during this session」といった**恒久化の選択肢が出るかどうか**。出るものは許可リストで恒久化できる。出ないもの（Yes / No の 2 択のみ）は原理的に毎回聞かれるため、上記の承認待ちループが正規の対処になる。

| プロンプトの種類 | 消せるか | 対策 |
| --- | --- | --- |
| `This command requires approval`（許可リストに無い定型コマンド） | ○ | 追跡対象 `.claude/settings.json` の `permissions.allow`＋`--allowedTools` |
| 同上だが**環境変数の前置き**が原因（`PORT=3100 ... pnpm dev` は `Bash(pnpm dev *)` に不一致） | ○ | env 名から始まるルール（`Bash(PORT=* pnpm *)` 等。`*` はスペースをまたいで一致）を追跡対象 settings.json に追加 |
| `Compound command contains cd with write operation`（`cd`＋書き込みの複合コマンド。許可リストでは消せない） | ○（発生源で） | テンプレで `cd` 前置きを禁止（cwd は最初から worktree） |
| worktree 外への書き込み（報告ファイル） | ○ | `--add-dir <worktree置き場>` |
| worktree 外の一時ファイルの読み書き（scratchpad・`/tmp` 等） | ○（発生源で） | テンプレで一時ファイルを worktree 内の `tmp/` に限定する（scratchpad・`/tmp` を使わせない） |
| バックグラウンド演算子 `&`（許可リストでは消せない） | ○（発生源で） | テンプレで `&` を禁止し Bash ツールの `run_in_background: true` を使わせる（リダイレクト・`mkdir -p tmp` も不要になる）。**実証済み** |
| `Contains expansion`（コマンド置換 `$( )`）/ `Contains simple_expansion`（変数展開 `$VAR`）（許可リストでは消せない） | ○（発生源で） | テンプレで `for` ＋ `$( )` の 1 コマンドまとめを禁止し、1 対象ずつ／複数引数を受けるコマンド（`git show -s --format=... <sha> <sha>`）／定型スクリプト（`pnpm e2e:wait-dev` `pnpm e2e:stop-dev` `pnpm docs:diff-images`）に寄せる |
| 未許可コマンド（`md5` / `magick` / `pkill` / `lsof` / `xargs` 等）を含む複合コマンド | ○ | 単発なら許可リスト、定型なら上のスクリプトへ寄せる（`pnpm` 経由なので `Bash(pnpm *)` で通る） |
| 本番リソースに触れるコマンドの `ask` ルール（ADR-0095） | ✗（意図的） | 実装チケットでは踏まないのが正。踏んだら代理承認せず通知し、スコープ外の操作でないか確認する |

`&` と `$( )` は、E2E・撮影のように dev サーバの起動・待ち合わせ・停止を伴う作業で踏みやすい（issue #244 の実測 7 件の大半がこれ）。上記の対処を委譲プロンプトに含めれば承認 0 回で完走できる想定で運用し、実測は `tmp/permission-requests.log` で確認する。

worktree 内のプロンプトで「don't ask again」を選ぶと、ルールは worktree を main checkout に解決した上で**本体リポジトリの `.claude/settings.local.json` に保存され、次回以降の全セッション（worktree 含む）に有効**になる。ただし停止したコマンドそのままの断片的なルール（`Bash(break)` 等）が残ることがあるため、実装セッション後に本体の許可リストを見直し、無意味なルールは削除し、**定型として残す価値があるものは追跡対象 `.claude/settings.json` の `permissions.allow` へ昇格させる**（local 側はクローンにも他端末にも共有されない）。

## 報告回収・再委譲・後片付け

- **報告回収**: 報告はテンプレの追加指示で `<worktree置き場>/<機能名>-NN-<チケット名>.report.md`（worktree と同じ置き場、リポジトリ外）に書き出させ、メインはそれを読む。idle になっても report ファイルが無い・不完全な場合は `herdr agent read <名前> --source recent-unwrapped --lines 200` で最終メッセージを確認する（recent バッファは直近の描画分しか残らないことがあるため、report ファイルが一次情報）
- **再委譲**（「失敗・中断時の扱い」の共通規則を適用）: `herdr agent get <名前>` で pane_id を解決し、`herdr pane run <pane_id> "<指示>"` で同一ペインの claude に追加指示を送る（1 行で書き、詳細は失敗内容を書いたファイルのパスを添えて参照させる）。ペインが消えていた場合のみ同一 worktree で claude を起動し直す
- **後片付け**: 実装フローで worktree を削除する段になったら（マージ・検証成功後）、`herdr agent get <名前>` で解決した pane_id を `herdr pane close` で閉じてから worktree・report ファイル・不要になったローカルブランチを削除する（タブは最後のペインが閉じると自動で閉じるため追加の掃除は不要）。失敗で worktree を残す場合はペインも検査用に残し、最終報告に**エージェント名**とパスを明記する（pane_id は変わりうるため名前で示す）
