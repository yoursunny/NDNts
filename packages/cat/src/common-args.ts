import { Forwarder, FwFace } from "@ndn/fw";
import { L3Face } from "@ndn/l3face";
import { Interest } from "@ndn/l3pkt";
import { Name } from "@ndn/name";
import { Segment as Segment02, Version as Version02 } from "@ndn/naming-convention-02";
import { Segment as Segment03, Version as Version03 } from "@ndn/naming-convention-03";
import { enableNfdPrefixReg } from "@ndn/nfdmgmt";
import { SocketTransport } from "@ndn/node-transport";

export interface CommonArgs {
  router: string;
  nfd: boolean;
  convention02: boolean;
}

export let versionConvention = Version03;
export let segmentNumConvention = Segment03;
export let uplink: FwFace;

export async function applyCommonArgs(args: CommonArgs) {
  if (args.convention02) {
    versionConvention = Version02;
    segmentNumConvention = Segment02;
  }

  uplink = Forwarder.getDefault().addFace(new L3Face(
    await SocketTransport.connect({ port: 6363, host: args.router })));
  uplink.addRoute(new Name());
  if (args.nfd) {
    enableNfdPrefixReg(uplink);
    Interest.tolerateSelectors = true;
  }
}
