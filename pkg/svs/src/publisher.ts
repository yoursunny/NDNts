import { produce, type Producer, type ProducerHandler, type ProducerOptions } from "@ndn/endpoint";
import { GenericNumber } from "@ndn/naming-convention2";
import { Data, Name, type NameLike, nullSigner, type Signer } from "@ndn/packet";
import type { DataStore as S } from "@ndn/repo-api";
import { BufferChunkSource, type ChunkOptions, DataProducer } from "@ndn/segmented-object";
import type { SyncNode } from "@ndn/sync-api";
import { Encoder } from "@ndn/tlv";
import { Closer } from "@ndn/util";
import { collect, parallelMap } from "streaming-iterables";
import { Mutex } from "wait-your-turn";

import { ContentTypeEncap, MappingKeyword, TT, Version0 } from "./an";
import { MappingEntry } from "./mapping-entry";
import type { SvSync } from "./sync";

/** SVS-PS publisher. */
export class SvPublisher {
  constructor({
    pOpts,
    sync,
    id,
    store,
    chunkSize = 8000,
    innerSigner = nullSigner,
    outerSigner = nullSigner,
    mappingSigner = nullSigner,
  }: SvPublisher.Options) {
    this.node = sync.add(id);
    this.nodeSyncPrefix = id.append(...sync.syncPrefix.comps);
    this.store = store;
    this.chunkOptions = { chunkSize };
    this.innerSigner = innerSigner;
    this.outerSigner = outerSigner;

    this.outerProducer = produce(
      this.nodeSyncPrefix,
      this.handleOuter,
      {
        ...pOpts,
        describe: `SVS-PS(${id})[outer]`,
      },
    );

    this.mappingProducer = produce(
      this.nodeSyncPrefix.append(MappingKeyword),
      this.handleMapping,
      {
        ...pOpts,
        describe: `SVS-PS(${id})[mapping]`,
        dataSigner: mappingSigner,
      },
    );
  }

  private readonly node: SyncNode<Name>;
  private readonly nodeMutex = new Mutex();
  private readonly nodeSyncPrefix: Name;
  private readonly store: SvPublisher.DataStore;
  private readonly chunkOptions: ChunkOptions;
  private readonly innerSigner: Signer;
  private readonly outerSigner: Signer;
  private readonly outerProducer: Producer;
  private readonly mappingProducer: Producer;

  /** Publisher node ID. */
  public get id(): Name { return this.node.id; }

  /**
   * Stop publisher operations.
   *
   * @remarks
   * This does not stop the {@link SvSync} instance or the {@link SvPublisher.DataStore}.
   */
  public async close(): Promise<void> {
    this.outerProducer.close();
    this.mappingProducer.close();
    await Closer.close(this.store);
  }

  /**
   * Publish application data.
   * @param name - Application-specified inner name.
   * @param payload - Application payload.
   * @param entry - MappingEntry for subscriber-side filtering.
   * This is required if subscribers are expecting a certain MappingEntry subclass.
   * @returns seqNum.
   */
  public async publish(name: NameLike, payload: Uint8Array, entry = new MappingEntry()): Promise<number> {
    name = Name.from(name);
    const inner = await collect(DataProducer.listData(
      new BufferChunkSource(payload, this.chunkOptions),
      name.append(Version0),
      { signer: this.innerSigner },
    ));
    // later steps need mutex so that concurrent publishes won't have same seqNum
    return this.nodeMutex.use(() => this.publishInner(name, inner, entry));
  }

