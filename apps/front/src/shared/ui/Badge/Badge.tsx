import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  tone?: "gold" | "success" | "danger" | "info";
}

export function Badge({children, tone = "gold"}: Props) {
  return (
    <span data-tone={tone}>
      {children}
    </span>
  );
}
