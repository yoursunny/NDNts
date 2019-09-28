import { SerializedInBrowser } from "../../test-fixture/serialize";

declare global {
  interface Window {
    testDigestKey(): Promise<SerializedInBrowser>;
  }
}
