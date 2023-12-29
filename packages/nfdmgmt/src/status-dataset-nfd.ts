import { Component, StructFieldName, StructFieldNameNested, TT } from "@ndn/packet";
import { Encoder, EvDecoder, StructBuilder, StructFieldNNI, StructFieldNNIBig, StructFieldText, StructFieldType } from "@ndn/tlv";
import type { ConditionalExcept } from "type-fest";

import type { StatusDataset } from "./status-dataset-generic";

const buildFaceStatus = new StructBuilder("FaceStatus", 0x80)
  .add(0x69, "faceId", StructFieldNNI, { required: true })
  .add(0x72, "uri", StructFieldText, { required: true })
  .add(0x81, "localUri", StructFieldText, { required: true })
  .add(0x6D, "expirationPeriod", StructFieldNNI)
  .add(0x84, "faceScope", StructFieldNNI, { required: true })
  .add(0x85, "facePersistency", StructFieldNNI, { required: true })
  .add(0x86, "linkType", StructFieldNNI, { required: true })
  .add(0x87, "baseCongestionMarkingInterval", StructFieldNNI)
  .add(0x88, "defaultCongestionThreshold", StructFieldNNI)
  .add(0x89, "mtu", StructFieldNNI)
  .add(0x90, "nInInterests", StructFieldNNIBig, { required: true })
  .add(0x91, "nInData", StructFieldNNIBig, { required: true })
  .add(0x97, "nInNacks", StructFieldNNIBig, { required: true })
  .add(0x92, "nOutInterests", StructFieldNNIBig, { required: true })
  .add(0x93, "nOutData", StructFieldNNIBig, { required: true })
  .add(0x98, "nOutNacks", StructFieldNNIBig, { required: true })
  .add(0x94, "nInBytes", StructFieldNNIBig, { required: true })
  .add(0x95, "nOutBytes", StructFieldNNIBig, { required: true })
  .add(0x6C, "flags", StructFieldNNI, { required: true })
  .setIsCritical(EvDecoder.neverCritical);
/** NFD faces/list and faces/query dataset item. */
export class FaceStatus extends buildFaceStatus.baseClass<FaceStatus>() {
  public static datasetName = "faces/list";
}
buildFaceStatus.subclass = FaceStatus satisfies StatusDataset<FaceStatus>;

const buildFaceQueryFilter = new StructBuilder("FaceQueryFilter", 0x96)
  .add(0x69, "faceId", StructFieldNNI)
  .add(0x83, "uriScheme", StructFieldText)
  .add(0x72, "uri", StructFieldText)
  .add(0x81, "localUri", StructFieldText)
  .add(0x6D, "expirationPeriod", StructFieldNNI)
  .add(0x84, "faceScope", StructFieldNNI)
  .add(0x85, "facePersistency", StructFieldNNI)
  .add(0x86, "linkType", StructFieldNNI)
  .setIsCritical(EvDecoder.neverCritical);
/** NFD faces/query dataset parameter. */
export class FaceQueryFilter extends buildFaceQueryFilter.baseClass<FaceQueryFilter>() {}
buildFaceQueryFilter.subclass = FaceQueryFilter;

export function FaceQuery(filter: FaceQuery.Filter): StatusDataset<FaceStatus> {
  return {
    datasetName: "faces/query",
    datasetParams: [new Component(undefined, Encoder.encode(Object.assign(new FaceQueryFilter(), filter)))],
    decodeFrom: FaceStatus.decodeFrom,
  };
}
export namespace FaceQuery {
  export type Filter = Partial<ConditionalExcept<FaceQueryFilter, Function>>;
}

const buildChannelStatus = new StructBuilder("ChannelStatus", 0x82)
  .add(0x81, "localUri", StructFieldText, { required: true })
  .setIsCritical(EvDecoder.neverCritical);
/** NFD faces/channel dataset item. */
export class ChannelStatus extends buildChannelStatus.baseClass<ChannelStatus>() {
  public static datasetName = "faces/channels";
}
buildChannelStatus.subclass = ChannelStatus satisfies StatusDataset<ChannelStatus>;

const buildCsInfo = new StructBuilder("CsInfo", 0x80)
  .add(0x83, "capacity", StructFieldNNIBig, { required: true })
  .add(0x6C, "flags", StructFieldNNI, { required: true })
  .add(0x87, "nCsEntries", StructFieldNNIBig, { required: true })
  .add(0x81, "nHits", StructFieldNNIBig, { required: true })
  .add(0x82, "nMisses", StructFieldNNIBig, { required: true })
  .setIsCritical(EvDecoder.neverCritical);
/** NFD cs/info dataset item. */
export class CsInfo extends buildCsInfo.baseClass<CsInfo>() {
  public static datasetName = "cs/info";
}
buildCsInfo.subclass = CsInfo satisfies StatusDataset<CsInfo>;

const buildStrategyChoice = new StructBuilder("StrategyChoice", 0x80)
  .add(TT.Name, "name", StructFieldName, { required: true })
  .add(0x6B, "strategy", StructFieldNameNested, { required: true })
  .setIsCritical(EvDecoder.neverCritical);
/** NFD strategy-choice/list dataset item. */
export class StrategyChoice extends buildStrategyChoice.baseClass<StrategyChoice>() {
  public static datasetName = "strategy-choice/list";
}
buildStrategyChoice.subclass = StrategyChoice satisfies StatusDataset<StrategyChoice>;

const buildRoute = new StructBuilder("Route")
  .add(0x69, "faceId", StructFieldNNI, { required: true })
  .add(0x6F, "origin", StructFieldNNI, { required: true })
  .add(0x6A, "cost", StructFieldNNI, { required: true })
  .add(0x6C, "flags", StructFieldNNI, { required: true })
  .add(0x6D, "expirationPeriod", StructFieldNNI)
  .setIsCritical(EvDecoder.neverCritical);
/** NFD Route within rib/list dataset. */
export class Route extends buildRoute.baseClass<Route>() {}
buildRoute.subclass = Route;

const buildRibEntry = new StructBuilder("RibEntry", 0x80)
  .add(TT.Name, "name", StructFieldName, { required: true })
  .add(0x81, "route", StructFieldType.nest(Route), { required: true, repeat: true })
  .setIsCritical(EvDecoder.neverCritical);
/** NFD rib/list dataset item. */
export class RibEntry extends buildRibEntry.baseClass<RibEntry>() {
  public static datasetName = "rib/list";
}
buildRibEntry.subclass = RibEntry satisfies StatusDataset<RibEntry>;
