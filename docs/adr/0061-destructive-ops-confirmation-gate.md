# ADR-0061: 破壊的 ops スクリプトの確認ゲートを TTY + 対象名確認で統一する

- ステータス: 提案
- 確信度: 低
- 起票日: 2026-07-04

> **注意**: 本 ADR は 2026-07-04 実施のコード監査からの**改善提案**であり、実装済みの決定の事後推定ではない。
> レビューを経て決定し、ステータスを更新すること。

## 背景

sec-review スキル（`.claude/skills/sec-review/SKILL.md` F2）は「破壊的操作に TTY 検査 + 確認入力が無い」を NG と定義し、正例に `scripts/reset-prod-db.ts` を挙げている。しかし実態は非対称になっている:

- `scripts/purge-occurrence.ts` の `--execute` 実行は確認入力なしで即実行される。system の掲載箇所 id を渡せば 1900 語規模のデータと配下・Blob が 1 コマンドで不可逆に消える
- `scripts/purge-blobs.ts` も `--execute` のみで全音源 Blob を削除する
- `docs/ops/purge-occurrence.md` は「CI / 最短経路として残す」と書くが、この判断は ADR 化されておらず F2 と正面から矛盾する

docs 自身が「本番の id はローカルと異なる」と警告しており、id の取り違えで dry-run を挟まずに別の掲載箇所を丸ごと削除できる。また F2 準拠のレビューを走らせるたびに同じ矛盾が再検出される。

## 決定内容

（提案）破壊的 purge 系スクリプトにも `reset-prod-db.ts` と同じ確認ゲートを適用する:

- `--execute` 時は TTY 検査 + 対象名（掲載箇所の location 等）の確認入力を必須にする（`reset-prod-db.ts` の既存実装を移植）
- 非対話実行（CI 等）が必要な場合に備えるなら、明示フラグ（例 `--yes`）を追加し、用途を docs/ops に限定列挙する
- `docs/ops/purge-occurrence.md` の「最短経路」記述を本 ADR 参照に差し替える

## 採らなかった代替案

- **現状維持（非対話 `--execute` の無確認実行）を F2 の適用除外として SKILL.md に明文化する** — レビュー矛盾は解消するが、id 取り違えによる不可逆削除のリスクがそのまま残る。運用上どうしても非対話が必要なら、除外ではなく明示フラグで意図を表明させる方が F2 の趣旨と整合する

## 影響

- purge 系の実行手順に確認入力が 1 ステップ増える（`docs/ops/purge-occurrence.md` / `docs/ops/purge-blobs.md` の更新が必要）
- `.claude/skills/sec-review/SKILL.md` F2 の例外注記が不要になり、レビューの再検出が止まる

## 根拠（コード・コミット・文書参照）

- `scripts/purge-occurrence.ts:47-63`（`runWithId` が確認なしで実行）
- `scripts/purge-blobs.ts:28`（`--execute` のみで削除）
- `scripts/reset-prod-db.ts`（TTY + 確認入力の既存正例）
- `.claude/skills/sec-review/SKILL.md` F2、`docs/ops/purge-occurrence.md:21`

## 人間への確認質問

- 非対話 `--execute` を前提にした運用（CI・自動化）は現在実在するか？無ければ確認ゲート必須化で問題ないか？
- 確認入力の照合対象は「掲載箇所名（location）」でよいか（reset-prod-db は DB 名を照合している）？
