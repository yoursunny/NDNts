export interface TestRecord {
  faces: string[];
}

declare global {
  interface Window {
    testFch(): Promise<TestRecord>;
  }
}
