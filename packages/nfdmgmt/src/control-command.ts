import { Forwarder, SimpleEndpoint } from "@ndn/fw";
import { Interest, TT } from "@ndn/l3pkt";
import { Component, Name } from "@ndn/name";
import { Decoder, Encoder } from "@ndn/tlv";

import { ControlParameters } from "./control-parameters";
import { ControlResponse } from "./control-response";
import { signInterest02 } from "./sign-interest-02";

/**
 * Pick fields from ControlParameters.Fields.
 * R are required.
 * O are optional.
 */
type CP<R extends keyof ControlParameters.Fields, O extends keyof ControlParameters.Fields> =
  Required<Pick<ControlParameters.Fields, R>> & Pick<ControlParameters.Fields, O>;

/** Declare required and optional fields of each command. */
interface Commands {
  "face/create": CP<"uri", "localUri"|"facePersistency"|"baseCongestionMarkingInterval"|
                           "defaultCongestionPeriod"|"mtu"|"flags"|"mask">;
  "face/update": CP<never, "faceId"|"facePersistency"|"baseCongestionMarkingInterval"|
                           "defaultCongestionPeriod"|"flags"|"mask">;
  "face/destroy": CP<"faceId", never>;
  "strategy-choice/set": CP<"name"|"strategy", never>;
  "strategy-choice/unset": CP<"name", never>;
  "rib/register": CP<"name", "faceId"|"origin"|"cost"|"flags"|"expirationPeriod">;
  "rib/unregister": CP<"name", "faceId"|"origin">;
}

/** NFD Management - Control Command client. */
export namespace ControlCommand {
  export interface Options extends signInterest02.Options {
    fw?: Forwarder;
    commandPrefix?: Name;
  }

  export const localhostPrefix = new Name("/localhost/nfd");
  export const localhopPrefix = new Name("/localhop/nfd");

  /** Invoke a command and wait for response. */
  export async function call<C extends keyof Commands>(
      command: C, params: Commands[C], opt: Options = {}): Promise<ControlResponse> {
    const prefix = opt.commandPrefix || localhostPrefix;
    const name = new Name([
      ...prefix.comps,
      ...command.split("/"),
      new Component(TT.GenericNameComponent, Encoder.encode(new ControlParameters(params))),
    ]);
    const interest = await signInterest02(new Interest(name), opt);

    const ep = new SimpleEndpoint(opt.fw);
    const data = await ep.consume(interest);
    return new Decoder(data.content).decode(ControlResponse);
  }
}
