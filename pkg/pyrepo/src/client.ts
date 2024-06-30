import { consume, ConsumerOptions } from "@ndn/endpoint";
import { Segment } from "@ndn/naming-convention2";
import { type Data, digestSigning, Interest, Name, SignedInterestPolicy } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";
import { assert, delay, randomJitter, sha256, toHex } from "@ndn/util";

import { CommandParam, CommandRes, DeleteVerb, InsertVerb, ObjectParam, StatQuery, type Verb } from "./packet";
import { PrpsPublisher } from "./prps/mod";

const checkSIP = new SignedInterestPolicy(SignedInterestPolicy.Nonce());

/** Client to interact with ndn-python-repo. */
export class PyRepoClient implements Disposable {
  constructor(opts: PyRepoClient.Options) {
    this.repoPrefix = opts.repoPrefix;
    this.publisher = new PrpsPublisher(opts);

    const { fw } = this.cpOpts;
    this.fwHint = this.publisher.pubFwHint ?? this.publisher.pubPrefix;
    fw.nodeNames.push(this.fwHint);

    this.combineRange = opts.combineRange ?? false;
    this.commandLengthLimit = opts.commandLengthLimit ?? 6144;
    this.commandTimeout = opts.commandTimeout ?? 60000;
    this.checkInterval = randomJitter(0.1, opts.checkInterval ?? 1000);
    this.checkOpts = {
      ...ConsumerOptions.exact(this.cpOpts),
      fw,
      retx: 0,
    };
  }

  public readonly repoPrefix: Name;
  private readonly publisher: PrpsPublisher;
  private readonly fwHint: Name;
  private readonly combineRange: boolean;
  private readonly commandLengthLimit: number;
  private readonly commandTimeout: number;
  private readonly checkInterval: () => number;
  private readonly checkOpts: ConsumerOptions;

  public get cpOpts() {
    return this.publisher.cpOpts;
  }

  public [Symbol.dispose](): void {
    const { fw } = this.cpOpts;
    const nodeNameIndex = fw.nodeNames.findIndex((nodeName) => nodeName.equals(this.fwHint));
    if (nodeNameIndex >= 0) {
      fw.nodeNames.splice(nodeNameIndex, 1);
    }

    this.publisher[Symbol.dispose]();
  }

  /** Insert packet(s). */
  public insert(
      objs: Name | PyRepoClient.ObjectParam | readonly PyRepoClient.ObjectParam[],
  ): Promise<void> {
    return this.submit(InsertVerb, objs);
  }

  /** Delete packet(s). */
  public delete(
      objs: Name | PyRepoClient.ObjectParam | readonly PyRepoClient.ObjectParam[],
  ): Promise<void> {
    return this.submit(DeleteVerb, objs);
  }

  private async submit(
      verb: Verb,
      objs: Name | PyRepoClient.ObjectParam | readonly PyRepoClient.ObjectParam[],
  ): Promise<void> {
    objs = Array.isArray(objs) ? objs : [objs instanceof Name ? { name: objs } : objs];
    if (objs.length === 0) {
      return;
    }

    if (this.combineRange) {
      objs = combineRange(objs);
    }

    const objParams = objs.map((obj) => makeObjectParam(obj, this.fwHint));
    const sizes = objParams.map((p) => Encoder.encode(p).length);
    const { commandLengthLimit } = this;
    await Promise.all(Array.from((function*() {
      let first = 0;
      let sum = 0;
      for (const [i, size_] of sizes.entries()) {
        const size = size_;
        assert(size < commandLengthLimit);
        if (sum + size > commandLengthLimit) {
          yield [first, i];
          first = i;
          sum = 0;
        }
        sum += size;
      }
      if (first < sizes.length) {
        yield [first, sizes.length];
      }
    })(), ([first, last]) => this.request(verb, objParams.slice(first, last))));
  }

