import { Endpoint, type Producer, type ProducerHandler } from "@ndn/endpoint";
import { GenericNumber } from "@ndn/naming-convention2";
import { Data, Name, type NameLike, nullSigner, type Signer } from "@ndn/packet";
import type { DataStore as S } from "@ndn/repo-api";
import { BufferChunkSource, type ChunkOptions, DataProducer } from "@ndn/segmented-object";
import type { SyncNode } from "@ndn/sync-api";
import { Encoder } from "@ndn/tlv";
import { Closers } from "@ndn/util";
import { collect, map } from "streaming-iterables";

import { ContentTypeEncap, MappingKeyword, TT, Version0 } from "./an";
import { SvMappingEntry } from "./mapping-entry";
import type { SvSync } from "./sync";

/** SVS-PS publisher. */
export class SvPublisher {
  constructor({
    endpoint = new Endpoint(),
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

    this.outerProducer = endpoint.produce(
      this.nodeSyncPrefix,
      this.handleOuter,
      {
        describe: `SVS-PS(${id})[outer]`,
      },
    );

    this.mappingProducer = endpoint.produce(
      this.nodeSyncPrefix.append(MappingKeyword),
      this.handleMapping,
      {
        describe: `SVS-PS(${id})[mapping]`,
        dataSigner: mappingSigner,
      },
    );
  }

  private readonly node: SyncNode<Name>;
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
    await Closers.close(this.store);
  }

  /**
   * Publish application data.
   * @param name - Application-specified inner name.
   * @param payload - Application payload.
   * @param entry - MappingEntry for subscriber-side filtering.
   * This is required if subscribers are expecting a certain MappingEntry subclass.
   * @returns seqNum.
   */
  public async publish(name: NameLike, payload: Uint8Array, entry = new SvMappingEntry()): Promise<number> {
    name = Name.from(name);
    const inner = await collect(DataProducer.listData(
      new BufferChunkSource(payload, this.chunkOptions),
      name.append(Version0),
      { signer: this.innerSigner },
    ));
    const finalBlockId = inner.at(-1)!.name.get(-1)!;

    const seqNum = this.node.seqNum + 1;
    const seqNumComp = GenericNumber.create(seqNum);

    entry.seqNum = seqNum;
    entry.name = name;
    const mapping = new Data(this.nodeSyncPrefix.append(MappingKeyword, seqNumComp), Encoder.encode(entry));
    await nullSigner.sign(mapping);

    const outer = map(async (data) => {
      const encap = new Data(
        this.nodeSyncPrefix.append(seqNumComp, Version0, data.name.get(-1)!),
        Data.ContentType(ContentTypeEncap),
        Data.FreshnessPeriod(60000),
        Encoder.encode(data),
      );
      encap.finalBlockId = finalBlockId;
      await this.outerSigner.sign(encap);
      return encap;
    }, inner);

    await this.store.insert(mapping, outer);
    this.node.seqNum = seqNum;
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
   * {@link \@ndn/repo!DataStore} satisfies the requirement.
   * Other lightweight implementations may be possible.
   */
  /* eslint-enable tsdoc/syntax */
  export type DataStore = S.Get & S.Find & S.Insert;

  export interface Options {
    /**
     * Endpoint for communication.
     * @defaultValue
     * Endpoint on default logical forwarder.
     */
    endpoint?: Endpoint;

    /**
     * SvSync instance.
     *
     * @remarks
     * Multiple {@link SvSubscriber}s and {@link SvPublisher}s may reuse the same SvSync instance.
     * However, publications from a publisher cannot reach subscribers on the same SvSync instance.
     */
    sync: SvSync;

    /** Publisher node ID. */
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
