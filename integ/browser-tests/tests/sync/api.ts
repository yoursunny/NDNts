export interface UpdateRecord {
  topic: string;
  seqNum: number;
}

declare global {
  function startPSyncPartial(uri: string): Promise<void>;
  function endPSyncPartial(): Promise<UpdateRecord[]>;
}
