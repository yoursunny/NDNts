import { PrivateKey, theDigestKey } from "@ndn/keychain";
import { Segment } from "@ndn/naming-convention2";
import { Data, Name, NamingConvention } from "@ndn/packet";
import isStream from "is-stream";
import { fromStream } from "streaming-iterables";

function makeInputIterator(input: chunker.Input): AsyncIterable<Uint8Array> {
  if ((isStream.readable as (obj: unknown) => obj is NodeJS.ReadableStream)(input)) {
    return fromStream(input);
  }
  if (input instanceof Uint8Array) {
    return (async function*() {
      yield input;
    })();
  }
  return input;
}

/** Generate Data packets with Content no larger than chunkSize.
 */
export async function* chunker(name: Name, input: chunker.Input, {
  segmentNumConvention = Segment,
  chunkSize,
  freshnessPeriod = 60000,
  signer = theDigestKey,
}: chunker.Options = {}): AsyncGenerator<Data> {
  let segmentNum = -1;
  let data: Data|undefined;
  for await (const chunk of chunker.payload(input, chunkSize)) {
    if (data) {
      signer.sign(data);
      yield data;
    }
    data = new Data(name.append(segmentNumConvention, ++segmentNum),
                    Data.FreshnessPeriod(freshnessPeriod), chunk);
  }
  if (!data) { // input is empty
    data = new Data(name.append(segmentNumConvention, ++segmentNum),
                    Data.FreshnessPeriod(freshnessPeriod));
  }
  data.isFinalBlock = true;
  signer.sign(data);
  yield data;
}

export namespace chunker {
  export type Input = Uint8Array | AsyncIterable<Uint8Array> | NodeJS.ReadableStream;

  /**
   * Slice input into chunks no larger than chunkSize.
   *
   * Current implementation does not have minimum chunk size limit, and could yield very small chunks.
   */
  export async function* payload(input: Input, chunkSize = 8000): AsyncGenerator<Uint8Array> {
    for await (const buffer of makeInputIterator(input)) {
      for (let i = 0; i < buffer.length; i += chunkSize) {
        yield buffer.subarray(i, i + chunkSize);
      }
    }
  }

  export interface Options {
    /**
     * Choose a segment number naming convention.
     * Default is Segment from @ndn/naming-convention2 package.
     */
    segmentNumConvention?: NamingConvention<number, number>;

    /**
     * Payload size in each segment.
     * Default is 8000.
     */
    chunkSize?: number;

    /**
     * Data FreshnessPeriod (in milliseconds).
     * Default is 60000.
     */
    freshnessPeriod?: number;

    /**
     * A private key to sign Data.
     * Default is SHA256 digest.
     */
    signer?: PrivateKey;
  }
}
