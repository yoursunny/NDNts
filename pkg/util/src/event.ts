/**
 * Keep records on whether an event listener has been added.
 * @param target - EventTarget to override.
 * @returns Map from event type to whether listeners may exist.
 *
 * @remarks
 * This may allow `EventTarget` subclass to skip certain event generation code paths.
 * Tracking is imprecise: it does not consider `options.once` and `options.signal`.
 */
export function trackEventListener(target: EventTarget): Record<string, boolean> {
  const m = new Map<string, [number, WeakSet<any>]>();

  const { addEventListener, removeEventListener } = target;
  Object.defineProperties(target, {
    addEventListener: {
      configurable: true,
      value(this: EventTarget, ...args: Parameters<EventTarget["addEventListener"]>): void {
        const [evt, fn] = args;
        let record = m.get(evt);
        if (!record) {
          m.set(evt, record = [0, new WeakSet()]);
        }
        if (!record[1].has(fn)) {
          record[1].add(fn);
          ++record[0];
        }

        addEventListener.call(this, ...args);
      },
    },
    removeEventListener: {
      configurable: true,
      value(this: EventTarget, ...args: Parameters<EventTarget["removeEventListener"]>): void {
        removeEventListener.call(this, ...args);

        const [evt, fn] = args;
        const record = m.get(evt);
        if (!record) {
          return;
        }
        if (record[1].delete(fn)) {
          --record[0];
        }
        if (record[0] === 0) {
          m.delete(evt);
        }
      },
    },
  });

  return new Proxy({}, {
    get(target, prop) {
      void target;
      return m.has(prop as string);
    },
  });
}
