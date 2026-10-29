import { afterEach, describe, expect, it, vi } from "vitest";
import { toast, useToastStore } from "./toastStore";

describe("toasts (P3)", () => {
  afterEach(() => { vi.useRealTimers(); useToastStore.setState({ toasts: [] }); });

  it("se cierran solos y conservan como máximo 3", () => {
    vi.useFakeTimers();
    for (const text of ["uno", "dos", "tres", "cuatro"]) toast(text);
    expect(useToastStore.getState().toasts.map((item) => item.message)).toEqual(["dos", "tres", "cuatro"]);
    vi.advanceTimersByTime(5000);
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});
