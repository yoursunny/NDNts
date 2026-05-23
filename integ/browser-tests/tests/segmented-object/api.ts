export interface FetchedInfo {
  size: number;
  digest: string;
}

declare global {
  function testBlobChunkSource(): Promise<FetchedInfo>;
}
