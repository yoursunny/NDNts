import { Data, Name } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";
import { assert, fromUtf8 } from "@ndn/util";
import type { AbstractChainedBatch, AbstractDatabaseOptions, AbstractLevel } from "abstract-level";
import type { Promisable } from "type-fest";

/** Value stored in database. */
export interface Value {
  readonly data: Data;
  readonly name: Name;
  readonly insertTime: number;
  readonly expireTime?: number;
}
const textEncoder = new TextEncoder();

/** Required options when creating abstract-level compatible key-value database. */
export const AbstractLevelOptions: AbstractDatabaseOptions<Name, Value> = {
  keyEncoding: {
    name: "d6d494ba-4d45-4b51-a102-26b8867c5034",
    format: "view",
    encode(name: Name): Uint8Array {
      return name.value;
    },
    decode(stored: Uint8Array): Name {
      return new Name(stored);
    },
  },
  valueEncoding: {
    name: "bb613530-3278-45f1-b5ae-7ced392eb602",
    format: "view",
    encode(record: Value): Uint8Array {
      const encoder = new Encoder();
      const jText = JSON.stringify(record, ["insertTime", "expireTime"] satisfies Array<keyof Value>);
      const jBufCap = 3 * jText.length;
      const jBuf = encoder.prependRoom(jBufCap);
      const { read: jTextLen = 0, written: jBufLen = 0 } = textEncoder.encodeInto(jText, jBuf);
      assert(jTextLen === jText.length);
      encoder.encode(record.data);
      return encoder.output.subarray(0, encoder.size - jBufCap + jBufLen);
    },
    decode(stored: Uint8Array): Value {
      const tlv = new Decoder(stored).read();
      const record = JSON.parse(fromUtf8(tlv.after)) as Value;
      Object.defineProperties(record, {
        data: {
          configurable: true,
          get() {
            const value = tlv.decoder.decode(Data);
            Object.defineProperty(record, "data", { value });
            return value;
          },
        },
        name: {
          configurable: true,
          get() {
            /* c8 ignore next */
            return record.data.name;
          },
        },
      });
      return record;
    },
  },
};

/** An abstract-level compatible key-value database. */
export type Db = AbstractLevel<any, Name, Value>;

/** Function to create Db. */
export type DbOpener = (opts: AbstractDatabaseOptions<Name, Value>) => Promisable<Db>;

/**
 * Constructor of AbstractLevel subclass.
 * @typeParam A - Constructor arguments, excluding the last.
 * @typeParam O - Last constructor argument, which must be the options object.
 */
export type DbCtor<A extends unknown[], O extends {}> =
  new(...a: [...A, O & AbstractDatabaseOptions<Name, Value>]) => Db;

/** A transaction chain in key-value database. */
export type DbChain = AbstractChainedBatch<Db, Name, Value>;

/** Determine whether a record has expired. */
export function isExpired({ expireTime = Infinity }: Value, now = Date.now()): boolean {
  return expireTime < now;
}

/** Create a filter function for either expired or unexpired records. */
export function filterExpired(expired: boolean, now = Date.now()): (record: Value) => boolean {
  return (record: Value) => isExpired(record, now) === expired;
}
