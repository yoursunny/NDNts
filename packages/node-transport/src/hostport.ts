// @ts-expect-error
import urlFormat from "url-format-lax";

export function joinHostPort(hostname: string, port: number): string {
  return urlFormat({ hostname, port });
}
