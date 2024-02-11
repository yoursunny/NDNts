import { Endpoint, type Producer, type ProducerHandler, type RetxPolicy } from "@ndn/endpoint";
import { Data, digestSigning, Interest, type Name, type Signer, type Verifier } from "@ndn/packet";
import type { Subscriber, Subscription } from "@ndn/sync-api";
import { Decoder } from "@ndn/tlv";
import { CustomEvent } from "@ndn/util";
import { TypedEventTarget } from "typescript-event-target";

import { NotifyAppParam, NotifySuffix } from "./packet";

/** ndn-python-repo PubSub protocol subscriber. */
export class PrpsSubscriber implements Subscriber<Name, PrpsSubscriber.Update> {
  constructor({
    endpoint = new Endpoint(),
    msgInterestLifetime = Interest.DefaultLifetime,
    msgRetx = 2,
    pubVerifier,
    subAnnouncement,
    subSigner = digestSigning,
  }: PrpsSubscriber.Options = {}) {
    this.endpoint = endpoint;
    this.msgInterestLifetime = msgInterestLifetime;
    this.msgRetx = msgRetx;
    this.pubVerifier = pubVerifier;
    this.subAnnouncement = subAnnouncement;
    this.subSigner = subSigner;
  }

  public readonly endpoint: Endpoint;
  private readonly msgInterestLifetime: number;
  private readonly msgRetx: RetxPolicy;
  private readonly pubVerifier?: Verifier;
  private readonly subAnnouncement?: false;
  private readonly subSigner: Signer;

  public subscribe(topic: Name): Subscription<Name, PrpsSubscriber.Update> {
    return new Sub(topic, this.endpoint,
      this.msgInterestLifetime, this.msgRetx, this.pubVerifier,
      this.subAnnouncement, this.subSigner);
  }
}

export namespace PrpsSubscriber {
  export interface Options {
    /**
     * Endpoint for communication.
     * @defaultValue
     * Endpoint on default logical forwarder.
     */
    endpoint?: Endpoint;

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
      private readonly endpoint: Endpoint,
      private readonly msgInterestLifetime: number,
      private readonly msgRetx: RetxPolicy,
      private readonly pubVerifier: Verifier | undefined,
      subAnnouncement: false | undefined,
      subSigner: Signer,
  ) {
    super();
    this.notifyPrefix = topic.append(NotifySuffix);
    this.notifyProducer = this.endpoint.produce(this.notifyPrefix, this.handleNotifyInterest, {
      describe: `prps-sub(${topic})`,
      announcement: subAnnouncement,
      dataSigner: subSigner,
    });
  }

  public [Symbol.dispose](): void {
    this.notifyProducer.close();
  }

  private readonly notifyPrefix: Name;
  private readonly notifyProducer: Producer;

  private readonly handleNotifyInterest: ProducerHandler = async (interest) => {
    if (interest.name.length <= this.notifyPrefix.length || !interest.appParameters) {
      return undefined;
    }

    const notifyParam = Decoder.decode(interest.appParameters, NotifyAppParam);
    const msgInterest = notifyParam.makeMsgInterest(this.topic);
    msgInterest.lifetime = this.msgInterestLifetime;

    const msgData = await this.endpoint.consume(msgInterest, {
      describe: `prps-msg(${this.topic} ${notifyParam.publisher})`,
      retx: this.msgRetx,
      verifier: this.pubVerifier,
    });
    this.dispatchTypedEvent("update", new CustomEvent("update", { detail: msgData }));

    return new Data(interest.name);
  };
}
