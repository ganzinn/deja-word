import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function SystemBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn("text-[10px]", className)}>
      共通
    </Badge>
  );
}
