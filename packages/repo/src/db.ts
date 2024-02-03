import { Data, Name } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";
import { assert, fromUtf8 } from "@ndn/util";
import type { AbstractIterator, AbstractLevelDOWN } from "abstract-leveldown";
import EncodingDown from "encoding-down";
import levelup, { type LevelUp, type LevelUpChain } from "levelup";

import type { DataStore } from "./data-store";

export interface Record extends Readonly<DataStore.InsertOptions> {
  readonly data: Data;
  readonly name: Name;
  readonly insertTime: number;
}

export type Db = LevelUp<EncodingDown<Name, Record>, AbstractIterator<Name, Record>>;
export type DbChain = LevelUpChain<Name, Record>;

function asBuffer({ buffer, byteOffset, byteLength }: Uint8Array): Buffer {
  return Buffer.from(buffer, byteOffset, byteLength);
}

const textEncoder = new TextEncoder();

export function openDb(db: AbstractLevelDOWN): Db {
  return levelup(EncodingDown<Name, Record>(db, {
    keyEncoding: {
      encode(name: Name): Buffer {
        return asBuffer(name.value);
      },
      decode(stored: Buffer): Name {
        return new Name(stored);
      },
      buffer: true,
      type: "d6d494ba-4d45-4b51-a102-26b8867c5034",
    },
    valueEncoding: {
      encode(record: Record): Buffer {
        const encoder = new Encoder();
        const jText = JSON.stringify(record, ["insertTime", "expireTime"] as Array<keyof Record>);
        const jBufCap = 3 * jText.length;
        const jBuf = encoder.prependRoom(jBufCap);
        const { read: jTextLen = 0, written: jBufLen = 0 } = textEncoder.encodeInto(jText, jBuf);
        assert.equal(jTextLen, jText.length);
        encoder.encode(record.data);
        return asBuffer(encoder.output.subarray(0, encoder.size - jBufCap + jBufLen));
      },
      decode(stored: Buffer): Record {
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
      buffer: true,
      type: "bb613530-3278-45f1-b5ae-7ced392eb602",
    },
  }));
}

export function isExpired(expireTime = Infinity, now = Date.now()): boolean {
  return expireTime < now;
}

export function filterExpired(expired: boolean, now = Date.now()): (record: Record) => boolean {
  return ({ expireTime }: Record) => isExpired(expireTime, now) === expired;
}
