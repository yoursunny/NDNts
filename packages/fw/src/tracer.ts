import { type Name, Data, Interest, Nack } from "@ndn/packet";
import { console } from "@ndn/util";

import type { FwFace } from "./face";
import { Forwarder } from "./forwarder";
import type { FwPacket } from "./packet";

/** Print trace logs from Forwarder events. */
export class Tracer {
  public static enable(opts: Tracer.Options = {}): Tracer {
    return new Tracer(opts);
  }

  private readonly output: Tracer.Output;
  private readonly fw: Forwarder;

  constructor({
    output = console,
    fw = Forwarder.getDefault(),
    face = true,
    prefix = true,
    ann = true,
    pkt = true,
  }: Tracer.Options) {
    this.output = output;
    this.fw = fw;
    /* istanbul ignore else */
    if (face) {
      this.fw.on("faceadd", this.faceadd);
      this.fw.on("facerm", this.facerm);
    }
    /* istanbul ignore else */
    if (prefix) {
      this.fw.on("prefixadd", this.prefixadd);
      this.fw.on("prefixrm", this.prefixrm);
    }
    /* istanbul ignore else */
    if (ann) {
      this.fw.on("annadd", this.annadd);
      this.fw.on("annrm", this.annrm);
    }
    /* istanbul ignore else */
    if (pkt) {
      this.fw.on("pktrx", this.pktrx);
      this.fw.on("pkttx", this.pkttx);
    }
  }

  public disable() {
    this.fw.off("faceadd", this.faceadd);
    this.fw.off("facerm", this.facerm);
    this.fw.off("prefixadd", this.prefixadd);
    this.fw.off("prefixrm", this.prefixrm);
    this.fw.off("annadd", this.annadd);
    this.fw.off("annrm", this.annrm);
    this.fw.off("pktrx", this.pktrx);
    this.fw.off("pkttx", this.pkttx);
  }

  private faceadd = (face: FwFace) => {
    this.output.log(`+Face ${face}`);
  };

  private facerm = (face: FwFace) => {
    this.output.log(`-Face ${face}`);
  };

  private prefixadd = (face: FwFace, prefix: Name) => {
    this.output.log(`${face} +Prefix ${prefix}`);
  };

  private prefixrm = (face: FwFace, prefix: Name) => {
    this.output.log(`${face} -Prefix ${prefix}`);
  };

  private annadd = (name: Name) => {
    this.output.log(`+Announcement ${name}`);
  };

  private annrm = (name: Name) => {
    this.output.log(`-Announcement ${name}`);
  };

  private pktrx = (face: FwFace, pkt: FwPacket) => {
    this.pkt(face, pkt, ">");
  };

  private pkttx = (face: FwFace, pkt: FwPacket) => {
    this.pkt(face, pkt, "<");
  };

  private pkt(face: FwFace, pkt: FwPacket, dir: string) {
    switch (true) {
      case pkt.l3 instanceof Interest: {
        const act = pkt.cancel ? "Cancel" :
          pkt.reject ? `Reject(${pkt.reject})` :
          "I";
        this.output.log(`${face} ${dir}${act} ${interestToString(pkt.l3 as Interest)}`);
        break;
      }
      case pkt.l3 instanceof Data: {
        const { name } = pkt.l3 as Data;
        this.output.log(`${face} ${dir}D ${name}`);
        break;
      }
      case pkt.l3 instanceof Nack: {
        const { interest, reason } = pkt.l3 as Nack;
        this.output.log(`${face} ${dir}N ${interestToString(interest)}~${reason}`);
        break;
      }
    }
  }
}

function interestToString({ name, canBePrefix, mustBeFresh }: Interest): string {
  return `${name}${canBePrefix ? "[P]" : ""}${mustBeFresh ? "[F]" : ""}`;
}

export namespace Tracer {
  export interface Output {
    log(str: string): void;
  }

  export interface Options {
    /**
     * Where to write log entries.
     * Default is stderr in Node and developer console in browser.
     */
    output?: Output;

    /**
     * Logical Forwarder instance.
     * @default Forwarder.getDefault()
     */
    fw?: Forwarder;

    /**
     * Whether to log face creations and deletions.
     * @default true
     */
    face?: boolean;

    /**
     * Whether to log prefix registrations.
     * @default true
     */
    prefix?: boolean;

    /**
     * Whether to log prefix announcements.
     * @default true
     */
    ann?: boolean;

    /**
     * Whether to log packets.
     * @default true
     */
    pkt?: boolean;
  }
}
