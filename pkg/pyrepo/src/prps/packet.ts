import { Component, FwHint, Interest, type Name, StructFieldName, StructFieldNameNested, TT as l3TT } from "@ndn/packet";
import { EvDecoder, StructBuilder, StructFieldBytes } from "@ndn/tlv";

export const MsgSuffix = Component.from("msg");
export const NotifySuffix = Component.from("notify");

const TT = {
  NotifyNonce: 0x80,
  PublisherFwHint: 0xD3,
} as const;

const buildNotifyAppParam = new StructBuilder("NotifyAppParam")
  .add(l3TT.Name, "publisher", StructFieldName, { required: true })
  .add(TT.NotifyNonce, "nonce", StructFieldBytes, { required: true })
  .add(TT.PublisherFwHint, "publisherFwHint", StructFieldNameNested)
  .setIsCritical(EvDecoder.alwaysCritical);
/** ndn-python-repo PubSub NotifyAppParam struct. */
export class NotifyAppParam extends buildNotifyAppParam.baseClass<NotifyAppParam>() {
  /** Create a message Interest from enclosed publisher information. */
  public makeMsgInterest(topic: Name): Interest {
    const interest = new Interest();
    interest.name = this.publisher.append(
      MsgSuffix, ...topic.comps, new Component(l3TT.GenericNameComponent, this.nonce));
    interest.fwHint = this.publisherFwHint && new FwHint(this.publisherFwHint);
    return interest;
  }
}
buildNotifyAppParam.subclass = NotifyAppParam;
