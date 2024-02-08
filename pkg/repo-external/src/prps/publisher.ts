import { Endpoint, type Producer, type ProducerHandler } from "@ndn/endpoint";
import { SequenceNum } from "@ndn/naming-convention2";
import { Component, Data, digestSigning, Interest, Name, NameMap, SignedInterestPolicy, type Signer } from "@ndn/packet";
import { type Encodable, Encoder } from "@ndn/tlv";
import { crypto } from "@ndn/util";

import { MsgSuffix, NotifyAppParam, NotifySuffix } from "./packet";

type Item = Encodable | PrpsPublisher.PublicationCallback;

interface Pending {
  topic: Name;
  item: Item;
}

const notifySIP = new SignedInterestPolicy(SignedInterestPolicy.Nonce());

/** ndn-python-repo PubSub protocol publisher. */
export class PrpsPublisher implements Disposable {
  constructor({
    endpoint = new Endpoint({ retx: 2 }),
    pubPrefix = new Name("/localhost").append(SequenceNum, 0xFFFFFFFF * Math.random()),
    pubFwHint,
    pubAnnouncement,
    pubSigner = digestSigning,
    notifyInterestLifetime = Interest.DefaultLifetime,
  }: PrpsPublisher.Options = {}) {
    this.endpoint = endpoint;
    this.pubPrefix = pubPrefix;
    this.pubFwHint = pubFwHint;
    this.pubSigner = pubSigner;
    this.notifyInterestLifetime = notifyInterestLifetime;
    this.msgProducer = this.endpoint.produce(pubPrefix.append(MsgSuffix), this.handleMsgInterest, {
      describe: `prps-pub(${pubPrefix})`,
      announcement: pubAnnouncement ?? pubFwHint ?? pubPrefix,
    });
  }

  public readonly endpoint: Endpoint;
  public readonly pubPrefix: Name;
  public readonly pubFwHint?: Name;
  private readonly pubSigner: Signer;
  private readonly notifyInterestLifetime: number;
  private readonly msgProducer: Producer;
  private readonly pendings = new NameMap<Pending>();

  public [Symbol.dispose](): void {
    this.msgProducer.close();
  }

  /**
   * Publish an item.
   * @param topic - Topic name.
   * @param item - An Encodable to be published, or a function to generate one.
   * @returns Promise that resolves when the publication has reached a subscriber.
   */
  public async publish(topic: Name, item: Item): Promise<void> {
    const notifyNonce = new Uint8Array(8);
    let key: Name;
    do {
      crypto.getRandomValues(notifyNonce);
      key = this.pubPrefix.append(MsgSuffix, ...topic.comps, new Component(undefined, notifyNonce));
    } while (this.pendings.has(key));

    this.pendings.set(key, { topic, item });

    const notifyParam = new NotifyAppParam();
    notifyParam.publisher = this.pubPrefix;
    notifyParam.nonce = notifyNonce;
    notifyParam.publisherFwHint = this.pubFwHint;
    const notifyInterest = new Interest();
    notifyInterest.name = topic.append(NotifySuffix);
    notifyInterest.lifetime = this.notifyInterestLifetime;
    notifyInterest.appParameters = Encoder.encode(notifyParam);
    notifySIP.update(notifyInterest, this);
    await digestSigning.sign(notifyInterest);

    try {
      await this.endpoint.consume(notifyInterest, {
        describe: `prps-notify(${this.pubPrefix} ${topic})`,
      });
    } finally {
      this.pendings.delete(key);
    }
  }

  private readonly handleMsgInterest: ProducerHandler = async (interest) => {
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

export namespace PrpsPublisher {
  export interface Options {
    /**
     * Endpoint for communication.
     * @defaultValue
     * Endpoint on default logical forwarder with up to 2 retransmissions.
     */
    endpoint?: Endpoint;

    /**
     * Name prefix of the local application.
     * @defaultValue "/localhost" + random-suffix
     */
    pubPrefix?: Name;

    /** Forwarding hint of the local application. */
    pubFwHint?: Name;

    /**
     * Prefix announcement to receive msg Interests.
     * @defaultValue `.pubFwHint ?? .pubPrefix`
     */
    pubAnnouncement?: Name | false;

    /**
     * Key to sign publications.
     * @defaultValue `digestSigning`
     *
     * @remarks
     * This key should be trusted to sign objects under pubPrefix.
     * This may overridden on a per-publication basis by PublicationCallback returning Data.
     */
    pubSigner?: Signer;

    /** InterestLifetime of notify Interests. */
    notifyInterestLifetime?: number;
  }

  /**
   * A callback function to generate publication packet.
   * @param name - Expected Data name.
   * @param topic - Topic name.
   * @returns Either a Data that is already signed, or an Encodable to use as publication body.
   */
  export type PublicationCallback = (name: Name, topic: Name) => Promise<Data | Encodable>;
}
