import type { UrlObject } from "node:url";
// @ts-expect-error typing unavailable
import urlFormat from "url-format-lax";
// @ts-expect-error typing unavailable
import urlParse from "url-parse-lax";

/** Combine host and port into a network address of the form "host:port". */
export function joinHostPort(hostname: string, port: number): string {
  return urlFormat({ hostname, port });
}

/** Split a network address of the form "host:port" into host and port. */
export function splitHostPort(hostport: string): { host: string; port?: number } {
  const { hostname, port } = urlParse(hostport) as UrlObject;
  return {
    host: hostname ?? "",
    port: port ? Number(port) : undefined,
  };
}
