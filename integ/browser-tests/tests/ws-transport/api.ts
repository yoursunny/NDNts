import type { TestRecord } from "@ndn/l3face/test-fixture/transport";

declare global {
  interface Window {
    connectWsTransportPair: (uri: string) => Promise<void>;
    testWsTransportPair: () => Promise<TestRecord>;
  }
}
