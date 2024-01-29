import assert from "node:assert/strict";

import { closeUplinks, openUplinks } from "@ndn/cli-common";
import { ControlParameters, invoke, list, StrategyChoice } from "@ndn/nfdmgmt";
import { Name } from "@ndn/packet";

await openUplinks();

const res0 = await invoke("strategy-choice/set", {
  name: new Name("/NDNts-nfdmgmt-interop"),
  strategy: new Name("/localhost/nfd/strategy/unknown"),
});
assert.equal(res0.statusCode, 404);

const res1 = await invoke("strategy-choice/set", {
  name: new Name("/NDNts-nfdmgmt-interop"),
  strategy: new Name("/localhost/nfd/strategy/access"),
});
assert.equal(res1.statusCode, 200);
assert.equal(res1.statusCode, 200);
assert(res1.body !== undefined);
const body1 = ControlParameters.decodeFromResponseBody(res1);
console.log(body1.toString());

for (const sc of await list(StrategyChoice)) {
  console.log(sc.toString());
}

const res2 = await invoke("strategy-choice/unset", {
  name: new Name("/NDNts-nfdmgmt-interop"),
});
assert.equal(res2.statusCode, 200);

closeUplinks();
