import type { ConsumerOptions, Endpoint } from "@ndn/endpoint";
import { type Component, Name, type Verifier } from "@ndn/packet";

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
   * Endpoint for communication.
   * @deprecated Specify `.cOpts`.
   */
  endpoint?: Endpoint;

  /**
   * Consumer options.
   *
   * @remarks
   * - `.describe` defaults to "nfdmgmt".
   * - `.verifier` is recommended.
   */
  cOpts?: ConsumerOptions;

  /**
   * Data verifier.
   * @deprecated Specify in `.cOpts.verifier`.
   */
  verifier?: Verifier;

  /**
   * NFD management prefix.
   * @defaultValue `getPrefix()`
   */
  prefix?: Name;
}

export function concatName(prefix: Name, subName: string, params: readonly Component[]): Name {
  return new Name([...prefix.comps, ...subName.split("/"), ...params]);
}
