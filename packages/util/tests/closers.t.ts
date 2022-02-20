import { Closers } from "..";

test("closers", () => {
  const closers = new Closers();
  expect(closers).toHaveLength(0);

  const c0 = {
    close: jest.fn<void, []>(),
  };
  const c1 = {
    close: jest.fn<number, []>().mockReturnValue(1),
  };

  closers.push(c0, c1);
  expect(closers).toHaveLength(2);

  const { close } = closers;
  close();
  expect(closers).toHaveLength(0);
  expect(c0.close).toHaveBeenCalledTimes(1);
  expect(c1.close).toHaveBeenCalledTimes(1);

  closers.close();
  expect(closers).toHaveLength(0);
  expect(c0.close).toHaveBeenCalledTimes(1);
  expect(c1.close).toHaveBeenCalledTimes(1);
});
