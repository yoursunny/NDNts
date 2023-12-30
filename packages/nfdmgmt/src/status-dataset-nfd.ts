import { Component, StructFieldName, StructFieldNameNested, TT as l3TT } from "@ndn/packet";
import { Encoder, EvDecoder, StructBuilder, StructFieldEnum, StructFieldNNI, StructFieldNNIBig, type StructFields, StructFieldText, StructFieldType } from "@ndn/tlv";

import { CsFlags, FaceFlags, FacePersistency, FaceScope, LinkType, RouteFlags, TT } from "./an-nfd";
import type { StatusDataset } from "./status-dataset-generic";

const buildFaceStatus = new StructBuilder("FaceStatus", TT.FaceStatus)
  .add(TT.FaceId, "faceId", StructFieldNNI, { required: true })
  .add(TT.Uri, "uri", StructFieldText, { required: true })
  .add(TT.LocalUri, "localUri", StructFieldText, { required: true })
  .add(TT.ExpirationPeriod, "expirationPeriod", StructFieldNNI)
  .add(TT.FaceScope, "faceScope", StructFieldEnum(FaceScope), { required: true })
  .add(TT.FacePersistency, "facePersistency", StructFieldEnum(FacePersistency), { required: true })
  .add(TT.LinkType, "linkType", StructFieldEnum(LinkType), { required: true })
  .add(TT.BaseCongestionMarkingInterval, "baseCongestionMarkingInterval", StructFieldNNI)
  .add(TT.DefaultCongestionThreshold, "defaultCongestionThreshold", StructFieldNNI)
  .add(TT.Mtu, "mtu", StructFieldNNI)
  .add(TT.NInInterests, "nInInterests", StructFieldNNIBig, { required: true })
  .add(TT.NInData, "nInData", StructFieldNNIBig, { required: true })
  .add(TT.NInNacks, "nInNacks", StructFieldNNIBig, { required: true })
  .add(TT.NOutInterests, "nOutInterests", StructFieldNNIBig, { required: true })
  .add(TT.NOutData, "nOutData", StructFieldNNIBig, { required: true })
  .add(TT.NOutNacks, "nOutNacks", StructFieldNNIBig, { required: true })
  .add(TT.NInBytes, "nInBytes", StructFieldNNIBig, { required: true })
  .add(TT.NOutBytes, "nOutBytes", StructFieldNNIBig, { required: true })
  .add(TT.Flags, "flags", StructFieldNNI, { required: true, flagPrefix: "flag", flagBits: FaceFlags })
  .setIsCritical(EvDecoder.neverCritical);
/** NFD faces/list and faces/query dataset item. */
export class FaceStatus extends buildFaceStatus.baseClass<FaceStatus>() {
  public static datasetName = "faces/list";
}
buildFaceStatus.subclass = FaceStatus satisfies StatusDataset<FaceStatus>;

const buildFaceQueryFilter = new StructBuilder("FaceQueryFilter", TT.FaceQueryFilter)
  .add(TT.FaceId, "faceId", StructFieldNNI)
  .add(TT.UriScheme, "uriScheme", StructFieldText)
  .add(TT.Uri, "uri", StructFieldText)
  .add(TT.LocalUri, "localUri", StructFieldText)
  .add(TT.ExpirationPeriod, "expirationPeriod", StructFieldNNI)
  .add(TT.FaceScope, "faceScope", StructFieldEnum(FaceScope))
  .add(TT.FacePersistency, "facePersistency", StructFieldEnum(FacePersistency))
  .add(TT.LinkType, "linkType", StructFieldEnum(LinkType))
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
  export type Filter = Partial<StructFields<typeof buildFaceQueryFilter>>;
}

const buildChannelStatus = new StructBuilder("ChannelStatus", TT.ChannelStatus)
  .add(TT.LocalUri, "localUri", StructFieldText, { required: true })
  .setIsCritical(EvDecoder.neverCritical);
/** NFD faces/channel dataset item. */
export class ChannelStatus extends buildChannelStatus.baseClass<ChannelStatus>() {
  public static datasetName = "faces/channels";
}
buildChannelStatus.subclass = ChannelStatus satisfies StatusDataset<ChannelStatus>;

const buildCsInfo = new StructBuilder("CsInfo", TT.CsInfo)
  .add(TT.Capacity, "capacity", StructFieldNNIBig, { required: true })
  .add(TT.Flags, "flags", StructFieldNNI, { required: true, flagPrefix: "flag", flagBits: CsFlags })
  .add(TT.NCsEntries, "nCsEntries", StructFieldNNIBig, { required: true })
  .add(TT.NHits, "nHits", StructFieldNNIBig, { required: true })
  .add(TT.NMisses, "nMisses", StructFieldNNIBig, { required: true })
  .setIsCritical(EvDecoder.neverCritical);
/** NFD cs/info dataset item. */
export class CsInfo extends buildCsInfo.baseClass<CsInfo>() {
  public static datasetName = "cs/info";
}
buildCsInfo.subclass = CsInfo satisfies StatusDataset<CsInfo>;

const buildStrategyChoice = new StructBuilder("StrategyChoice", TT.StrategyChoice)
  .add(l3TT.Name, "name", StructFieldName, { required: true })
  .add(TT.Strategy, "strategy", StructFieldNameNested, { required: true })
  .setIsCritical(EvDecoder.neverCritical);
/** NFD strategy-choice/list dataset item. */
export class StrategyChoice extends buildStrategyChoice.baseClass<StrategyChoice>() {
  public static datasetName = "strategy-choice/list";
}
buildStrategyChoice.subclass = StrategyChoice satisfies StatusDataset<StrategyChoice>;

const buildRoute = new StructBuilder("Route")
  .add(TT.FaceId, "faceId", StructFieldNNI, { required: true })
  .add(TT.Origin, "origin", StructFieldNNI, { required: true })
  .add(TT.Cost, "cost", StructFieldNNI, { required: true })
  .add(TT.Flags, "flags", StructFieldNNI, { required: true, flagPrefix: "flag", flagBits: RouteFlags })
  .add(TT.ExpirationPeriod, "expirationPeriod", StructFieldNNI)
  .setIsCritical(EvDecoder.neverCritical);
/** NFD Route within rib/list dataset. */
export class Route extends buildRoute.baseClass<Route>() {}
buildRoute.subclass = Route;

const buildRibEntry = new StructBuilder("RibEntry", TT.RibEntry)
  .add(l3TT.Name, "name", StructFieldName, { required: true })
  .add(TT.Route, "route", StructFieldType.nest(Route), { required: true, repeat: true })
  .setIsCritical(EvDecoder.neverCritical);
/** NFD rib/list dataset item. */
export class RibEntry extends buildRibEntry.baseClass<RibEntry>() {
  public static datasetName = "rib/list";
}
buildRibEntry.subclass = RibEntry satisfies StatusDataset<RibEntry>;