  private async request(verb: Verb, objs: readonly ObjectParam[]): Promise<void> {
    const p = new CommandParam();
    p.objectParams.push(...objs);
    const request = Encoder.encode(p);

    await this.publisher.publish(this.repoPrefix.append(verb.action), request);
    const checkParam = new StatQuery();
    checkParam.requestDigest = await sha256(request);
    const requestDigestHex = toHex(checkParam.requestDigest);

    const deadline = Date.now() + this.commandTimeout;
    while (Date.now() < deadline) {
      await delay(this.checkInterval());

      const checkInterest = new Interest();
      checkInterest.name = this.repoPrefix.append(verb.check);
      checkInterest.appParameters = Encoder.encode(checkParam);
      checkSIP.update(checkInterest, this);
      await digestSigning.sign(checkInterest);

      let checkData: Data;
      try {
        checkData = await consume(checkInterest, {
          ...this.checkOpts,
          describe: `pyrepo-check(${this.repoPrefix} ${requestDigestHex})`,
        });
      } catch {
        continue;
      }

      const res = Decoder.decode(checkData.content, CommandRes);
      if (res.statusCode >= 400) {
        throw new Error(`RepoCommandRes ${res.statusCode}`);
      }
      if (res.statusCode === 200) {
        return;
      }
    }
    throw new Error("command timeout");
  }
}

export namespace PyRepoClient {
  /** {@link PyRepoClient} constructor options. */
  export interface Options extends PrpsPublisher.Options {
    /**
     * Name prefix of the repo instance.
     *
     * @remarks
     * This corresponds to **ndn-python-repo.conf** `.repo_config.repo_name` key.
     */
    repoPrefix: Name;

    /**
     * If true, attempt to combine consecutive parameters into {@link RangeParam}.
     * @defaultValue false
     */
    combineRange?: boolean;

    /**
     * Maximum TLV-LENGTH of each RepoCommandParam.
     * @defaultValue 6144
     */
    commandLengthLimit?: number;

    /**
     * Maximum duration of each command in milliseconds.
     * @defaultValue 60 seconds
     */
    commandTimeout?: number;

    /**
     * How often to check command progress in milliseconds.
     * @defaultValue 1 second
     */
    checkInterval?: number;
  }

  /** Single packet parameters. */
  export interface SingleParam {
    name: Name;
    registerPrefix?: Name;
  }

  /** Segment range parameters. */
  export interface RangeParam {
    name: Name;
    start: number;
    end?: number;
    registerPrefix?: Name;
  }

  /** Either single packet parameters or segment range parameters. */
  export type ObjectParam = SingleParam | RangeParam;
}

function isRange(obj: PyRepoClient.ObjectParam): obj is PyRepoClient.RangeParam {
  return Number.isInteger((obj as PyRepoClient.RangeParam).start);
}

function makeObjectParam(obj: PyRepoClient.ObjectParam, fwHint: Name): ObjectParam {
  const p = new ObjectParam();
  p.name = obj.name;
  p.fwHint = fwHint;
  p.registerPrefix = obj.registerPrefix;

  if (isRange(obj)) {
    p.startBlockId = obj.start;
    if (Number.isFinite(obj.end)) {
      p.endBlockId = obj.end!;
      assert(p.startBlockId <= p.endBlockId);
    }
  }

  return p;
}

function combineRange(objs: readonly PyRepoClient.ObjectParam[]): PyRepoClient.ObjectParam[] {
  const res: PyRepoClient.ObjectParam[] = [];
  for (let obj of objs) {
    if (obj.registerPrefix) {
      res.push(obj);
      continue;
    }

    if (!isRange(obj) && obj.name.get(-1)?.is(Segment)) {
      const seg = obj.name.get(-1)!.as(Segment);
      obj = {
        name: obj.name.getPrefix(-1),
        start: seg,
        end: seg,
      } satisfies PyRepoClient.RangeParam;
    }

    const last = res.at(-1);
    if (last && !last.registerPrefix && isRange(last) && isRange(obj) &&
        (last.end ?? Infinity) + 1 === obj.start && last.name.equals(obj.name)) {
      last.end = obj.end;
      continue;
    }

    res.push(obj);
  }
  return res;
}
