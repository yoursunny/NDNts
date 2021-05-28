export interface TestRecord {
  faces: string[];
}

declare global {
  interface Window {
    testConnectToNetwork: () => Promise<TestRecord>;
  }
}
