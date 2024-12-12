export interface TestRecord {
  faces: string[];
}

declare global {
  function testConnectToNetwork(): Promise<TestRecord>;
}
