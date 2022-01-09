import { Component, type ComponentLike, Name, type NameLike } from "@ndn/packet";

import { defaultVersionConvention, type VersionConventionFromNumber } from "./convention";
import { type ChunkSource, serve, type ServeOptions, type Server } from "./serve/mod";

type GivenVersionOptions = {
  version: ComponentLike;
};

type MakeVersionOptions = {
  versionConvention?: VersionConventionFromNumber;
  version?: number;
};

export type ServeVersionedOptions = Omit<ServeOptions, "producerPrefix"> &
(GivenVersionOptions | MakeVersionOptions);

export function serveVersioned(prefixInput: NameLike, source: ChunkSource,
    opts: ServeVersionedOptions = {}): Server {
  let versionComp: Component;
  const { version = Date.now() } = opts;
  if (typeof version === "number") {
    const { versionConvention = defaultVersionConvention } = opts as MakeVersionOptions;
    versionComp = versionConvention.create(version);
  } else {
    versionComp = Component.from(version);
  }

  const producerPrefix = new Name(prefixInput);
  const prefix = producerPrefix.append(versionComp);
  return serve(prefix, source, {
    ...opts,
    producerPrefix,
  });
}
