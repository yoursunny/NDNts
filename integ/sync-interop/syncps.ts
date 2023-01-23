import { exitClosers, openUplinks } from "@ndn/cli-common";
import { Data, Name } from "@ndn/packet";
import { makeSyncpsCompatParam, SyncpsPubsub } from "@ndn/sync";
import { console } from "@ndn/util";

const syncPrefix = new Name("/syncps-interop");
const ownName = new Name(`/syncps-interop-data/NDNts/${Date.now()}`);

await openUplinks();

const sync = new SyncpsPubsub({
  p: makeSyncpsCompatParam(),
  syncPrefix,
});
exitClosers.unshift(sync);
if (process.env.NDNTS_SYNC_DEBUG === "1") {
  sync.on("debug", ({ action, name, content }) => {
    console.log(`DEBUG ${action} ${name ?? ""
    } ${content ? `[${content.map((name) => `${name}`).join(",")}]` : ""}`);
  });
}

const sub = sync.subscribe(new Name("/syncps-interop-data"));
sub.on("update", ({ name }) => {
  console.log(`UPDATE ${name}`);
});

let seqNum = 0;
exitClosers.addTimeout(setInterval(() => {
  const pub = new Data(ownName.append(`${++seqNum}`));
  console.log(`PUBLISH ${pub.name}`);
  void sync.publish(pub, ({ name }, confirmed) => {
    console.log(`${confirmed ? "CONFIRM" : "LOST"} ${name}`);
  });
}, 600));
