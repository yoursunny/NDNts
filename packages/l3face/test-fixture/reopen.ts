import { FwPacket } from "@ndn/fw";
import { Interest } from "@ndn/packet";
import { delay } from "@ndn/util";
import { expect, vi } from "vitest";

import { L3Face, Transport } from "..";

export async function run<ServerSocket>(
    transport: Transport,
    waitNClients: (n: number) => Promise<ServerSocket[]>,
    closeClient: (sock: ServerSocket) => void,
) {
  const sock = (await waitNClients(1))[0]!;

  const face = new L3Face(transport);

  const stateEvt = vi.fn<[L3Face.State], void>();
  face.on("state", stateEvt);
  const upEvt = vi.fn();
  face.on("up", upEvt);
  const downEvt = vi.fn();
  face.on("down", downEvt);
  const closeEvt = vi.fn();
  face.on("close", closeEvt);

  let end = false;
  void face.tx((async function*() {
    // eslint-disable-next-line no-unmodified-loop-condition
    for (let i = 0; !end; ++i) {
      yield FwPacket.create(new Interest(`/A/${i}`));
      await delay(10);
    }
  })());

  await delay(100);
  closeClient(sock);
  await delay(300);

  const newSocks = await waitNClients(1);
  expect(newSocks).toHaveLength(1);
  expect(newSocks[0] === sock).toBeFalsy();

  end = true;
  await delay(500);

  expect(downEvt).toHaveBeenCalledTimes(1);
  expect(upEvt).toHaveBeenCalledTimes(1);
  expect(closeEvt).toHaveBeenCalledTimes(1);
  expect(stateEvt).toHaveBeenCalledTimes(3);
  expect(stateEvt).toHaveBeenNthCalledWith(1, L3Face.State.DOWN);
  expect(stateEvt).toHaveBeenNthCalledWith(2, L3Face.State.UP);
  expect(stateEvt).toHaveBeenNthCalledWith(3, L3Face.State.CLOSED);
  await expect(waitNClients(0)).resolves.toHaveLength(0);
}
