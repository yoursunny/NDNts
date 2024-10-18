import { StructFieldComponentNested } from "@ndn/packet";
import { StructBuilder, StructFieldNNI, StructFieldText, StructFieldType } from "@ndn/tlv";
import { assert } from "@ndn/util";

export const TT = {
  ComponentValue: 0x21,
  PatternTag: 0x23,
  NodeId: 0x25,
  UserFnId: 0x27,
  Identifier: 0x29,
  UserFnCall: 0x31,
  FnArgs: 0x33,
  ConsOption: 0x41,
  Constraint: 0x43,
  ValueEdge: 0x51,
  PatternEdge: 0x53,
  KeyNodeId: 0x55,
  ParentId: 0x57,
  Version: 0x61,
  Node: 0x63,
  TagSymbol: 0x67,
  NamedPatternNum: 0x69,
} as const;

export const BinfmtVersion = 0x00011000;

function makeDiscriminatedUnion<U extends {}>(sb: StructBuilder<U>): void {
  const keys = StructBuilder.keysOf(sb);
  StructBuilder.evdOf(sb).afterObservers.push((target) => {
    let cnt = 0;
    for (const key of keys) {
      cnt += Number(target[key] !== undefined);
    }
    assert(cnt === 1, `exactly one of ${keys.join(" ")} must be set`);
  });
}

const buildValueEdge = new StructBuilder("ValueEdge", TT.ValueEdge)
  .add(TT.NodeId, "dest", StructFieldNNI, { required: true })
  .add(TT.ComponentValue, "value", StructFieldComponentNested, { required: true });
export class ValueEdge extends buildValueEdge.baseClass<ValueEdge>() {}
buildValueEdge.subclass = ValueEdge;

const buildUserFnArg = new StructBuilder("UserFnArg", TT.FnArgs)
  .add(TT.ComponentValue, "value", StructFieldComponentNested)
  .add(TT.PatternTag, "tag", StructFieldNNI);
export class UserFnArg extends buildUserFnArg.baseClass<UserFnArg>() {}
buildUserFnArg.subclass = UserFnArg;
makeDiscriminatedUnion(buildUserFnArg);

const buildUserFnCall = new StructBuilder("UserFnCall", TT.UserFnCall)
  .add(TT.UserFnId, "fn", StructFieldText)
  .add(TT.FnArgs, "args", StructFieldType.wrap(UserFnArg), { repeat: true });
export class UserFnCall extends buildUserFnCall.baseClass<UserFnCall>() {}
buildUserFnCall.subclass = UserFnCall;

const buildConsOption = new StructBuilder("ConsOption", TT.ConsOption)
  .add(TT.ComponentValue, "value", StructFieldComponentNested)
  .add(TT.PatternTag, "tag", StructFieldNNI)
  .add(TT.UserFnCall, "call", StructFieldType.wrap(UserFnCall));
export class ConsOption extends buildConsOption.baseClass<ConsOption>() {}
buildConsOption.subclass = ConsOption;
makeDiscriminatedUnion(buildConsOption);

const buildConstraint = new StructBuilder("Constraint", TT.Constraint)
  .add(TT.ConsOption, "options", StructFieldType.wrap(ConsOption), { repeat: true });
export class Constraint extends buildConstraint.baseClass<Constraint>() {}
buildConstraint.subclass = Constraint;

const buildPatternEdge = new StructBuilder("PatternEdge", TT.PatternEdge)
  .add(TT.NodeId, "dest", StructFieldNNI, { required: true })
  .add(TT.PatternTag, "tag", StructFieldNNI, { required: true })
  .add(TT.Constraint, "constraints", StructFieldType.wrap(Constraint), { repeat: true });
export class PatternEdge extends buildPatternEdge.baseClass<PatternEdge>() {}
buildPatternEdge.subclass = PatternEdge;

function findEdgeTo<Edge extends { dest: number }>(destination: number, a: readonly Edge[]): Edge | undefined {
  return a.find(({ dest }) => dest === destination);
}

const buildNode = new StructBuilder("Node", TT.Node)
  .add(TT.NodeId, "id", StructFieldNNI, { required: true })
  .add(TT.ParentId, "parent", StructFieldNNI)
  .add(TT.Identifier, "ruleNames", StructFieldText, { repeat: true })
  .add(TT.ValueEdge, "valueEdges", StructFieldType.wrap(ValueEdge), { repeat: true })
  .add(TT.PatternEdge, "patternEdges", StructFieldType.wrap(PatternEdge), { repeat: true })
  .add(TT.KeyNodeId, "signConstraints", StructFieldNNI, { repeat: true });
export class Node extends buildNode.baseClass<Node>() {
  public findEdgeTo(dest: number): ValueEdge | PatternEdge | undefined {
    return findEdgeTo(dest, this.valueEdges) ?? findEdgeTo(dest, this.patternEdges);
  }
}
buildNode.subclass = Node;

const buildTagSymbol = new StructBuilder("TagSymbol", TT.TagSymbol)
  .add(TT.PatternTag, "tag", StructFieldNNI, { required: true })
  .add(TT.Identifier, "identifier", StructFieldText, { required: true });
export class TagSymbol extends buildTagSymbol.baseClass<TagSymbol>() {}
buildTagSymbol.subclass = TagSymbol;

const buildLvsModel = new StructBuilder("LvsModel")
  .add(TT.Version, "version", StructFieldNNI, { required: true })
  .add(TT.NodeId, "startId", StructFieldNNI, { required: true })
  .add(TT.NamedPatternNum, "namedPatternCnt", StructFieldNNI, { required: true })
  .add(TT.Node, "nodes", StructFieldType.wrap(Node), { repeat: true })
  .add(TT.TagSymbol, "tagSymbols", StructFieldType.wrap(TagSymbol), { repeat: true });
export class LvsModel extends buildLvsModel.baseClass<LvsModel>() {}
buildLvsModel.subclass = LvsModel;
StructBuilder.evdOf(buildLvsModel).afterObservers.push((model) => {
  assert(model.version === BinfmtVersion, `LvsModel.Version 0x${model.version.toString(16)} unacceptable`);
  assert(model.startId < model.nodes.length);

  for (const [i, node] of model.nodes.entries()) {
    assert(node.id === i);

    for (const sc of node.signConstraints) {
      assert(sc < model.nodes.length);
    }

    if (node.parent === undefined) {
      assert(node.id === model.startId);
      continue;
    }
    assert(node.parent !== i && node.parent < model.nodes.length);
    const parent = model.nodes[node.parent]!;
    const ve = findEdgeTo(node.id, parent.valueEdges);
    const pe = findEdgeTo(node.id, parent.patternEdges);
    assert(Number(ve !== undefined) + Number(pe !== undefined) === 1);
  }
});
