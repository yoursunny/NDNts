import assert from "node:assert/strict";

import { closeUplinks, openUplinks } from "@ndn/cli-common";
import { ControlParameters, FaceQuery, FaceStatus, invoke, list } from "@ndn/nfdmgmt";

await openUplinks();

for (const face of await list(FaceStatus)) {
  console.log(face.toString());
}

const res0 = await invoke("faces/create", {
  uri: "udp4://127.0.0.1:7001",
  facePersistency: ControlParameters.FacePersistency.OnDemand,
});
assert.equal(res0.statusCode, 200);
assert(res0.body !== undefined);
const body0 = ControlParameters.decodeFromResponseBody(res0);
console.log(body0.toString());
assert.equal(body0.facePersistency, ControlParameters.FacePersistency.OnDemand);
const faceId = body0.faceId!;

const res1 = await invoke("faces/update", {
  faceId,
  facePersistency: ControlParameters.FacePersistency.Permanent,
});
assert.equal(res1.statusCode, 200);
assert(res1.body !== undefined);
const body1 = ControlParameters.decodeFromResponseBody(res1);
console.log(body1.toString());
assert.equal(body1.faceId, faceId);
assert.equal(body1.facePersistency, ControlParameters.FacePersistency.Permanent);

for (const face of await list(FaceQuery({ faceId }))) {
  console.log(face.toString());
}

const res2 = await invoke("faces/destroy", {
  faceId,
});
assert.equal(res2.statusCode, 200);
assert(res2.body !== undefined);
const body2 = ControlParameters.decodeFromResponseBody(res2);
console.log(body2.toString());
assert.equal(body2.faceId, faceId);

closeUplinks();