  private async publishInner(name: Name, inner: readonly Data[], entry: MappingEntry): Promise<number> {
    const seqNum = this.node.seqNum + 1;
    const seqNumComp = GenericNumber.create(seqNum);

    entry.seqNum = seqNum;
    entry.name = name;
    const mapping = new Data();
    mapping.name = this.nodeSyncPrefix.append(MappingKeyword, seqNumComp);
    mapping.content = Encoder.encode(entry);
    await nullSigner.sign(mapping);
    // single-entry mapping is inserted into DataStore but never served to subscribers directly;
    // it is for use by handleMapping only

    const finalBlockId = inner.at(-1)!.name.get(-1)!;
    const outer = parallelMap(16, async (data) => {
      const encap = new Data();
      encap.name = this.nodeSyncPrefix.append(seqNumComp, Version0, data.name.get(-1)!);
      encap.contentType = ContentTypeEncap;
      encap.freshnessPeriod = 60000;
      encap.finalBlockId = finalBlockId;
      encap.content = Encoder.encode(data);
      await this.outerSigner.sign(encap);
      return encap;
    }, inner);

    await this.store.insert(mapping, outer);
    this.node.seqNum = seqNum; // triggers sync Interest
    return seqNum;
  }

  private readonly handleOuter: ProducerHandler = async (interest) => {
    if (!interest.name.get(this.nodeSyncPrefix.length)?.is(GenericNumber)) {
      return undefined;
    }
    return this.store.find(interest);
  };

  private readonly handleMapping: ProducerHandler = async ({ name }) => {
    const loSeqNumComp = name.get(-2)!;
    const hiSeqNumComp = name.get(-1)!;
    if (name.length !== this.nodeSyncPrefix.length + 3 ||
      !loSeqNumComp.is(GenericNumber) ||
      !hiSeqNumComp.is(GenericNumber)) {
      return undefined;
    }
    const loSeqNum = loSeqNumComp.as(GenericNumber);
    const hiSeqNum = hiSeqNumComp.as(GenericNumber);

    const recordNames: Name[] = [];
    for (let i = loSeqNum; i <= hiSeqNum; ++i) {
      recordNames.push(this.nodeSyncPrefix.append(MappingKeyword, GenericNumber.create(i)));
    }
    const entries = await Promise.all(recordNames.map(async (recordName) => {
      const record = await this.store.get(recordName);
      return record?.content;
    }));
    const payload = Encoder.encode([
      TT.MappingData,
      this.node.id,
      ...entries,
    ]);
    return new Data(name, payload);
  };
}

export namespace SvPublisher {
  /* eslint-disable tsdoc/syntax -- tsdoc-missing-reference */
  /**
   * Data repository used by publisher.
   *
   * @remarks
   * Possible implementations include but are not limited to:
   * - {@link \@ndn/repo!DataStore} (faster, disk-persistency option, larger code size)
   * - {@link \@ndn/repo-api!DataArray} (slower, in-memory only, smaller code size)
   */
  /* eslint-enable tsdoc/syntax */
  export type DataStore = S.Get & S.Find & S.Insert;

  export interface Options {
    /**
     * Producer options.
     *
     * @remarks
     * - `.describe` is overridden as "SVS-PS" + prefix.
     * - `.dataSigner` is overridden.
     */
    pOpts?: ProducerOptions;

    /**
     * SvSync instance.
     *
     * @remarks
     * Multiple {@link SvSubscriber}s and {@link SvPublisher}s may reuse the same SvSync instance.
     * However, publications from a publisher cannot reach subscribers on the same SvSync instance.
     */
    sync: SvSync;

    /**
     * Publisher node ID.
     *
     * @remarks
     * Each publisher must have a unique node ID.
     */
    id: Name;

    /** Data repository used for this publisher. */
    store: DataStore;

    /**
     * Segment chunk size of inner Data packet.
     * @defaultValue 8000
     */
    chunkSize?: number;

    /**
     * Inner Data signer.
     * @defaultValue nullSigner
     */
    innerSigner?: Signer;

    /**
     * Outer Data signer.
     * @defaultValue nullSigner
     */
    outerSigner?: Signer;

    /**
     * Mapping Data signer.
     * @defaultValue nullSigner
     */
    mappingSigner?: Signer;
  }
}
