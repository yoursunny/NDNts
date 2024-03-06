import { consume, ConsumerOptions, type Endpoint, produce, type Producer, type ProducerHandler, ProducerOptions, type RetxPolicy } from "@ndn/endpoint";
import { Data, digestSigning, Interest, type Name, type Signer, type Verifier } from "@ndn/packet";
import type { Subscriber, Subscription } from "@ndn/sync-api";
import { Decoder } from "@ndn/tlv";
import { CustomEvent } from "@ndn/util";
import { TypedEventTarget } from "typescript-event-target";

import { NotifyAppParam, NotifySuffix } from "./packet";

/** ndn-python-repo PubSub protocol subscriber. */
export class PrpsSubscriber implements Subscriber<Name, PrpsSubscriber.Update> {
  constructor({
    endpoint, // eslint-disable-line etc/no-deprecated
    cpOpts,
    msgInterestLifetime = Interest.DefaultLifetime,
    msgRetx = 2,
    pubVerifier,
    subAnnouncement,
    subSigner = digestSigning,
  }: PrpsSubscriber.Options = {}) {
    this.cpOpts = {
      ...endpoint?.opts,
      ...cpOpts,
    };
    this.msgInterestLifetime = msgInterestLifetime;
    this.msgRetx = msgRetx;
    this.pubVerifier = pubVerifier;
    this.subAnnouncement = subAnnouncement;
    this.subSigner = subSigner;
  }

  private readonly cpOpts: ConsumerOptions & ProducerOptions;
  private readonly msgInterestLifetime: number;
  private readonly msgRetx: RetxPolicy;
  private readonly pubVerifier?: Verifier;
  private readonly subAnnouncement?: false;
  private readonly subSigner: Signer;

  public subscribe(topic: Name): Subscription<Name, PrpsSubscriber.Update> {
    return new Sub(topic, this.cpOpts,
      this.msgInterestLifetime, this.msgRetx, this.pubVerifier,
      this.subAnnouncement, this.subSigner);
  }
}

export namespace PrpsSubscriber {
  export interface Options {
    /**
     * Endpoint for communication.
     * @deprecated Specify `.cpOpts`.
     */
    endpoint?: Endpoint;

    /**
     * Consumer and producer options.
     *
     * @remarks
     * - `.fw` may be specified.
     * - Most other fields are overridden.
     */
    cpOpts?: ConsumerOptions & ProducerOptions;

    /** InterestLifetime of msg Interests. */
    msgInterestLifetime?: number;

    /**
     * Retransmission policy of msg Interests.
     * @defaultValue 2 retransmissions
     */
    msgRetx?: RetxPolicy;

    /**
     * Verifier for publications.
     * @defaultValue no verification
     */
    pubVerifier?: Verifier;

    /**
     * Set to false to disable prefix announcements for receiving notify Interests.
     *
     * @remarks
     * This should be set only if the application already has a prefix announcement that covers
     * the `topic` of each subscription.
     */
    subAnnouncement?: false;

    /**
     * Key to sign notify Data.
     * @defaultValue `digestSigning`
     */
    subSigner?: Signer;
  }

  export type Update = CustomEvent<Data>;
}

class Sub extends TypedEventTarget<Subscription.EventMap<PrpsSubscriber.Update>>
  implements Subscription<Name, PrpsSubscriber.Update> {
  constructor(
      public readonly topic: Name,
      cpOpts: ConsumerOptions & ProducerOptions,
      private readonly msgInterestLifetime: number,
      msgRetx: RetxPolicy,
      pubVerifier: Verifier | undefined,
      subAnnouncement: false | undefined,
      subSigner: Signer,
  ) {
    super();
    this.notifyPrefix = topic.append(NotifySuffix);
    this.notifyProducer = produce(this.notifyPrefix, this.handleNotifyInterest, {
      ...ProducerOptions.exact(cpOpts),
      describe: `prps-sub(${topic})`,
      announcement: subAnnouncement,
      dataSigner: subSigner,
    });
    this.msgCOpts = {
      ...ConsumerOptions.exact(cpOpts),
      retx: msgRetx,
      verifier: pubVerifier,
    };
  }

  public [Symbol.dispose](): void {
    this.notifyProducer.close();
  }

  private readonly notifyPrefix: Name;
  private readonly notifyProducer: Producer;
  private readonly msgCOpts: ConsumerOptions;

  private readonly handleNotifyInterest: ProducerHandler = async (interest) => {
    if (interest.name.length <= this.notifyPrefix.length || !interest.appParameters) {
      return undefined;
    }

    const notifyParam = Decoder.decode(interest.appParameters, NotifyAppParam);
    const msgInterest = notifyParam.makeMsgInterest(this.topic);
    msgInterest.lifetime = this.msgInterestLifetime;

    const msgData = await consume(msgInterest, {
      ...this.msgCOpts,
      describe: `prps-msg(${this.topic} ${notifyParam.publisher})`,
    });
    this.dispatchTypedEvent("update", new CustomEvent("update", { detail: msgData }));

    return new Data(interest.name);
  };
}
