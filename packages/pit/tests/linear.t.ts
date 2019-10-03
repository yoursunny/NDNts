import { Data, Interest } from "@ndn/l3pkt";
import { getDataFullName } from "@ndn/l3pkt/test-fixture";

import { LinearPit } from "../src";

test("callback", async () => {
  const data = new Data("/A/B");
  const fullName = await getDataFullName(data);
  const never = jest.fn();

  const pit = new LinearPit();

  const piA = pit.addInterest(new Interest("/A", Interest.Lifetime(200)));
  piA.on("data", never);
  const timeoutA = jest.fn<void, []>();
  piA.on("timeout", timeoutA);
  piA.on("cancel", never);

  const piAcbp = pit.addInterest(new Interest("/A", Interest.CanBePrefix, Interest.Lifetime(200)));
  const dataAcbp = jest.fn<void, [Data]>();
  piAcbp.on("data", dataAcbp);
  piAcbp.on("timeout", never);
  piAcbp.on("cancel", never);

  const piAB = pit.addInterest(new Interest("/A/B", Interest.Lifetime(200)));
  const dataAB = jest.fn<void, [Data]>();
  piAB.on("data", dataAB);
  piAB.on("timeout", never);
  piAB.on("cancel", never);

  const piAB2 = pit.addInterest(new Interest("/A/B", Interest.Lifetime(200)));
  const dataAB2 = jest.fn<void, [Data]>();
  piAB2.on("data", dataAB2);
  piAB2.on("timeout", never);
  piAB2.on("cancel", never);

  const piAB3 = pit.addInterest(new Interest("/A/B", Interest.Lifetime(200)));
  piAB3.on("data", never);
  piAB3.on("timeout", never);
  const cancelAB3 = jest.fn<void, []>();
  piAB3.on("cancel", cancelAB3);

  const piF = pit.addInterest(new Interest(fullName, Interest.Lifetime(200)));
  const dataF = jest.fn<void, [Data]>();
  piF.on("data", dataF);
  piF.on("timeout", never);
  piF.on("cancel", never);

  expect(pit).toHaveLength(6);
  expect(cancelAB3).not.toHaveBeenCalled();
  await new Promise((r) => setTimeout(r, 0));
  piAB3.cancel();
  await new Promise((r) => setTimeout(r, 0));
  expect(pit).toHaveLength(5);
  expect(cancelAB3).toHaveBeenCalled();

  pit.processData(data);
  await new Promise((r) => setTimeout(r, 10));
  expect(pit).toHaveLength(1);
  expect(dataAcbp).toHaveBeenCalled();
  expect(dataAB).toHaveBeenCalled();
  expect(dataAB2).toHaveBeenCalled();
  expect(dataF).toHaveBeenCalled();

  await new Promise((r) => setTimeout(r, 60));
  expect(pit).toHaveLength(1);
  expect(timeoutA).not.toHaveBeenCalled();

  await new Promise((r) => setTimeout(r, 150));
  expect(pit).toHaveLength(0);
  expect(timeoutA).toHaveBeenCalled();

  expect(never).not.toHaveBeenCalled();
});

test("promise", async () => {
  const pit = new LinearPit();
  const piAB = pit.addInterest(new Interest("/A/B", Interest.Lifetime(200)));
  const piC = pit.addInterest(new Interest("/C"));
  await Promise.all([
    new Promise((r) => setTimeout(r, 100))
      .then(() => pit.processData(new Data("/A/B"))),
    expect(pit.addInterest(new Interest("/A", Interest.Lifetime(200))).promise)
      .rejects.toThrow(/timeout/),
    expect(pit.addInterest(new Interest("/A", Interest.CanBePrefix)).promise)
      .resolves.toBeInstanceOf(Data),
    expect(piAB.promise).resolves.toBeInstanceOf(Data),
    expect(piAB.promise).resolves.toBeInstanceOf(Data),
    new Promise((r) => setTimeout(r, 20))
      .then(() => piC.cancel()),
    expect(piC.promise).rejects.toThrow(/canceled/),
  ]);
});
