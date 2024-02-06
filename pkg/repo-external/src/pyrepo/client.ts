import { Endpoint } from "@ndn/endpoint";
import { digestSigning, Interest, type Name, SignedInterestPolicy } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";
import { delay, sha256, toHex } from "@ndn/util";

import { PrpsPublisher } from "../prps/mod";
import { CommandParam, CommandRes, DeleteVerb, InsertVerb, ObjectParam, StatQuery, type Verb } from "./packet";

const checkSIP = new SignedInterestPolicy(SignedInterestPolicy.Nonce());

/** Client to interact with ndn-python-repo. */
export class PyRepoClient {
  constructor(opts: PyRepoClient.Options) {
    this.endpoint = opts.endpoint ?? new Endpoint();
    this.repoPrefix = opts.repoPrefix;
    this.progressTimeout = opts.progressTimeout ?? 10000;
    this.publisher = new PrpsPublisher(opts);
    this.fwHint = this.publisher.pubFwHint ?? this.publisher.pubPrefix;
    this.endpoint.fw.nodeNames.push(this.fwHint);
  }

  public readonly endpoint: Endpoint;
  public readonly repoPrefix: Name;
  private readonly progressTimeout: number;
  private readonly publisher: PrpsPublisher;
  private readonly fwHint: Name;

  public close(): void {
    const nodeNameIndex = this.endpoint.fw.nodeNames.findIndex((nodeName) => nodeName.equals(this.fwHint));
    if (nodeNameIndex >= 0) {
      this.endpoint.fw.nodeNames.splice(nodeNameIndex, 1);
    }

    this.publisher.close();
  }

  public async insert(name: Name): Promise<void> {
    return this.execute(InsertVerb, [this.makeObjectParam(name)]);
  }

  public async insertRange(name: Name, start: number, end = Infinity): Promise<void> {
    return this.execute(InsertVerb, [this.makeObjectParam(name, start, end)]);
  }

  public async delete(name: Name): Promise<void> {
    return this.execute(DeleteVerb, [this.makeObjectParam(name)]);
  }

  public async deleteRange(name: Name, start: number, end = Infinity): Promise<void> {
    return this.execute(DeleteVerb, [this.makeObjectParam(name, start, end)]);
  }

  private makeObjectParam(name: Name, start?: number, end?: number): ObjectParam {
    const p = new ObjectParam();
    p.name = name;
    if (start !== undefined) {
      p.startBlockId = start;
    }
    if (Number.isFinite(end)) {
      p.endBlockId = end;
    }
    p.fwHint = this.fwHint;
    return p;
  }

  private async execute(verb: Verb, objectParams: readonly ObjectParam[]): Promise<void> {
    const p = new CommandParam();
    p.objectParams.push(...objectParams);
    const request = Encoder.encode(p);
    const requestDigest = await sha256(request);
    const requestDigestHex = toHex(requestDigest);

    await this.publisher.publish(this.repoPrefix.append(verb.action), request);
    const checkParam = new StatQuery();
    checkParam.requestDigest = requestDigest;

    const t0 = Date.now();
    while (Date.now() < t0 + this.progressTimeout) {
      const checkInterest = new Interest();
      checkInterest.name = this.repoPrefix.append(verb.check);
      checkInterest.appParameters = Encoder.encode(checkParam);
      checkSIP.update(checkInterest, this);
      await digestSigning.sign(checkInterest);

      const checkData = await this.endpoint.consume(checkInterest, {
        describe: `pyrepo-check(${this.repoPrefix} ${requestDigestHex})`,
      });

      const res = Decoder.decode(checkData.content, CommandRes);
      if (res.statusCode >= 400) {
        throw new Error(`RepoCommandRes ${res.statusCode}`);
      }
      if (res.statusCode === 200) {
        return;
      }
      await delay(1000);
    }
    throw new Error("command timeout");
  }
}

export namespace PyRepoClient {
  export interface Options extends PrpsPublisher.Options {
    /**
     * Name prefix of the repo instance.
     *
     * @remarks
     * This corresponds to **ndn-python-repo.conf** `.repo_config.repo_name` key.
     */
    repoPrefix: Name;

    /**
     * Progress update timeout in milliseconds.
     * If no progress update is received for this period of time, the command is deemed failed.
     * @defaultValue 10 seconds
     */
    progressTimeout?: number;
  }
}
