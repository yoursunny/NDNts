export interface TestRecord {
  faces: string[];
}

declare global {
  interface Window {
    testConnectToTestbed(): Promise<TestRecord>;
  }
}
