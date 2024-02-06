import { Component, StructFieldName, StructFieldNameNested, TT as l3TT } from "@ndn/packet";
import { EvDecoder, StructBuilder, StructFieldBytes, StructFieldNNI, StructFieldType } from "@ndn/tlv";

export interface Verb {
  action: Component;
  check: Component;
}

export const InsertVerb = {
  action: new Component(undefined, "insert"),
  check: new Component(undefined, "insert check"),
};

export const DeleteVerb = {
  action: new Component(undefined, "delete"),
  check: new Component(undefined, "delete check"),
};

const enum TT {
  StartBlockId = 0xCC,
  EndBlockId = 0xCD,
  RequestNo = 0xCE,
  StatusCode = 0xD0,
  InsertNum = 0xD1,
  DeleteNum = 0xD2,
  ForwardingHint = 0xD3,
  RegisterPrefix = 0xD4,
  CheckPrefix = 0xD5,
  ObjectParam = 0x12D,
  ObjectResult = 0x12E,
}

const buildObjectParam = new StructBuilder("ObjectParam", TT.ObjectParam)
  .add(l3TT.Name, "name", StructFieldName, { required: true })
  .add(TT.ForwardingHint, "fwHint", StructFieldNameNested)
  .add(TT.StartBlockId, "startBlockId", StructFieldNNI)
  .add(TT.EndBlockId, "endBlockId", StructFieldNNI)
  .add(TT.RegisterPrefix, "registerPrefix", StructFieldNameNested)
  .setIsCritical(EvDecoder.alwaysCritical);
/** ndn-python-repo ObjectParam struct. */
export class ObjectParam extends buildObjectParam.baseClass<ObjectParam>() {}
buildObjectParam.subclass = ObjectParam;

const buildObjectResult = new StructBuilder("ObjectResult", TT.ObjectResult)
  .add(l3TT.Name, "name", StructFieldName, { required: true })
  .add(TT.StatusCode, "statusCode", StructFieldNNI, { required: true })
  .add(TT.InsertNum, "insertNum", StructFieldNNI)
  .add(TT.DeleteNum, "deleteNum", StructFieldNNI)
  .setIsCritical(EvDecoder.alwaysCritical);
/** ndn-python-repo ObjectResult struct. */
export class ObjectResult extends buildObjectResult.baseClass<ObjectResult>() {}
buildObjectResult.subclass = ObjectResult;

const buildCommandParam = new StructBuilder("RepoCommandParam")
  .add(TT.ObjectParam, "objectParams", StructFieldType.wrap(ObjectParam), { repeat: true })
  .setIsCritical(EvDecoder.alwaysCritical);
/** ndn-python-repo RepoCommandParam struct. */
export class CommandParam extends buildCommandParam.baseClass<CommandParam>() {}
buildCommandParam.subclass = CommandParam;

const buildCommandRes = new StructBuilder("RepoCommandRes")
  .add(TT.StatusCode, "statusCode", StructFieldNNI, { required: true })
  .add(TT.ObjectResult, "objectResults", StructFieldType.wrap(ObjectResult), { repeat: true })
  .setIsCritical(EvDecoder.alwaysCritical);
/** ndn-python-repo RepoCommandRes struct. */
export class CommandRes extends buildCommandRes.baseClass<CommandRes>() {}
buildCommandRes.subclass = CommandRes;

const buildStatQuery = new StructBuilder("RepoStatQuery")
  .add(TT.RequestNo, "requestDigest", StructFieldBytes, { required: true })
  .setIsCritical(EvDecoder.alwaysCritical);
/** ndn-python-repo RepoStatQuery struct. */
export class StatQuery extends buildStatQuery.baseClass<StatQuery>() {}
buildStatQuery.subclass = StatQuery;
