import { Data, Interest } from "@ndn/l3pkt";
import { getDataFullName } from "@ndn/l3pkt/test-fixture";
import delay from "delay";

import { LinearPit } from "../src";

test("simple", async () => {
  const data = new Data("/A/B");
  const fullName = await getDataFullName(data);

  const pit = new LinearPit();

  const piA = pit.addInterest(new Interest("/A", Interest.Lifetime(200)));
  const dataA = jest.fn<void, [Data]>();
  piA.on("data", dataA);
  const timeoutA = jest.fn<void, []>();
  piA.on("timeout", timeoutA);

  const piAcbp = pit.addInterest(new Interest("/A", Interest.CanBePrefix, Interest.Lifetime(200)));
  const dataAcbp = jest.fn<void, [Data]>();
  piAcbp.on("data", dataAcbp);
  const timeoutAcbp = jest.fn<void, []>();
  piAcbp.on("timeout", timeoutAcbp);

  const piAB = pit.addInterest(new Interest("/A/B", Interest.Lifetime(200)));
  const dataAB = jest.fn<void, [Data]>();
  piAB.on("data", dataAB);
  const timeoutAB = jest.fn<void, []>();
  piAB.on("timeout", timeoutAB);

  const piAB2 = pit.addInterest(new Interest("/A/B", Interest.Lifetime(200)));
  const dataAB2 = jest.fn<void, [Data]>();
  piAB2.on("data", dataAB2);
  const timeoutAB2 = jest.fn<void, []>();
  piAB2.on("timeout", timeoutAB2);

  const piAB3 = pit.addInterest(new Interest("/A/B", Interest.Lifetime(200)));
  const dataAB3 = jest.fn<void, [Data]>();
  piAB3.on("data", dataAB3);
  const timeoutAB3 = jest.fn<void, []>();
  piAB3.on("timeout", timeoutAB3);

  const piF = pit.addInterest(new Interest(fullName, Interest.Lifetime(200)));
  const dataF = jest.fn<void, [Data]>();
  piF.on("data", dataF);
  const timeoutF = jest.fn<void, []>();
  piF.on("timeout", timeoutF);

  await delay(1);
  expect(pit).toHaveLength(6);
  piAB3.cancel();
  expect(pit).toHaveLength(5);

  pit.processData(data);
  await delay(10);
  expect(pit).toHaveLength(1);
  expect(dataAcbp).toHaveBeenCalled();
  expect(dataAB).toHaveBeenCalled();
  expect(dataAB2).toHaveBeenCalled();
  expect(dataF).toHaveBeenCalled();

  await delay(60);
  expect(pit).toHaveLength(1);
  expect(timeoutA).not.toHaveBeenCalled();

  await delay(150);
  expect(pit).toHaveLength(0);
  expect(timeoutA).toHaveBeenCalled();

  expect(dataA).not.toHaveBeenCalled();
  expect(timeoutAcbp).not.toHaveBeenCalled();
  expect(timeoutAB).not.toHaveBeenCalled();
  expect(timeoutAB2).not.toHaveBeenCalled();
  expect(dataAB3).not.toHaveBeenCalled();
  expect(timeoutAB3).not.toHaveBeenCalled();
  expect(timeoutF).not.toHaveBeenCalled();
});
