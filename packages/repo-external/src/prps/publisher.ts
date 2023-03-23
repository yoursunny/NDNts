import { Endpoint, type Producer, type ProducerHandler, type RetxPolicy } from "@ndn/endpoint";
import { SequenceNum } from "@ndn/naming-convention2";
import { Component, Data, digestSigning, Interest, Name, NameMap, type Signer } from "@ndn/packet";
import { type Encodable, Encoder } from "@ndn/tlv";
import { asDataView } from "@ndn/util";

import { MsgSuffix, NotifyParams, NotifySuffix } from "./packet";

/** PyRepo PubSub protocol publisher. */
export class PrpsPublisher {
  constructor({
    endpoint = new Endpoint(),
    pubPrefix = new Name("/localhost").append(SequenceNum, 0xFFFFFFFF * Math.random()),
    pubFwHint,
    pubAnnouncement,
    pubSigner = digestSigning,
    notifyInterestLifetime = Interest.DefaultLifetime,
    notifyRetx = 2,
  }: PrpsPublisher.Options) {
    this.endpoint = endpoint;
    this.pubPrefix = pubPrefix;
    this.pubFwHint = pubFwHint;
    this.pubSigner = pubSigner;
    this.notifyInterestLifetime = notifyInterestLifetime;
    this.notifyRetx = notifyRetx;
    this.messagePrefix = pubPrefix.append(MsgSuffix);
    this.messageProducer = this.endpoint.produce(this.messagePrefix, this.handleMessageInterest, {
      describe: `prps-pub(${pubPrefix})`,
      announcement: pubAnnouncement ?? pubFwHint ?? pubPrefix,
    });
  }

  public readonly endpoint: Endpoint;
  public readonly pubPrefix: Name;
  public readonly pubFwHint?: Name;
  private readonly pubSigner: Signer;
  private readonly notifyInterestLifetime: number;
  private readonly notifyRetx: RetxPolicy;
  private readonly messagePrefix: Name;
  private readonly messageProducer: Producer;
  private readonly pendings = new NameMap<Pending>();

  public close(): void {
    this.messageProducer.close();
  }

  public async publish(topic: Name, item: Item): Promise<void> {
    const notifyNonce = new Uint8Array(4);
    const notifyNonceDataView = asDataView(notifyNonce);
    let key: Name;
    do {
      notifyNonceDataView.setUint32(0, Math.random() * 0xFFFFFFFF);
      key = this.messagePrefix.append(...topic.comps, new Component(undefined, notifyNonce));
    } while (this.pendings.has(key));

    this.pendings.set(key, {
      topic,
      item,
    });

    try {
      const notify = new Interest();
      notify.name = topic.append(NotifySuffix);
      notify.lifetime = this.notifyInterestLifetime;
      notify.appParameters = Encoder.encode(
        new NotifyParams(this.pubPrefix, notifyNonce, this.pubFwHint));
      await notify.updateParamsDigest();
      await this.endpoint.consume(notify, {
        describe: `prps-notify(${this.pubPrefix} ${topic})`,
        retx: this.notifyRetx,
      });
    } finally {
      this.pendings.delete(key);
    }
  }

  private handleMessageInterest: ProducerHandler = async (interest) => {
    const pending = this.pendings.get(interest.name);
    if (!pending) {
      return undefined;
    }
    const { topic, item } = pending;

    let data = new Data(interest.name);
    let needSigning = true;
    if (typeof item === "function") {
      const response = await item(interest.name, topic);
      if (response instanceof Data) {
        data = response;
        needSigning = false;
      } else {
        data.content = Encoder.encode(response);
      }
    } else {
      data.content = Encoder.encode(item);
    }

    if (needSigning) {
      await this.pubSigner.sign(data);
    }
    return data;
  };
}

type Item = Encodable | PrpsPublisher.PublicationCallback;

interface Pending {
  topic: Name;
  item: Item;
}

export namespace PrpsPublisher {
  export interface Options {
    /** Endpoint for communication. */
    endpoint?: Endpoint;

    /**
     * Name prefix of the local application.
     * Default is a random local name that only works when the subscriber is on local machine.
     */
    pubPrefix?: Name;

    /** Forwarding hint of the local application. */
    pubFwHint?: Name;

    /**
     * Prefix announcement to receive msg Interests.
     * Default is pubFwHint, or pubPrefix.
     */
    pubAnnouncement?: Name | false;

    /**
     * Key to sign publications.
     * This key should be trusted to sign objects under pubPrefix.
     * Default is digest signing.
     * This may overridden on a per-publication basis by PublicationCallback returning Data.
     */
    pubSigner?: Signer;

    /** InterestLifetime of notify Interests. */
    notifyInterestLifetime?: number;

    /**
     * Retransmission policy of notify Interests.
     * Default is 2 retransmissions.
     */
    notifyRetx?: RetxPolicy;
  }

  /**
   * A callback function to generate publication packet.
   * @param name expected Data name.
   * @param topic topic name.
   * @return either a Data that is already signed, or an Encodable object to use as publication body.
   */
  export type PublicationCallback = (name: Name, topic: Name) => Promise<Data | Encodable>;
}
