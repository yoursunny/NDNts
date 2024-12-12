export interface FetchedInfo {
  size: number;
  digest: string;
}

declare global {
  function testBlobChunkSource(): Promise<FetchedInfo>;
  function testZenFS(payloadHex: string): Promise<FetchedInfo>;
}
