import { SYSTEM_USER_ID } from "@/lib/system-user";

export function isSystemOwned(ownerId: string | undefined, isCurrentUserSystem: boolean): boolean {
  return ownerId === SYSTEM_USER_ID && !isCurrentUserSystem;
}
