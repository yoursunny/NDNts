import { FwPacket } from "@ndn/fw";
import { Interest } from "@ndn/packet";

import { L3Face, Transport } from "..";

export async function run<ServerSocket>(
    transport: Transport,
    waitNClients: (n: number) => Promise<ServerSocket[]>,
    closeClient: (sock: ServerSocket) => void,
) {
  const [sock] = await waitNClients(1);

  const face = new L3Face(transport);

  const stateEvt = jest.fn<void, [L3Face.State]>();
  face.on("state", stateEvt);
  const upEvt = jest.fn();
  face.on("up", upEvt);
  const downEvt = jest.fn();
  face.on("down", downEvt);
  const closeEvt = jest.fn();
  face.on("close", closeEvt);

  let end = false;
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  face.tx((async function*() {
    // eslint-disable-next-line no-unmodified-loop-condition
    for (let i = 0; !end; ++i) {
      yield FwPacket.create(new Interest(`/A/${i}`));
      await new Promise((r) => setTimeout(r, 10));
    }
  })());

  await new Promise((r) => setTimeout(r, 100));
  closeClient(sock);
  await new Promise((r) => setTimeout(r, 300));

  const newSocks = await waitNClients(1);
  expect(newSocks).toHaveLength(1);
  expect(newSocks[0] === sock).toBeFalsy();

  end = true;
  await new Promise((r) => setTimeout(r, 500));

  expect(downEvt).toHaveBeenCalledTimes(1);
  expect(upEvt).toHaveBeenCalledTimes(1);
  expect(closeEvt).toHaveBeenCalledTimes(1);
  expect(stateEvt).toHaveBeenCalledTimes(3);
  expect(stateEvt).toHaveBeenNthCalledWith(1, L3Face.State.DOWN);
  expect(stateEvt).toHaveBeenNthCalledWith(2, L3Face.State.UP);
  expect(stateEvt).toHaveBeenNthCalledWith(3, L3Face.State.CLOSED);
  await expect(waitNClients(0)).resolves.toHaveLength(0);
}
