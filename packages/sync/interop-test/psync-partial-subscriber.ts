import { openUplinks } from "@ndn/cli-common";
import { Name } from "@ndn/packet";
import { makePSyncCompatParam, PSyncPartialSubscriber, PSyncZlib, Subscription } from "@ndn/sync";
import { toHex } from "@ndn/util";

const syncPrefix = new Name("/psync-interop");

(async () => {
  await openUplinks();

  const sync = new PSyncPartialSubscriber({
    p: makePSyncCompatParam({
      ibltCompression: PSyncZlib,
    }),
    syncPrefix,
  });

  const subs = new Map<string, Subscription>();

  sync.on("state", (topics) => {
    for (const topic of topics) {
      const topicHex = toHex(topic.prefix.value);
      const shouldSubscribe = Math.random() < 0.4;
      if (shouldSubscribe) {
        let sub = subs.get(topicHex);
        if (!sub) {
          console.log(`SUBSCRIBE ${topic.prefix}`);
          sub = sync.subscribe(topic);
          subs.set(topicHex, sub);
          sub.on("update", ({ id, loSeqNum, hiSeqNum }) => {
            console.log(`UPDATE ${id} ${loSeqNum}${loSeqNum === hiSeqNum ? "" : `..${hiSeqNum}`}`);
          });
        }
      } else {
        const sub = subs.get(topicHex);
        if (sub) {
          console.log(`UNSUBSCRIBE ${topic.prefix}`);
          sub.remove();
          subs.delete(topicHex);
        }
      }
    }
  });
})().catch(console.error);
