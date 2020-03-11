import { Forwarder, FwFace } from "@ndn/fw";
import { Segment, Version } from "@ndn/naming-convention2";
import { ComponentLike, Data, Interest, Name, NamingConvention } from "@ndn/packet";
import assert from "minimalistic-assert";

import { chunker } from "./chunker";

function appendVersion(name: Name, convention: NamingConvention<number, unknown>,
    version: ComponentLike|number|boolean = false): Name {
  if (version === false) { return name; }
  if (version === true) { version = Date.now(); }
  if (typeof version === "number") { return name.append(convention, version); }
  return name.append(version);
}

class Server {
  public readonly versioned: Name;
  private segmentNumConvention: NamingConvention<number, number>;
  private face: FwFace;
  private chunker: AsyncGenerator<Data>;
  private chunks = new Map<number, Data>();
  private lastGenSeqNum = -1;
  private allGenerated = false;

  constructor(public readonly name: Name, input: serve.Input, opts: serve.Options) {
    this.versioned = appendVersion(name, opts.versionConvention ?? Version, opts.version);
    this.segmentNumConvention = opts.segmentNumConvention ?? Segment;
    this.chunker = chunker(this.versioned, input, opts);

    this.face = (opts.fw ?? Forwarder.getDefault()).addFace({
      toString: () => `serve(${this.versioned})`,
      transform: (iterable) => this.producer(iterable),
    });
    this.face.addRoute(name);
  }

  public stop() {
    this.face.close();
  }

  private async generateSegment(segmentNum: number): Promise<Data|undefined> {
    while (!this.chunks.has(segmentNum) && !this.allGenerated) {
      const { done, value } = await this.chunker.next();
      if (done) {
        this.allGenerated = true;
        break;
      }
      const data = value as Data;
      this.chunks.set(++this.lastGenSeqNum, data);
    }
    return this.chunks.get(segmentNum);
  }

  private async *producer(iterable: AsyncIterable<FwFace.Txable>) {
    for await (const pkt of iterable) {
      assert(pkt instanceof Interest);
      const interest = pkt as Interest;
      const name = interest.name;
      const lastComp = name.get(-1);
      let segmentNum: number;
      if (name.length === this.versioned.length + 1 && this.segmentNumConvention.match(lastComp!)) {
        segmentNum = this.segmentNumConvention.parse(lastComp!);
      } else if (interest.canBePrefix && name.isPrefixOf(this.versioned)) {
        segmentNum = 0;
      } else {
        continue;
      }
      const data = await this.generateSegment(segmentNum);
      if (data) {
        yield data;
      }
    }
  }
}

/** Start serving a segmented object. */
export function serve(name: Name, input: serve.Input, opts: serve.Options = {}): serve.Server {
  return new Server(name, input, opts);
}

type Server_ = Server;

export namespace serve {
  export type Input = chunker.Input;

  export interface Options extends chunker.Options {
    /** Use the specified forwarder instead of the default. */
    fw?: Forwarder;

    /**
     * Insert version component.
     *
     * Component or string: use specified component.
     * number: encoded with versionConvention.
     * true: encode current timestamp in microseconds with versionConvention.
     * false: do not include a version component.
     *
     * Default is false.
     */
    version?: ComponentLike|number|boolean;

    /**
     * Choose a version naming convention.
     * Default is Version from @ndn/naming-convention2 package.
     */
    versionConvention?: NamingConvention<unknown, unknown>;
  }

  /** Serving control. */
  export type Server = Server_;
}
