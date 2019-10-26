import { connectToTestbed } from "@ndn/autoconfig";
import { FwTracer } from "@ndn/fw";

import "./api";

window.testConnectToTestbed = async () => {
  FwTracer.enable();
  const faces = await connectToTestbed({ count: 3 });
  return {
    faces: faces.map((face) => face.toString()),
  };
};
