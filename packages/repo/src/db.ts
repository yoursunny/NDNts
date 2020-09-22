import { Data, Name } from "@ndn/packet";
import { Decoder, fromUtf8 } from "@ndn/tlv";
import type { AbstractIterator, AbstractLevelDOWN } from "abstract-leveldown";
import EncodingDown from "encoding-down";
import level, { LevelUp, LevelUpChain } from "levelup";

export interface Record {
  readonly data: Data;
  readonly name: Name;
  readonly insertTime: number;
  readonly expireTime?: number;
  encodedBuffer?: Buffer;
}

export type Db = LevelUp<EncodingDown<Name, Record>, AbstractIterator<Name, Record>>;
export type DbChain = LevelUpChain<Name, Record>;

export function openDb(db: AbstractLevelDOWN): Db {
  return level(EncodingDown<Name, Record>(db, {
    keyEncoding: {
      encode(name: Name): Buffer {
        const { buffer, byteOffset, byteLength } = name.value;
        return Buffer.from(buffer, byteOffset, byteLength);
      },
      decode(stored: Buffer): Name {
        return new Name(stored);
      },
      buffer: true,
      type: "d6d494ba-4d45-4b51-a102-26b8867c5034",
    },
    valueEncoding: {
      encode(record: Record): Buffer {
        return record.encodedBuffer!;
      },
      decode(stored: Buffer): Record {
        const { decoder, after } = new Decoder(stored).read();
        const record = JSON.parse(fromUtf8(after)) as Record;
        Object.defineProperties(record, {
          data: {
            configurable: true,
            get() {
              const value = decoder.decode(Data);
              Object.defineProperty(record, "data", { value });
              return value;
            },
          },
          name: {
            configurable: true,
            /* istanbul ignore next */
            get() {
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

export function isExpired(expireTime?: number, now = Date.now()): boolean {
  return !!expireTime && expireTime < now;
}

export function filterExpired(expired: boolean, now = Date.now()): (record: Record) => boolean {
  return ({ expireTime }: Record) => isExpired(expireTime, now) === expired;
}
