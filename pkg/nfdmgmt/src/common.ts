import { Endpoint } from "@ndn/endpoint";
import { type Component, Name, noopSigning, type Verifier } from "@ndn/packet";

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
   * @defaultValue
   * Endpoint on default logical forwarder.
   */
  endpoint?: Endpoint;

  /**
   * NFD management prefix.
   * @defaultValue `getPrefix()`
   */
  prefix?: Name;

  /**
   * Data verifier.
   * @defaultValue
   * No verification.
   */
  verifier?: Verifier;
}

export namespace CommonOptions {
  export function applyDefaults({
    endpoint = new Endpoint(),
    prefix = localhostPrefix,
    verifier = noopSigning,
  }: CommonOptions): Required<CommonOptions> {
    return { endpoint, prefix, verifier };
  }
}

export function concatName(prefix: Name, subName: string, params: readonly Component[]): Name {
  return new Name([...prefix.comps, ...subName.split("/"), ...params]);
}
