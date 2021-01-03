import type { Tracer } from "./tracer";

/* istanbul ignore next */
export function makeTracerOutput(): Tracer.Output {
  return new console.Console(process.stderr);
}
