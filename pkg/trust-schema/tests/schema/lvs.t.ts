import { Name, type NameLike } from "@ndn/packet";
import { expect, test } from "vitest";

import { TrustSchemaPolicy, versec } from "../..";

test("pattern", () => {
  const policy = versec.load(`
    #p0: /"ndn"/user/"KEY"/key_id

    #ndn: "ndn"
    #key: /"KEY"/key_id
    #p1: #ndn/user/#key

    #p2: /a/"b"/a/d
    #p3: /a/"b"/a/d & {c: a}
  `);

  const expectMatches = (id: string, name: NameLike, matchCount: number) => {
    const p = policy.getPattern(id);
    expect(Array.from(p.match(Name.from(name)))).toHaveLength(matchCount);
  };

  expectMatches("#p0", "/ndn/xinyu/KEY/1", 1);
  expectMatches("#p0", "/ndn/admin/KEY/65c66a2a", 1);
  expectMatches("#p0", "/ndn/xinyu/key/1", 0);
  expectMatches("#p0", "/ndn/xinyu/KEY/1/self/1", 0);

  expectMatches("#p1", "/ndn/xinyu/KEY/1", 1);
  expectMatches("#p1", "/ndn/admin/KEY/65c66a2a", 1);
  expectMatches("#p1", "/ndn/xinyu/key/1", 0);
  expectMatches("#p1", "/ndn/xinyu/KEY/1/self/1", 0);

  expectMatches("#p2", "/x/b/x/ddd", 1);
  expectMatches("#p2", "/x/b/y/ddd", 0);
  expectMatches("#p3", "/x/b/x/ddd", 1);
  expectMatches("#p3", "/x/b/y/ddd", 0);
});

test("example", () => {
  const policy = versec.load(`
    // taken from python-ndn LVS example

    // Site prefix is "/a/blog"
    #site: "a"/"blog"
    // The trust anchor name is of pattern /a/blog/KEY/<key-id>/<issuer>/<cert-id>
    #root: #site/#KEY
    // Posts are signed by some author's key
    #article: #site/"article"/category/year/month <= #author
    // An author's key is signed by an admin's key
    #author: #site/role/author/#KEY & { role: "author" } <= #admin
    // An admin's key is signed by the root key
    #admin: #site/"admin"/admin/#KEY <= #root

    #KEY: "KEY"/_/_/_
  `);
  expect(versec.load(versec.print(policy))).toBeInstanceOf(TrustSchemaPolicy);

  expect(policy.canSign(new Name("/a/blog/article/math/2022/03"), new Name("/a/blog/author/xinyu/KEY/1/admin/1"))).toBeTruthy();
  expect(policy.canSign(new Name("/a/blog/author/xinyu/KEY/1/admin/1"), new Name("/a/blog/admin/admin/KEY/1/root/1"))).toBeTruthy();
  expect(policy.canSign(new Name("/a/blog/author/xinyu/KEY/1/admin/1"), new Name("/a/blog/KEY/1/self/1"))).toBeFalsy();
});
