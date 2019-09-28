import { TestRecord } from "@ndn/llface/test-fixture/transport";

declare global {
  interface Window {
    testWsTransportPair(wsUri: string): Promise<TestRecord>;
  }
}
