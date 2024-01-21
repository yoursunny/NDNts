export interface UpdateRecord {
  topic: string;
  seqNum: number;
}

declare global {
  interface Window {
    startPSyncPartial(uri: string): Promise<void>;
    endPSyncPartial(): Promise<UpdateRecord[]>;
  }
}
