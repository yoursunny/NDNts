import { Forwarder, FwFace, FwTracer } from "@ndn/fw";
import { KeyChain, PrivateKey } from "@ndn/keychain";
import { L3Face } from "@ndn/l3face";
import { Interest } from "@ndn/l3pkt";
import { Name } from "@ndn/name";
import { Segment as Segment1, Version as Version1 } from "@ndn/naming-convention1";
import { Segment as Segment2, Version as Version2 } from "@ndn/naming-convention2";
import { ControlCommand, enableNfdPrefixReg } from "@ndn/nfdmgmt";
import { SocketTransport } from "@ndn/node-transport";

export interface CommonArgs {
  pkttrace: boolean;
  router: string;
  nfd: boolean;
  regkeychain?: string;
  regkey?: string;
  reglocalhop: boolean;
  convention1: boolean;
}

export let versionConvention = Version2;
export let segmentNumConvention = Segment2;
export let uplink: FwFace;

export async function applyCommonArgs(args: CommonArgs) {
  if (args.pkttrace) {
    FwTracer.enable();
  }

  if (args.convention1) {
    versionConvention = Version1;
    segmentNumConvention = Segment1;
  }

  uplink = Forwarder.getDefault().addFace(new L3Face(
    await SocketTransport.connect({ port: 6363, host: args.router })));
  uplink.addRoute(new Name());

  if (args.nfd) {
    let signer: PrivateKey|undefined;
    if (args.regkeychain) {
      const keyChain = KeyChain.open(args.regkeychain);
      const keyNames = await keyChain.listKeys(new Name(args.regkey));
      if (keyNames.length === 0) {
        throw new Error(`key not found ${args.regkey}`);
      }
      signer = await keyChain.getPrivateKey(keyNames[0]);
    }
    enableNfdPrefixReg(uplink, {
      commandPrefix: args.reglocalhop ? ControlCommand.localhopPrefix : ControlCommand.localhostPrefix,
      signer,
    });
    Interest.tolerateSelectors = true;
  }
}
