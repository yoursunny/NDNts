import { Data, Interest, Nack, Name } from "@ndn/packet";
import log from "loglevel";

import { FwFace } from "./face";
import { Forwarder } from "./forwarder";
import type { FwPacket } from "./packet";

export const logger = log.getLogger("@ndn/fw");
logger.setLevel(log.levels.TRACE);

interface Options {
  fw?: Forwarder;
  face?: boolean;
  prefix?: boolean;
  ann?: boolean;
  pkt?: boolean;
}

export class Tracer {
  public static enable(opts: Options = {}): Tracer {
    return new Tracer(opts);
  }

  private readonly fw: Forwarder;

  constructor(opts: Options) {
    this.fw = opts.fw ?? Forwarder.getDefault();
    /* istanbul ignore else */
    if (opts.face !== false) {
      this.fw.on("faceadd", this.faceadd);
      this.fw.on("facerm", this.facerm);
    }
    /* istanbul ignore else */
    if (opts.prefix !== false) {
      this.fw.on("prefixadd", this.prefixadd);
      this.fw.on("prefixrm", this.prefixrm);
    }
    /* istanbul ignore else */
    if (opts.ann !== false) {
      this.fw.on("annadd", this.annadd);
      this.fw.on("annrm", this.annrm);
    }
    /* istanbul ignore else */
    if (opts.pkt !== false) {
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
    logger.debug(`+Face ${face}`);
  };

  private facerm = (face: FwFace) => {
    logger.debug(`-Face ${face}`);
  };

  private prefixadd = (face: FwFace, prefix: Name) => {
    logger.debug(`${face} +Prefix ${prefix}`);
  };

  private prefixrm = (face: FwFace, prefix: Name) => {
    logger.debug(`${face} -Prefix ${prefix}`);
  };

  private annadd = (name: Name) => {
    logger.debug(`+Announcement ${name}`);
  };

  private annrm = (name: Name) => {
    logger.debug(`-Announcement ${name}`);
  };

  private pktrx =(face: FwFace, pkt: FwPacket) => {
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
        logger.debug(`${face} ${dir}${act} ${interestToString(pkt.l3 as Interest)}`);
        break;
      }
      case pkt.l3 instanceof Data: {
        const { name } = pkt.l3 as Data;
        logger.debug(`${face} ${dir}D ${name}`);
        break;
      }
      case pkt.l3 instanceof Nack: {
        const { interest, reason } = pkt.l3 as Nack;
        logger.debug(`${face} ${dir}N ${interestToString(interest)}~${reason}`);
        break;
      }
    }
  }
}

function interestToString({ name, canBePrefix, mustBeFresh }: Interest): string {
  return `${name}${canBePrefix ? "[P]" : ""}${mustBeFresh ? "[F]" : ""}`;
}

export namespace Tracer {
  export const internalLogger = logger;
}
