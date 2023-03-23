import { Endpoint, type Producer, type ProducerHandler, type RetxPolicy } from "@ndn/endpoint";
import { Component, Data, digestSigning, FwHint, Interest, type Name, type Signer, type Verifier } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";
import { pushable } from "it-pushable";

import { MsgSuffix, NotifyParams, NotifySuffix } from "./packet";

/** PyRepo PubSub protocol subscriber. */
export class PrpsSubscriber {
  constructor({
    endpoint = new Endpoint(),
    msgInterestLifetime = Interest.DefaultLifetime,
    msgRetx = 2,
    pubVerifier,
    subAnnouncement,
    subSigner = digestSigning,
  }: PrpsSubscriber.Options) {
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

  public subscribe(topic: Name): PrpsSubscriber.Subscription {
    return new Subscription(topic, this.endpoint,
      this.msgInterestLifetime, this.msgRetx, this.pubVerifier,
      this.subAnnouncement, this.subSigner);
  }
}

class Subscription implements PrpsSubscriber.Subscription {
  constructor(
      public readonly topic: Name,
      private readonly endpoint: Endpoint,
      private readonly msgInterestLifetime: number,
      private readonly msgRetx: RetxPolicy,
      private readonly pubVerifier: Verifier | undefined,
      subAnnouncement: false | undefined,
      subSigner: Signer,
  ) {
    this.notifyPrefix = topic.append(NotifySuffix);
    this.notifyProducer = this.endpoint.produce(this.notifyPrefix, this.handleNotifyInterest, {
      describe: `prps-sub(${topic})`,
      announcement: subAnnouncement,
      dataSigner: subSigner,
    });
  }

  public close(): void {
    this.notifyProducer.close();
    this.messages.end();
  }

  public [Symbol.asyncIterator]() {
    return this.messages[Symbol.asyncIterator]();
  }

  private notifyPrefix: Name;
  private notifyProducer: Producer;
  private messages = pushable<Data>({ objectMode: true });

  private handleNotifyInterest: ProducerHandler = async (interest) => {
    if (interest.name.length !== this.notifyPrefix.length + 1 || !interest.appParameters) {
      return undefined;
    }

    const { publisher, nonce, publisherFwHint } =
      new Decoder(interest.appParameters).decode(NotifyParams);
    const messageInterest = new Interest(publisher.append(
      MsgSuffix, ...this.topic.comps, new Component(undefined, nonce)));
    if (publisherFwHint) {
      messageInterest.fwHint = new FwHint(publisherFwHint);
    }
    messageInterest.lifetime = this.msgInterestLifetime;
    const messageData = await this.endpoint.consume(messageInterest, {
      describe: `prps-msg(${this.topic} ${publisher})`,
      retx: this.msgRetx,
      verifier: this.pubVerifier,
    });
    this.messages.push(messageData);

    return new Data(interest.name);
  };
}

export namespace PrpsSubscriber {
  export interface Options {
    /** Endpoint for communication. */
    endpoint?: Endpoint;

    /** InterestLifetime of msg Interests. */
    msgInterestLifetime?: number;

    /**
     * Retransmission policy of msg Interests.
     * Default is 2 retransmissions.
     */
    msgRetx?: RetxPolicy;

    /**
     * Verifier for publications.
     * Default is no verification.
     */
    pubVerifier?: Verifier;

    /** Set to false to disable prefix announcements for receiving notify Interests. */
    subAnnouncement?: false;

    /**
     * Key to sign notify Data.
     * Default is digest signing.
     */
    subSigner?: Signer;
  }

  export type Subscription = AsyncIterable<Data> & {
    readonly topic: Name;

    /** Unsubscribe. */
    close: () => void;
  };
}
