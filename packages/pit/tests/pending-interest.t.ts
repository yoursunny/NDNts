import { Interest } from "@ndn/l3pkt";

import { LinearPit } from "../src";

let pit: LinearPit;

beforeEach(() => {
  pit = new LinearPit();
});

test("nonce", () => {
  const interestA = new Interest("/A");
  const piA = pit.addInterest(interestA);
  expect(piA.interest).not.toBe(interestA); // it should have made a copy
  expect(piA.interest.nonce).not.toBeUndefined();

  const interestB = new Interest("/B", Interest.Nonce(0xFB1B4416));
  const piB = pit.addInterest(interestB);
  expect(piB.interest).not.toBe(interestB);
  expect(piB.interest.nonce).toBe(0xFB1B4416);
});

test("timer", async () => {
  const pi = pit.addInterest(new Interest("/I", Interest.Lifetime(200)));
  const timeout = jest.fn();
  pi.on("expire", timeout);

  const fnA1 = jest.fn();
  pi.setTimer("A", 20, fnA1);

  const fnA2 = jest.fn();
  pi.setTimer("A", 20, fnA2);

  const fnB = jest.fn();
  pi.setTimer("B", 100, fnB);

  const fnC = jest.fn();
  pi.setTimer("C", 100, fnC);

  const fnD = jest.fn();
  pi.setTimer("D", 300, fnD);

  await new Promise((r) => setTimeout(r, 50));
  expect(fnA2).toHaveBeenCalled();
  pi.clearTimer("C");

  await new Promise((r) => setTimeout(r, 100));
  expect(fnB).toHaveBeenCalled();

  await new Promise((r) => setTimeout(r, 200));

  expect(timeout).toHaveBeenCalled();
  expect(fnA1).not.toHaveBeenCalled();
  expect(fnC).not.toHaveBeenCalled();
  expect(fnD).not.toHaveBeenCalled();
});

test("remainingLifetime", async () => {
  const pi = pit.addInterest(new Interest("/I", Interest.Lifetime(200)));

  await new Promise((r) => setTimeout(r, 50));
  expect(pi.remainingLifetime).toBeLessThan(180);
  expect(pi.remainingLifetime).toBeGreaterThan(120);

  expect(pi.adjustInterestLifetime()).toBeTruthy();
  expect(pi.interest.lifetime).toBeLessThan(180);
  expect(pi.interest.lifetime).toBeGreaterThan(120);

  pi.cancel();
  expect(pi.remainingLifetime).toBeLessThan(0);
  expect(pi.adjustInterestLifetime()).toBeFalsy();
});
