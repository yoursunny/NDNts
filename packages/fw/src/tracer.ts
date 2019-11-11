import { Data, Interest } from "@ndn/l3pkt";
import { Name } from "@ndn/name";
import log from "loglevel";

import { Face } from "./face";
import { Forwarder } from "./forwarder";
import { CancelInterest, RejectInterest } from "./reqres";

/* eslint-disable @typescript-eslint/unbound-method */

export const logger = log.getLogger("@ndn/fw");
logger.setLevel(log.levels.TRACE);

interface Options {
  fw?: Forwarder;
  face?: boolean;
  prefix?: boolean;
  ann?: boolean;
  pkt?: boolean;
}

function interestToString(pkt: Interest) {
  return `${pkt.name}${pkt.canBePrefix ? "[P]" : ""}${pkt.mustBeFresh ? "[F]" : ""}`;
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

  private faceadd(face: Face) {
    logger.debug(`+Face ${face}`);
  }

  private facerm(face: Face) {
    logger.debug(`-Face ${face}`);
  }

  private prefixadd(face: Face, prefix: Name) {
    logger.debug(`${face} +Prefix ${prefix}`);
  }

  private prefixrm(face: Face, prefix: Name) {
    logger.debug(`${face} -Prefix ${prefix}`);
  }

  private annadd(name: Name) {
    logger.debug(`+Announcement ${name}`);
  }

  private annrm(name: Name) {
    logger.debug(`-Announcement ${name}`);
  }

  private pktrx(face: Face, pkt: Face.Rxable) {
    switch (true) {
      case pkt instanceof Interest: {
        const interest = pkt as Interest;
        logger.debug(`${face} >I ${interestToString(interest)}`);
        break;
      }
      case pkt instanceof Data: {
        const data = pkt as Interest;
        logger.debug(`${face} >D ${data.name}`);
        break;
      }
      case pkt instanceof CancelInterest: {
        const cancel = pkt as CancelInterest;
        logger.debug(`${face} >Cancel ${interestToString(cancel.interest)}`);
        break;
      }
    }
  }

  private pkttx(face: Face, pkt: Face.Txable) {
    switch (true) {
      case pkt instanceof Interest: {
        const interest = pkt as Interest;
        logger.debug(`${face} <I ${interestToString(interest)}`);
        break;
      }
      case pkt instanceof Data: {
        const data = pkt as Interest;
        logger.debug(`${face} <D ${data.name}`);
        break;
      }
      case pkt instanceof RejectInterest: {
        const rej = pkt as RejectInterest;
        logger.debug(`${face} <Reject(${rej.reason}) ${interestToString(rej.interest)}`);
        break;
      }
    }
  }
}

export namespace Tracer {
  export const internalLogger = logger;
}
