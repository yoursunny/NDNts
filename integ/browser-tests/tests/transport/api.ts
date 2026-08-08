import type { TestRecord } from "@ndn/l3face/test-fixture/transport";

declare global {
  function connectWsTransportPair(uri: string): Promise<void>;
  function testWsTransportPair(): Promise<TestRecord>;
}
