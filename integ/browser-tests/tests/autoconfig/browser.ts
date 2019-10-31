import "./api";

import { connectToTestbed } from "@ndn/autoconfig";
import { FwTracer } from "@ndn/fw";

window.testConnectToTestbed = async () => {
  FwTracer.enable();
  const faces = await connectToTestbed({ count: 3 });
  return {
    faces: faces.map((face) => face.toString()),
  };
};
