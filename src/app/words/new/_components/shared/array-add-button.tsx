import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

type ArrayAddButtonProps = {
  label: string;
  onClick: () => void;
  variant?: "outline" | "ghost";
  className?: string;
};

export function ArrayAddButton({
  label,
  onClick,
  variant = "outline",
  className,
}: ArrayAddButtonProps) {
  return (
    <Button type="button" variant={variant} size="sm" className={className} onClick={onClick}>
      <PlusIcon />
      {label}
    </Button>
  );
}
