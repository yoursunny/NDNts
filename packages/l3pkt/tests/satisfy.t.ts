import { Name } from "@ndn/name";

import { canSatisfy, canSatisfySync, Data, Interest } from "..";
import { getDataFullName } from "../test-fixture";

test("simple", async () => {
  const interest = new Interest("/A");
  const data = new Data("/A");
  expect(canSatisfySync(interest, data)).toBe(true);
  await expect(canSatisfy(interest, data)).resolves.toBe(true);

  interest.mustBeFresh = true;
  expect(canSatisfySync(interest, data)).toBe(false);
  await expect(canSatisfy(interest, data)).resolves.toBe(false);

  data.freshnessPeriod = 500;
  expect(canSatisfySync(interest, data)).toBe(true);
  await expect(canSatisfy(interest, data)).resolves.toBe(true);

  data.name = new Name("/A/B");
  expect(canSatisfySync(interest, data)).toBe(false);
  await expect(canSatisfy(interest, data)).resolves.toBe(false);

  interest.canBePrefix = true;
  expect(canSatisfySync(interest, data)).toBe(true);
  await expect(canSatisfy(interest, data)).resolves.toBe(true);

  interest.name = await getDataFullName(data);
  expect(canSatisfySync(interest, data)).toBeUndefined();
  await expect(canSatisfy(interest, data)).resolves.toBe(true);

  interest.canBePrefix = false;
  expect(canSatisfySync(interest, data)).toBe(true); // digest cached on data
  await expect(canSatisfy(interest, data)).resolves.toBe(true);
});
