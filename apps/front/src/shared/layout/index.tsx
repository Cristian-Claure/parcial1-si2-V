import type { ReactNode } from "react";

export function Container({children}: {children: ReactNode}) {
  return <div>{children}</div>;
}

export function Section({children}: {children: ReactNode}) {
  return <section>{children}</section>;
}
