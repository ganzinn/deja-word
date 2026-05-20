import { Trash2Icon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

type ArrayRemoveButtonProps = {
  onClick: () => void;
  ariaLabel: string;
  icon?: "trash" | "x";
  className?: string;
};

export function ArrayRemoveButton({
  onClick,
  ariaLabel,
  icon = "trash",
  className,
}: ArrayRemoveButtonProps) {
  const Icon = icon === "x" ? XIcon : Trash2Icon;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={ariaLabel}
      className={className}
      onClick={onClick}
    >
      <Icon />
    </Button>
  );
}
