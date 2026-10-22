import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, variant = "default", ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "outline" | "solid" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        variant === "default" && "bg-surface-3 text-muted-foreground",
        variant === "outline" && "border border-border text-muted-foreground",
        variant === "solid" && "bg-foreground text-background",
        className,
      )}
      {...props}
    />
  );
}
