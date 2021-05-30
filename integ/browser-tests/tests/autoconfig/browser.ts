import "./api";

import { connectToNetwork } from "@ndn/autoconfig";
import { FwTracer } from "@ndn/fw";
import { H3Transport } from "@ndn/quic-transport";

FwTracer.enable();

window.testConnectToNetwork = async () => {
  const faces = await connectToNetwork({
    H3Transport,
    preferH3: true,
    fallback: ["suns.cs.ucla.edu", "ndn.qub.ac.uk"],
    fastest: 2,
  });
  return {
    faces: faces.map((face) => face.toString()),
  };
};
