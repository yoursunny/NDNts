import assert from "node:assert/strict";

import { closeUplinks, openUplinks } from "@ndn/cli-common";
import { ControlCommand, ControlParameters } from "@ndn/nfdmgmt";

await openUplinks();

function facePropertiesToString(p: ControlParameters): string {
  return ([
    ["faceId", undefined],
    ["uri", undefined],
    ["localUri", undefined],
    ["facePersistency", ControlParameters.FacePersistency],
    ["baseCongestionMarkingInterval", undefined],
    ["defaultCongestionThreshold", undefined],
    ["mtu", undefined],
    ["flags", undefined],
  ] satisfies ReadonlyArray<[keyof ControlParameters, Record<number, string> | undefined]>).map(([key, Enum]) => {
    const value = p[key];
    let s = `${key}=${value}`;
    if (Enum && typeof value === "number") {
      if (Enum[value]) {
        s += `(${Enum[value]})`;
      } else {
        s += "(invalid)";
      }
    }
    return s;
  }).join(" ");
}

const res0 = await ControlCommand.call("faces/create", {
  uri: "udp4://127.0.0.1:7001",
  facePersistency: 0,
});
assert.equal(res0.statusCode, 200);
assert(res0.body !== undefined);
const body0 = ControlParameters.decodeFromResponseBody(res0);
console.log(facePropertiesToString(body0));
assert.equal(body0.facePersistency, 0);
const faceId = body0.faceId!;

const res1 = await ControlCommand.call("faces/update", {
  faceId,
  facePersistency: 2,
});
assert.equal(res1.statusCode, 200);
assert(res1.body !== undefined);
const body1 = ControlParameters.decodeFromResponseBody(res1);
console.log(facePropertiesToString(body1));
assert.equal(body1.faceId, faceId);
assert.equal(body1.facePersistency, 2);

const res2 = await ControlCommand.call("faces/destroy", {
  faceId,
});
assert.equal(res2.statusCode, 200);
assert(res2.body !== undefined);
const body2 = ControlParameters.decodeFromResponseBody(res2);
console.log(facePropertiesToString(body2));
assert.equal(body2.faceId, faceId);

closeUplinks();
