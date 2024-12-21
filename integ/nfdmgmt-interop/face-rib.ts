import assert from "node:assert/strict";

import { closeUplinks, openUplinks } from "@ndn/cli-common";
import { ControlParameters, FacePersistency, FaceQuery, FaceStatus, invoke, list, RibEntry } from "@ndn/nfdmgmt";
import { Name } from "@ndn/packet";

await openUplinks();

console.group("[FaceStatus]");
for (const face of await list(FaceStatus)) {
  console.log(face.toString());
}
console.groupEnd();
console.log();

console.group("[faces/create]");
const resF0 = await invoke("faces/create", {
  uri: "udp4://127.0.0.1:7001",
  facePersistency: FacePersistency.Permanent,
  mtu: 1300,
});
assert.equal(resF0.statusCode, 200);
const bodyF0 = ControlParameters.decodeFromResponseBody(resF0);
console.log(bodyF0.toString());
assert.equal(bodyF0.facePersistency, FacePersistency.Permanent);
assert.equal(bodyF0.mtu, 1300);
const faceId = bodyF0.faceId!;
console.groupEnd();
console.log();

console.group("[faces/update]");
const resF1 = await invoke("faces/update", {
  faceId,
  mtu: 1250,
});
assert.equal(resF1.statusCode, 200);
const bodyF1 = ControlParameters.decodeFromResponseBody(resF1);
console.log(bodyF1.toString());
assert.equal(bodyF1.faceId, faceId);
assert.equal(bodyF1.facePersistency, FacePersistency.Permanent);
assert.equal(bodyF1.mtu, 1250);
console.groupEnd();
console.log();

console.group("[FaceQuery]");
for (const face of await list(FaceQuery({ faceId }))) {
  console.log(face.toString());
}
console.groupEnd();
console.log();

console.group("[rib/register]");
const resR0 = await invoke("rib/register", {
  faceId,
  name: new Name("/NDNts-nfdmgmt-interop"),
});
assert.equal(resR0.statusCode, 200);
const bodyR0 = ControlParameters.decodeFromResponseBody(resR0);
console.log(bodyR0.toString());
assert.equal(bodyR0.faceId, faceId);
assert.equal(bodyR0.name?.toString(), "/8=NDNts-nfdmgmt-interop");
assert.equal(bodyR0.origin, 0);
assert.equal(bodyR0.flagChildInherit, true);
assert.equal(bodyR0.flagCapture, false);
console.groupEnd();
console.log();

console.group("[RibEntry]");
for (const ribEntry of await list(RibEntry)) {
  console.log(ribEntry.toString());
}
console.groupEnd();
console.log();

console.group("[rib/unregister]");
const resR1 = await invoke("rib/unregister", {
  faceId,
  name: new Name("/NDNts-nfdmgmt-interop"),
});
assert.equal(resR1.statusCode, 200);
const bodyR1 = ControlParameters.decodeFromResponseBody(resR1);
console.log(bodyR1.toString());
assert.equal(bodyR1.faceId, faceId);
assert.equal(bodyR1.name?.toString(), "/8=NDNts-nfdmgmt-interop");
assert.equal(bodyR1.origin, 0);
console.groupEnd();
console.log();

console.group("[faces/destroy]");
const resF2 = await invoke("faces/destroy", {
  faceId,
});
assert.equal(resF2.statusCode, 200);
const bodyF2 = ControlParameters.decodeFromResponseBody(resF2);
console.log(bodyF2.toString());
assert.equal(bodyF2.faceId, faceId);
console.groupEnd();
console.log();

closeUplinks();
