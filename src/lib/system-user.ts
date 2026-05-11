export const SYSTEM_USER_ID = "system";

export function scopedOwnerIds(userId: string): string[] {
  return [SYSTEM_USER_ID, userId];
}
