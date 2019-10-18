import { Forwarder, FwFace } from "@ndn/fw";
import { PrivateKey, theDigestKey } from "@ndn/keychain";
import { Data, Interest } from "@ndn/l3pkt";
import { Name, NamingConvention } from "@ndn/name";
import { Segment as Segment03 } from "@ndn/naming-convention-03";
import assert from "minimalistic-assert";

import { chunker } from "./chunker";

class Server {
  private face: FwFace;
  private chunker: AsyncGenerator<Uint8Array>;
  private dataGen: AsyncGenerator<[number, Data]>;
  private chunks = new Map<number, Data>();
  private allGenerated = false;

  constructor(public readonly name: Name, input: serve.Input, opts: serve.Options) {
    this.fw = opts.fw || Forwarder.getDefault();
    this.segmentNumConvention = opts.segmentNumConvention || Segment03;
    this.chunkSize = opts.chunkSize || 8000;
    this.signer = opts.signer || theDigestKey;
    this.producer = this.producer.bind(this);

    this.chunker = chunker(input, this.chunkSize);
    this.dataGen = this.generateData(this.chunker);
    this.face = this.fw.addFace(this.producer);
    this.face.addRoute(name);
  }

  public stop() {
    this.face.close();
  }

  private async *generateData(input: AsyncIterable<Uint8Array>): AsyncGenerator<[number, Data]> {
    let segmentNum = -1;
    let data: Data|undefined;
    for await (const chunk of input) {
      if (data) {
        this.signer.sign(data);
        yield [segmentNum, data];
      }
      data = new Data(this.name.append(this.segmentNumConvention, ++segmentNum), chunk);
    }
    if (!data) { // input is empty
      data = new Data(this.name.append(this.segmentNumConvention, ++segmentNum));
    }
    data.isFinalBlock = true;
    this.signer.sign(data);
    yield [segmentNum, data];
  }

  private async generateSegment(segmentNum: number): Promise<Data|undefined> {
    while (!this.chunks.has(segmentNum) && !this.allGenerated) {
      const { done, value } = await this.dataGen.next();
      if (done) {
        this.allGenerated = true;
        break;
      }
      const [genSegNum, data] = value as [number, Data];
      this.chunks.set(genSegNum, data);
    }
    return this.chunks.get(segmentNum);
  }

  private async *producer(iterable: AsyncIterable<FwFace.Txable>) {
    for await (const pkt of iterable) {
      assert(pkt instanceof Interest);
      const name = (pkt as Interest).name;
      if (name.length !== this.name.length + 1 ||
          !this.segmentNumConvention.match(name.get(-1)!)) {
        continue;
      }
      const segmentNum = this.segmentNumConvention.parse(name.get(-1)!);
      const data = await this.generateSegment(segmentNum);
      if (data) {
        yield data;
      }
    }
  }
}
interface Server extends Required<serve.Options> {}

/** Start serving a segmented object. */
export function serve(name: Name, input: serve.Input, opts: serve.Options = {}): serve.Server {
  return new Server(name, input, opts);
}

type Server_ = Server;

export namespace serve {
  export type Input = chunker.Input;

  export interface Options {
    /** Use the specified forwarder instead of the default. */
    fw?: Forwarder;

    /**
     * Choose a segment number naming convention.
     * Default is Segment from @ndn/naming-convention-03 package.
     */
    segmentNumConvention?: NamingConvention<number, number>;

    /**
     * Payload size in each segment.
     * Default is 8000.
     */
    chunkSize?: number;

    /**
     * A private key to sign Data.
     * Default is SHA256 digest.
     */
    signer?: PrivateKey;
  }

  /** Serving control. */
  export type Server = Server_;
}
