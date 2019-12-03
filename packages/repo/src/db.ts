import { Data, Name } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";
import { AbstractIterator, AbstractLevelDOWN } from "abstract-leveldown";
import EncodingDown from "encoding-down";
import level, { LevelUp } from "levelup";

export interface Record {
  data: Data;
  insertTime: number;
  expireTime?: number;
}

export type Db = LevelUp<EncodingDown<Name, Record>, AbstractIterator<Name, Record>>;

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
        const rec = { ...record } as Omit<Record, "data">;
        delete (rec as any).data;
        return Buffer.concat([
          Data.getWire(record.data),
          new TextEncoder().encode(JSON.stringify(rec)),
        ]);
      },
      decode(stored: Buffer): Record {
        const { decoder, after } = new Decoder(stored).read();
        const data = decoder.decode(Data);
        const rec = JSON.parse(new TextDecoder().decode(after)) as Omit<Record, "data">;
        return { ...rec, data };
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
