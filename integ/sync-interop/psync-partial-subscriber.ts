import { exitClosers, openUplinks } from "@ndn/cli-common";
import { Name } from "@ndn/packet";
import { type Subscription, makePSyncCompatParam, PSyncPartialSubscriber, PSyncZlib } from "@ndn/sync";
import { console } from "@ndn/util";

const syncPrefix = new Name("/psync-interop");

await openUplinks();

const sync = new PSyncPartialSubscriber({
  p: makePSyncCompatParam({
    ibltCompression: PSyncZlib,
  }),
  syncPrefix,
});
exitClosers.push(sync);

const subs = new Map<string, Subscription>();

sync.on("state", (topics) => {
  for (const topic of topics) {
    const shouldSubscribe = Math.random() < 0.4;
    if (shouldSubscribe) {
      let sub = subs.get(topic.prefix.valueHex);
      if (!sub) {
        console.log(`SUBSCRIBE ${topic.prefix}`);
        sub = sync.subscribe(topic);
        subs.set(topic.prefix.valueHex, sub);
        sub.on("update", ({ id, loSeqNum, hiSeqNum }) => {
          console.log(`UPDATE ${id} ${loSeqNum}${loSeqNum === hiSeqNum ? "" : `..${hiSeqNum}`}`);
        });
      }
    } else {
      const sub = subs.get(topic.prefix.valueHex);
      if (sub) {
        console.log(`UNSUBSCRIBE ${topic.prefix}`);
        sub.remove();
        subs.delete(topic.prefix.valueHex);
      }
    }
  }
});
