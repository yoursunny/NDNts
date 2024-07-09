import { expect, test, vi } from "vitest";

import { trackEventListener } from "..";

class TrackedEventTarget extends EventTarget {
  public readonly maybeHaveEventListener = trackEventListener(this);
}

test("trackEventListener", () => {
  const target = new TrackedEventTarget();
  expect(target.maybeHaveEventListener.a).toBeFalsy();

  const listener = vi.fn<(evt: Event) => void>();
  target.addEventListener("a", listener);
  expect(target.maybeHaveEventListener.a).toBeTruthy();

  target.dispatchEvent(new Event("a"));
  expect(listener).toHaveBeenCalledOnce();

  target.removeEventListener("a", listener);
  expect(target.maybeHaveEventListener.a).toBeTruthy();

  target.dispatchEvent(new Event("a"));
  expect(listener).toHaveBeenCalledOnce();
});
