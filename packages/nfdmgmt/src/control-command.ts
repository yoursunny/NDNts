import { Endpoint } from "@ndn/endpoint";
import { Component, digestSigning, Interest, Name, SignedInterestPolicy, type Signer, TT } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";

import { ControlParameters } from "./control-parameters";
import { ControlResponse } from "./control-response";

/**
 * Pick fields from ControlParameters.Fields.
 * R are required.
 * O are optional.
 */
type CP<R extends keyof ControlParameters.Fields, O extends keyof ControlParameters.Fields> =
  Required<Pick<ControlParameters.Fields, R>> & Pick<ControlParameters.Fields, O>;

/** Declare required and optional fields of each command. */
interface Commands {
  "faces/create": CP<"uri", "localUri" | "facePersistency" | "baseCongestionMarkingInterval" |
  "defaultCongestionThreshold" | "mtu" | "flags" | "mask">;
  "faces/update": CP<never, "faceId" | "facePersistency" | "baseCongestionMarkingInterval" |
  "defaultCongestionThreshold" | "flags" | "mask">;
  "faces/destroy": CP<"faceId", never>;
  "strategy-choice/set": CP<"name" | "strategy", never>;
  "strategy-choice/unset": CP<"name", never>;
  "rib/register": CP<"name", "faceId" | "origin" | "cost" | "flags" | "expirationPeriod">;
  "rib/unregister": CP<"name", "faceId" | "origin">;
}

const defaultSIP = new SignedInterestPolicy(SignedInterestPolicy.Nonce(), SignedInterestPolicy.Time());

/** NFD Management - Control Command client. */
export namespace ControlCommand {
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

  export interface Options {
    /** Endpoint for communication. */
    endpoint?: Endpoint;

    /**
     * NFD management prefix.
     * @default getPrefix()
     */
    commandPrefix?: Name;

    /**
     * Command Interest signer.
     * Default is digest signing.
     */
    signer?: Signer;

    /**
     * Signed Interest policy for the command Interest.
     * Default is including SigNonce and SigTime in the signed Interest.
     */
    signedInterestPolicy?: SignedInterestPolicy;
  }

  /**
   * Invoke a command and wait for response.
   * @param command command module and verb.
   * @param params command parameters.
   * @returns command response.
   */
  export async function call<C extends keyof Commands>(command: C, params: Commands[C], {
    endpoint = new Endpoint(),
    commandPrefix: prefix = localhostPrefix,
    signer = digestSigning,
    signedInterestPolicy = defaultSIP,
  }: Options = {}): Promise<ControlResponse> {
    const interest = new Interest(new Name([
      ...prefix.comps,
      ...command.split("/"),
      new Component(TT.GenericNameComponent, Encoder.encode(new ControlParameters(params))),
    ]));
    await signedInterestPolicy.makeSigner(signer).sign(interest);

    const data = await endpoint.consume(interest, { describe: `ControlCommand(${command})` });
    return Decoder.decode(data.content, ControlResponse);
  }
}
