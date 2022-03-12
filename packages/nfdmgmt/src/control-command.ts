import { Endpoint } from "@ndn/endpoint";
import { type Signer, Component, digestSigning, Interest, Name, SignedInterestPolicy, TT } from "@ndn/packet";
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
  "face/create": CP<"uri", "localUri" | "facePersistency" | "baseCongestionMarkingInterval" |
  "defaultCongestionPeriod" | "mtu" | "flags" | "mask">;
  "face/update": CP<never, "faceId" | "facePersistency" | "baseCongestionMarkingInterval" |
  "defaultCongestionPeriod" | "flags" | "mask">;
  "face/destroy": CP<"faceId", never>;
  "strategy-choice/set": CP<"name" | "strategy", never>;
  "strategy-choice/unset": CP<"name", never>;
  "rib/register": CP<"name", "faceId" | "origin" | "cost" | "flags" | "expirationPeriod">;
  "rib/unregister": CP<"name", "faceId" | "origin">;
}

const defaultSIP = new SignedInterestPolicy(SignedInterestPolicy.Nonce(), SignedInterestPolicy.Time());

/** NFD Management - Control Command client. */
export namespace ControlCommand {
  export interface Options {
    endpoint?: Endpoint;
    commandPrefix?: Name;
    signer?: Signer;
    signedInterestPolicy?: SignedInterestPolicy;
  }

  export const localhostPrefix = new Name("/localhost/nfd");
  export const localhopPrefix = new Name("/localhop/nfd");

  export function getPrefix(isLocal?: boolean) {
    return (isLocal ?? false) ? localhostPrefix : localhopPrefix;
  }

  /** Invoke a command and wait for response. */
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
    return new Decoder(data.content).decode(ControlResponse);
  }
}
