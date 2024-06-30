import fs from "node:fs/promises";
import path from "node:path";

import { Forwarder } from "@ndn/fw";
import { generateSigningKey } from "@ndn/keychain";
import { NdnsecKeyChain } from "@ndn/ndnsec";
import { FakeNfd } from "@ndn/nfdmgmt/test-fixture/prefix-reg";
import { Name, type NameLike } from "@ndn/packet";
import { assert, Closers } from "@ndn/util";
import { execa, execaSync, type ResultPromise } from "execa";
import { long2ip } from "netmask";

let pyrepoInstalled: boolean | undefined;

/** Create a `ndn-python-repo` process and attach to a logical forwarder. */
export class PyRepo implements AsyncDisposable {
  /** Whether `ndn-python-repo` program is installed. */
  public static get supported(): boolean {
    return NdnsecKeyChain.supported && (
      pyrepoInstalled ??= execaSync("ndn-python-repo", ["--version"], { reject: false }).exitCode === 0
    );
  }

  public static async create(name: NameLike, {
    dir,
    fw = Forwarder.getDefault(),
  }: PyRepo.Options): Promise<PyRepo> {
    name = Name.from(name);
    const dbFile = path.join(dir, "sqlite3.db");
    const confFile = path.join(dir, "repo.conf.json");
    const ip = long2ip(0x7F790000 | Math.trunc(0xFFFF * Math.random())); // 127.121.x.x

    using closers = new Closers();
    const nfd = await new FakeNfd(fw).open();
    closers.push(nfd);

    const cfg = {
      repo_config: { repo_name: `${name}`, register_root: true },
      db_config: {
        db_type: "sqlite3",
        sqlite3: { path: dbFile },
      },
      tcp_bulk_insert: { addr: ip, port: 7376, register_prefix: false },
      logging_config: { level: "INFO" },
    };
    await fs.writeFile(confFile, JSON.stringify(cfg, undefined, 2));

    const keyChain = new NdnsecKeyChain({ home: dir });
    await generateSigningKey(keyChain, "/operator");

    const p = execa("ndn-python-repo", ["--config", confFile], {
      stdout: "inherit",
      stderr: "inherit",
      env: {
        NDN_CLIENT_TRANSPORT: `tcp://${ip}:${nfd.port}`,
        HOME: dir,
      },
    });
    await nfd.waitNFaces(1);
    assert(closers.shift() === nfd);
    return new PyRepo(p, nfd);
  }

  private constructor(
      private readonly p: ResultPromise,
      private readonly nfd: FakeNfd,
  ) {}

  public async [Symbol.asyncDispose](): Promise<void> {
    this.p.kill("SIGQUIT");
    await Promise.allSettled([
      this.p,
      this.nfd[Symbol.asyncDispose](),
    ]);
  }
}
export namespace PyRepo {
  export interface Options {
    /** Storage directory. */
    dir: string;

    /** Logical forwarder to attach ndn-python-repo. */
    fw?: Forwarder;
  }
}
