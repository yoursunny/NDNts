import { Component, type ComponentLike, Name, type NameLike } from "@ndn/packet";

import { defaultVersionConvention, type VersionConventionFromNumber } from "./convention";
import { type ChunkSource, serve, type Server } from "./serve/mod";

/**
 * Start serving a segmented object with support of CanBePrefix version discovery.
 * @param prefix - Data prefix excluding version and segment components.
 * @param source - Where to read segment payload chunks.
 * @param opts - Other options.
 */
export function serveVersioned(
    prefix: NameLike,
    source: ChunkSource,
    opts: serveVersioned.Options = {},
): Server {
  const { version = Date.now(), versionConvention = defaultVersionConvention } = opts;
  const versionComp = typeof version === "number" ?
    versionConvention.create(version) : Component.from(version);

  prefix = Name.from(prefix);
  const { producerPrefix = prefix } = opts;
  return serve(prefix.append(versionComp), source, {
    ...opts,
    producerPrefix,
  });
}

export namespace serveVersioned {
  export interface Options extends serve.Options {
    /**
     * Version component or version number.
     * @defaultValue `Date.now())`
     */
    version?: ComponentLike | number;

    /**
     * Choose a version number naming convention.
     * @defaultValue `import("@ndn/naming-convention2").Version`
     *
     * @remarks
     * If `.version` is a number, it's encoded with this convention.
     */
    versionConvention?: VersionConventionFromNumber;
  }
}
