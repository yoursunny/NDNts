import { TestRecord } from "@ndn/llface/test-fixture/transport";

export type MainFunc = (wsUri: string) => Promise<TestRecord>;

declare global {
  interface Window {
    main: MainFunc;
  }
}
