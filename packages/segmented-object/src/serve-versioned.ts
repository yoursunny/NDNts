import { Component, type ComponentLike, Name, type NameLike } from "@ndn/packet";

import { defaultVersionConvention, type VersionConventionFromNumber } from "./convention";
import { type ChunkSource, serve, type Server } from "./serve/mod";

type GivenVersionOptions = {
  /** Version number component. */
  version: ComponentLike;
};

type MakeVersionOptions = {
  /**
   * Choose a version number naming convention.
   * Default is Version from @ndn/naming-convention2 package.
   */
  versionConvention?: VersionConventionFromNumber;

  /**
   * Version number.
   * Default is current Unix timestamp (milliseconds).
   */
  version?: number;
};

/**
 * Start serving a segmented object with support of CanBePrefix version discovery.
 * @param prefixInput Data prefix excluding version and segment components.
 * @param source where to read segment payload chunks.
 * @param opts other options.
 */
export function serveVersioned(prefixInput: NameLike, source: ChunkSource, opts: serveVersioned.Options = {}): Server {
  let versionComp: Component;
  let { version = Date.now(), producerPrefix } = opts;
  if (typeof version === "number") {
    const { versionConvention = defaultVersionConvention } = opts as MakeVersionOptions;
    versionComp = versionConvention.create(version);
  } else {
    versionComp = Component.from(version);
  }

  const prefix = Name.from(prefixInput);
  producerPrefix ??= prefix;
  return serve(prefix.append(versionComp), source, {
    ...opts,
    producerPrefix,
  });
}

export namespace serveVersioned {
  export type Options = serve.Options & (GivenVersionOptions | MakeVersionOptions);
}
