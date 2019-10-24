import { connectToTestbed } from "@ndn/fch";
import { FwTracer } from "@ndn/fw";

import "./api";

window.testFch = async () => {
  FwTracer.enable();
  const faces = await connectToTestbed({ count: 4 });
  return {
    faces: faces.map((face) => face.toString()),
  };
};
