import { Endpoint, Producer as EpProducer } from "@ndn/endpoint";
import { FwFace } from "@ndn/fw";
import { Component, ComponentLike, Data, Interest, Name, NamingConvention, TT } from "@ndn/packet";
import { toHex } from "@ndn/tlv";
import assert from "minimalistic-assert";
import MultiSet from "mnemonist/multi-set";

import { DataStore } from "./mod";

/** Make packets in DataStore available for retrieval. */
export class Producer {
  private readonly prod: EpProducer;
  private readonly reg: ReturnType<Producer.PrefixRegController>;

  constructor(private readonly store: DataStore, {
    endpoint = new Endpoint(),
    describe = "repo",
    reg = Producer.PrefixRegStrip(Producer.stripNonGeneric),
  }: Producer.Options = {}) {
    this.prod = endpoint.produce(undefined, this.processInterest, { describe });
    this.reg = reg(store, this.prod.face);
  }

  public close() {
    this.reg.close();
    this.prod.close();
  }

  private processInterest = async (interest: Interest): Promise<Data|false> => {
    const found = await this.store.find(interest);
    return found ?? false;
  }
}

export namespace Producer {
  export interface Options {
    endpoint?: Endpoint;
    describe?: string;
    reg?: PrefixRegController;
  }

  /** Control prefix registrations of a repo producer. */
  export type PrefixRegController = (store: DataStore, face: Pick<FwFace, "addRoute"|"removeRoute">)
                                    => { close(): void };

  /** Register a fixed set of prefixes. */
  export function PrefixRegStatic(...prefixes: Name[]): PrefixRegController {
    return (store, face) => {
      for (const prefix of prefixes) {
        face.addRoute(prefix);
      }
      return { close: () => undefined };
    };
  }

  /**
   * Register prefixes derived from Data names.
   * @param transform a function that accepts Data name and returns registered prefix name;
   *                  it must return the same value for the same argument.
   *
   * Warning: this may misbehave when expireTime option is being used.
   */
  export function PrefixRegDynamic(transform: (name: Name) => Name): PrefixRegController {
    return (store, face) => {
      const regs = new MultiSet<string>();
      const handleInsert = (name: Name) => {
        const prefix = transform(name);
        const prefixKey = toHex(prefix.value);
        if (!regs.has(prefixKey)) { face.addRoute(prefix); }
        regs.add(prefixKey);
      };
      const handleDelete = (name: Name) => {
        const prefix = transform(name);
        const prefixKey = toHex(prefix.value);
        assert(regs.has(prefixKey));
        regs.remove(prefixKey);
        if (!regs.has(prefixKey)) { face.removeRoute(prefix); }
      };

      store.mutex(async () => {
        for await (const name of store.listNames()) {
          handleInsert(name);
        }
      });
      store.on("insert", handleInsert);
      store.on("delete", handleDelete);
      return {
        close() {
          store.off("insert", handleInsert);
          store.off("delete", handleDelete);
        },
      };
    };
  }

  /** Register prefixes k components shorter than Data names. */
  export function PrefixRegShorter(k: number): PrefixRegController {
    assert(k >= 0);
    return PrefixRegDynamic((name) => name.getPrefix(-k));
  }

  type ComponentPredicate = ComponentLike | ((comp: Component) => boolean) | NamingConvention<unknown, unknown>;

  function isConvention(pred: any): pred is NamingConvention<unknown, unknown> {
    return typeof pred.match === "function";
  }

  /** Register prefixes after stripping last few components matching a predicate. */
  export function PrefixRegStrip(...predicates: ComponentPredicate[]): PrefixRegController {
    const preds = predicates.map((pred) => {
      if (typeof pred === "function") { return pred; }
      if (isConvention(pred)) { return (c: Component) => pred.match(c); }
      const comp = Component.from(pred);
      return (c: Component) => c.equals(comp);
    });
    return PrefixRegDynamic((name) => {
      let i = name.length - 1;
      for (; i >= 0; --i) {
        const c = name.get(i)!;
        if (!preds.some((pred) => pred(c))) {
          break;
        }
      }
      return name.getPrefix(i + 1);
    });
  }

  /** A predicate for PrefixRegStrip that strips non-generic components. */
  export function stripNonGeneric(c: Component): boolean {
    return c.type !== TT.GenericNameComponent;
  }
}
