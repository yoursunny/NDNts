import type { ConsumerOptions } from "@ndn/endpoint";
import { type Component, Name } from "@ndn/packet";

export const localhostPrefix = new Name("/localhost/nfd");
export const localhopPrefix = new Name("/localhop/nfd");

/**
 * Determine the NFD management prefix.
 * @param isLocal - Whether the client is connected to a NFD local face.
 * @returns NFD management prefix.
 */
export function getPrefix(isLocal = false) {
  return isLocal ? localhostPrefix : localhopPrefix;
}

export interface CommonOptions {
  /**
   * Consumer options.
   *
   * @remarks
   * - `.describe` defaults to "nfdmgmt".
   * - `.verifier` is recommended.
   */
  cOpts?: ConsumerOptions;

  /**
   * NFD management prefix.
   * @defaultValue `getPrefix()`
   */
  prefix?: Name;
}

export function concatName(prefix: Name, subName: string, params: readonly Component[]): Name {
  return new Name([...prefix.comps, ...subName.split("/"), ...params]);
}
