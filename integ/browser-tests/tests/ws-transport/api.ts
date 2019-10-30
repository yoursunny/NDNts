import { TestRecord } from "@ndn/l3face/test-fixture/transport";

declare global {
  interface Window {
    testWsTransportPair: (wsUri: string) => Promise<TestRecord>;
  }
}
