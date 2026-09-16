import { useState } from "react";

export function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial);

  return {
    open,
    show: () => setOpen(true),
    hide: () => setOpen(false),
    toggle: () => setOpen((value) => !value),
  };
}
