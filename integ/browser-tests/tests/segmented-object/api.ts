export interface FetchedInfo {
  size: number;
  digest: string;
}

declare global {
  interface Window {
    testBlobChunkSource(): Promise<FetchedInfo>;
  }
}
