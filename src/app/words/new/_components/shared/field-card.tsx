import type { ReactNode } from "react";

import { ArrayRemoveButton } from "./array-remove-button";
import { SystemBadge } from "./system-badge";

type FieldCardProps = {
  title: ReactNode;
  isSystemOwned: boolean;
  onRemove: () => void;
  removeAriaLabel: string;
  children: ReactNode;
};

export function FieldCard({
  title,
  isSystemOwned,
  onRemove,
  removeAriaLabel,
  children,
}: FieldCardProps) {
  return (
    <div className="border-border bg-card/50 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs font-medium">{title}</span>
          {isSystemOwned ? <SystemBadge /> : null}
        </div>
        {isSystemOwned ? null : (
          <ArrayRemoveButton onClick={onRemove} ariaLabel={removeAriaLabel} />
        )}
      </div>
      {children}
    </div>
  );
}
