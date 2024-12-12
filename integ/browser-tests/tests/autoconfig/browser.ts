import "./api";

import { connectToNetwork } from "@ndn/autoconfig";
import { FwTracer } from "@ndn/fw";
import { H3Transport } from "@ndn/quic-transport";

FwTracer.enable();

globalThis.testConnectToNetwork = async () => {
  const faces = await connectToNetwork({
    H3Transport,
    preferH3: true,
    fallback: ["titan.cs.memphis.edu", "vnetlab.gcom.di.uminho.pt"],
    fastest: 2,
  });
  return {
    faces: faces.map((face) => face.toString()),
  };
};
