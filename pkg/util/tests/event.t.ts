import { expect, test, vi } from "vitest";

import { trackEventListener } from "..";

class TrackedEventTarget extends EventTarget {
  public readonly maybeHaveEventListener = trackEventListener(this);
}

test("trackEventListener", () => {
  const target = new TrackedEventTarget();
  expect(target.maybeHaveEventListener.a).toBeFalsy();

  const listenerA: EventListener = vi.fn<(evt: Event) => void>();
  const listenerB: EventListener = vi.fn<(evt: Event) => void>();
  const listenerC: EventListenerObject = {
    handleEvent: vi.fn<(evt: Event) => void>(),
  };

  target.addEventListener("a", listenerA);
  expect(target.maybeHaveEventListener.a).toBeTruthy();

  target.addEventListener("b", listenerB, { once: true });
  expect(target.maybeHaveEventListener.b).toBeTruthy();

  const abortC = new AbortController();
  target.addEventListener("c", listenerC, { signal: abortC.signal });
  expect(target.maybeHaveEventListener.c).toBeTruthy();

  target.dispatchEvent(new Event("a"));
  expect(listenerA).toHaveBeenCalledOnce();
  target.dispatchEvent(new Event("b"));
  expect(listenerB).toHaveBeenCalledOnce();
  target.dispatchEvent(new Event("c"));
  expect(listenerC.handleEvent).toHaveBeenCalledOnce();

  target.removeEventListener("a", listenerA);
  expect(target.maybeHaveEventListener.a).toBeFalsy();
  expect(target.maybeHaveEventListener.b).toBeTruthy();
  abortC.abort();
  // AbortSignal may call removeEventListener so that target.maybeHaveEventListener.c is false

  target.dispatchEvent(new Event("a"));
  expect(listenerA).toHaveBeenCalledOnce();
  target.dispatchEvent(new Event("b"));
  expect(listenerB).toHaveBeenCalledOnce();
  target.dispatchEvent(new Event("c"));
  expect(listenerC.handleEvent).toHaveBeenCalledOnce();
});
