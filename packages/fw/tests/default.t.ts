import { Forwarder } from "..";

test("default instance", () => {
  const fw0 = Forwarder.getDefault();
  const fw1 = Forwarder.getDefault();
  expect(fw1).toBe(fw0);

  Forwarder.deleteDefault();
  const fw2 = Forwarder.getDefault();
  expect(fw2).not.toBe(fw0);
});
