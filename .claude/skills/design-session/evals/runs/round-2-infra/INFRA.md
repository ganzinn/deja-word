# round-2 初回試行: INFRA 失敗（ラウンド非消費）

- s1: 完走（denials 0）
- s2: シナリオ checks 全 pass だが permission_denials 3 件 → 凍結定義により INFRA。
  拒否内容: (1) `kill %1`（ジョブ制御） (2) heredoc + コマンド置換の複数行 `git commit` (3) `&&` 連結内の `rm`。
  いずれも allowlist（acceptEdits + allowedTools prefix 方式）がツールの標準操作を拒否したもので、skill 本文の欠陥ではない。
- s3: 未実行（s2 の失敗で中断）

対処: executor を bypassPermissions + disallowedTools に変更（README の preflight 検証記録 #4 参照）。
round-2 は修正後ハーネスで最初から再実行する。
