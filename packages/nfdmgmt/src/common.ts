import { Endpoint } from "@ndn/endpoint";
import { type Component, Name, noopSigning, type Verifier } from "@ndn/packet";

export const localhostPrefix = new Name("/localhost/nfd");
export const localhopPrefix = new Name("/localhop/nfd");

/**
 * Determine the NFD management prefix.
 * @param isLocal whether the client is connected to a NFD local face.
 * @returns NFD management prefix.
 */
export function getPrefix(isLocal = false) {
  return isLocal ? localhostPrefix : localhopPrefix;
}

export interface CommonOptions {
  /** Endpoint for communication. */
  endpoint?: Endpoint;

  /**
   * NFD management prefix.
   * @default getPrefix()
   */
  prefix?: Name;

  /**
   * Data verifier.
   * Default is no verification.
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

export function makeName(prefix: Name, subName: string, params: readonly Component[]): Name {
  return new Name([...prefix.comps, ...subName.split("/"), ...params]);
}
