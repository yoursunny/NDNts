import { Data, Name } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";
import { assert, fromUtf8 } from "@ndn/util";
import type { AbstractChainedBatch, AbstractDatabaseOptions, AbstractLevel } from "abstract-level";
import type { AbstractChainedBatch as Batch1, AbstractLevel as Level1 } from "abstract-level-1";
import type { Promisable } from "type-fest";

/** Value stored in database. */
export interface Record {
  readonly data: Data;
  readonly name: Name;
  readonly insertTime: number;
  readonly expireTime?: number;
}
const textEncoder = new TextEncoder();

/** Required options when creating abstract-level compatible key-value database. */
export const AbstractLevelOptions: AbstractDatabaseOptions<Name, Record> = {
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
    encode(record: Record): Uint8Array {
      const encoder = new Encoder();
      const jText = JSON.stringify(record, ["insertTime", "expireTime"] satisfies Array<keyof Record>);
      const jBufCap = 3 * jText.length;
      const jBuf = encoder.prependRoom(jBufCap);
      const { read: jTextLen = 0, written: jBufLen = 0 } = textEncoder.encodeInto(jText, jBuf);
      assert(jTextLen === jText.length);
      encoder.encode(record.data);
      return encoder.output.subarray(0, encoder.size - jBufCap + jBufLen);
    },
    decode(stored: Uint8Array): Record {
      const tlv = new Decoder(stored).read();
      const record = JSON.parse(fromUtf8(tlv.after)) as Record;
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

export type Db2 = AbstractLevel<any, Name, Record>;

/** An abstract-level compatible key-value database. */
export type Db = Db2 | Level1<any, Name, Record>;

/** Function to create Db. */
export type DbOpener = (opts: AbstractDatabaseOptions<Name, Record>) => Promisable<Db>;

/**
 * Constructor of AbstractLevel subclass.
 * @typeParam A - Constructor arguments, excluding the last.
 * @typeParam O - Last constructor argument, which must be the options object.
 */
export type DbCtor<A extends unknown[], O extends {}> =
  new(...a: [...A, O & AbstractDatabaseOptions<Name, Record>]) => Db;

/** A transaction chain in key-value database. */
export type DbChain = AbstractChainedBatch<Db, Name, Record> | Batch1<Db, Name, Record>;

/** Determine whether `err` represents "not found". */
export function isNotFound(err: unknown): boolean {
  const { code, notFound } = err as { code?: string; notFound?: true };
  return code === "LEVEL_NOT_FOUND" || notFound === true;
}

/** Determine whether a record has expired. */
export function isExpired({ expireTime = Infinity }: Record, now = Date.now()): boolean {
  return expireTime < now;
}

/** Create a filter function for either expired or unexpired records. */
export function filterExpired(expired: boolean, now = Date.now()): (record: Record) => boolean {
  return (record: Record) => isExpired(record, now) === expired;
}
