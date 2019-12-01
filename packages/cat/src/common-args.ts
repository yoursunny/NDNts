import { Forwarder, FwFace, FwTracer } from "@ndn/fw";
import { KeyChain, PrivateKey } from "@ndn/keychain";
import { L3Face, Transport } from "@ndn/l3face";
import { Segment as Segment1, Version as Version1 } from "@ndn/naming-convention1";
import { Segment as Segment2, Version as Version2 } from "@ndn/naming-convention2";
import { enableNfdPrefixReg } from "@ndn/nfdmgmt";
import { TcpTransport, UdpTransport } from "@ndn/node-transport";
import { Interest, Name } from "@ndn/packet";

export interface CommonArgs {
  pkttrace: boolean;
  router: string;
  transport: TransportArg;
  nfd: boolean;
  regkeychain?: string;
  regkey?: string;
  convention1: boolean;
}

export type TransportArg = "tcp"|"udp";

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

  let transport: Transport;
  switch (args.transport) {
    case "tcp":
      transport = await TcpTransport.connect(args.router);
      break;
    case "udp":
      transport = await UdpTransport.connect(args.router);
      break;
  }
  uplink = Forwarder.getDefault().addFace(new L3Face(transport));
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
      signer,
    });
    Interest.tolerateSelectors = true;
  }
}
