import { SYSTEM_USER_ID } from "@/lib/system-user";

/** preset トグルの判定に必要な occurrence 行の最小形（occurrenceId で preset と突き合わせ、ownerId で所有を判定） */
type PresetRow = { occurrenceId?: string; ownerId: string };

/** トグルが押されたときに取るべき動作 */
export type PresetToggleAction =
  | { kind: "add" }
  | { kind: "remove"; index: number }
  | { kind: "noop" };

export type PresetResolution = {
  /** トグルを ON 表示にするか（= この preset に対応する行が既にある） */
  pressed: boolean;
  /** トグルを disabled にするか（= このユーザーはこの行を外せない） */
  systemLocked: boolean;
  /** 押されたときの動作 */
  action: PresetToggleAction;
};

/**
 * 現在の occurrence 行の状態から、ある preset トグルの「表示状態」と「押下時の動作」を導出する。
 *
 * 境界:
 * - 対応行なし → 未押下・add
 * - 対応行あり & system 所有(ownerId === SYSTEM_USER_ID) & 一般ユーザー → ロック・noop
 *   （DB から再読込した共通行は一般ユーザーが外せない）
 * - それ以外（自分の行 / 追加直後の ownerId 空 / system ユーザー）→ remove 可
 */
export function resolvePreset(
  rows: readonly PresetRow[],
  presetId: string,
  isCurrentUserSystem: boolean,
): PresetResolution {
  const index = rows.findIndex((r) => r.occurrenceId === presetId);
  if (index < 0) {
    return { pressed: false, systemLocked: false, action: { kind: "add" } };
  }
  const systemLocked = rows[index].ownerId === SYSTEM_USER_ID && !isCurrentUserSystem;
  return {
    pressed: true,
    systemLocked,
    action: systemLocked ? { kind: "noop" } : { kind: "remove", index },
  };
}
