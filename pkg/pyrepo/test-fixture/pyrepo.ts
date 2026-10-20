import fs from "node:fs/promises";
import path from "node:path";

import { Forwarder } from "@ndn/fw";
import { type Certificate, CertNaming, generateSigningKey } from "@ndn/keychain";
import { NdnsecKeyChain } from "@ndn/ndnsec";
import { FakeNfd } from "@ndn/nfdmgmt/test-fixture/prefix-reg";
import { AltUri, Name, type NameLike } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";
import { assert, Closers } from "@ndn/util";
import { execa, execaSync, type ResultPromise } from "execa";

let pyrepoInstalled: boolean | undefined;

function lvsName(name: Name): string {
  return name.comps.map((comp) => `"${AltUri.ofComponent(comp)}"`).join("/");
}

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
    trustAnchorCert,
    ingestProducerCert,
  }: PyRepo.Options): Promise<PyRepo> {
    name = Name.from(name);
    const confFile = path.join(dir, "repo.conf.json");

    using closers = new Closers();
    const nfd = await FakeNfd.create(fw);
    closers.push(nfd);
    const prelaunchPromises: Array<Promise<unknown>> = [];

    const cfg = {
      repo_config: { repo_name: `${name}`, register_root: true },
      db_config: {
        db_type: "sqlite3",
        sqlite3: { path: path.join(dir, "sqlite3.db") },
      },
      tcp_bulk_insert: { addr: nfd.tcp.host, port: 7376, register_prefix: false },
      logging_config: { level: "INFO" },
    };

    if (trustAnchorCert && ingestProducerCert) {
      const anchorFile = path.join(dir, "ingest-anchor.ndncert");
      const schemaFile = path.join(dir, "ingest-schema.lvs");

      prelaunchPromises.push(fs.writeFile(anchorFile, Encoder.encode(trustAnchorCert.data)));
      prelaunchPromises.push(fs.writeFile(schemaFile, [
        `#root: ${lvsName(CertNaming.toSubjectName(trustAnchorCert.name))}/"KEY"/_/_/_`,
        `#producer: ${lvsName(CertNaming.toSubjectName(ingestProducerCert.name))}/"KEY"/_/_/_ <= #root`,
        `#ingest: ${lvsName(name)}/"ingest"/_ <= #producer`,
      ].join("\n"), { encoding: "utf8" }));

      (cfg as any).ingest_security = {
        trust_anchor: anchorFile,
        trust_schema: schemaFile,
      };
    }

    prelaunchPromises.push(fs.writeFile(confFile, JSON.stringify(cfg, undefined, 2)));

    const keyChain = new NdnsecKeyChain({ home: dir });
    prelaunchPromises.push(generateSigningKey(keyChain, "/operator"));

    await Promise.all(prelaunchPromises);
    const p = execa("ndn-python-repo", ["--config", confFile], {
      stdout: "inherit",
      stderr: "inherit",
      env: {
        NDN_CLIENT_TRANSPORT: `tcp://${nfd.tcp.hostport}`,
        HOME: dir,
      },
    });
    await nfd.waitNFaces(1);
    assert(closers.shift() === nfd); // don't close FakeNfd if this function succeeds
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

    /** Trust anchor certificate for ingest. */
    trustAnchorCert?: Certificate;

    /** Producer certificate for ingest. */
    ingestProducerCert?: Certificate;
  }
}
