import { expect, test } from "vitest";

import { joinHostPort, splitHostPort } from "..";

test("joinHostPort", () => {
  expect(joinHostPort("localhost", 80)).toBe("localhost:80");
  expect(joinHostPort("127.0.0.1", 80)).toBe("127.0.0.1:80");
  expect(joinHostPort("::1", 80)).toBe("[::1]:80");
});

test("splitHostPort", () => {
  expect(splitHostPort("localhost")).toEqual({ host: "localhost", port: undefined });
  expect(splitHostPort("127.0.0.1")).toEqual({ host: "127.0.0.1", port: undefined });
  expect(splitHostPort("[::1]")).toEqual({ host: "::1", port: undefined });
  expect(splitHostPort("localhost:80")).toEqual({ host: "localhost", port: 80 });
  expect(splitHostPort("127.0.0.1:80")).toEqual({ host: "127.0.0.1", port: 80 });
  expect(splitHostPort("[::1]:80")).toEqual({ host: "::1", port: 80 });
});
