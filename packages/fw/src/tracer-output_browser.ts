import type { Tracer } from "./tracer";

export function makeTracerOutput(): Tracer.Output {
  return globalThis.console;
}
