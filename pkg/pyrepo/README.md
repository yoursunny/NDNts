# @ndn/pyrepo

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package allows inserting and deleting Data in [ndn-python-repo](https://github.com/UCLA-IRL/ndn-python-repo).
This implementation is compatible with ndn-python-repo `dda1dce1` (2024-02-04).
To install and start the specified version, run:

```bash
# create Python virtual environment
python3 -m venv pyrepo-venv
cd pyrepo-venv
source ./bin/activate

# install ndn-python-repo
pip install git+https://github.com/UCLA-IRL/ndn-python-repo@dda1dce135a952498a2a79d3cddf9c3ee33399d0

# run ndn-python-repo
export NDN_CLIENT_TRANSPORT=unix:///run/nfd/nfd.sock
ndn-python-repo
```

`PyRepoClient` type is a client for [ndn-python-repo protocol](https://github.com/UCLA-IRL/ndn-python-repo/tree/dda1dce135a952498a2a79d3cddf9c3ee33399d0/docs/src/specification).
`PyRepoStore` type implements a write-only subset of `DataStore` interfaces as defined in `@ndn/repo-api` package.

```ts
import { PyRepoStore } from "@ndn/pyrepo";

import { Forwarder } from "@ndn/fw";
import { L3Face } from "@ndn/l3face";
import { enableNfdPrefixReg } from "@ndn/nfdmgmt";
import { UnixTransport } from "@ndn/node-transport";
import { Data, digestSigning, Name } from "@ndn/packet";
import { Closer } from "@ndn/util";

const repoPrefix = process.env.DEMO_PYREPO_PREFIX;
if (!repoPrefix) {
  console.log(`
  To run @ndn/pyrepo demo, set the following environment variables:
  DEMO_PYREPO_PREFIX= command prefix of ndn-python-repo
  `);
  process.exit(0);
}
const dataPrefix = new Name(`/NDNts-pyrepo/${Math.trunc(Math.random() * 1e8)}`);

const face = await UnixTransport.createFace({}, process.env.DEMO_NFD_UNIX ?? "/run/nfd/nfd.sock");
await using faceDispose = Closer.asAsyncDisposable(face);
enableNfdPrefixReg(face);

await using store = new PyRepoStore({
  repoPrefix: new Name(repoPrefix),
});

const packets: Data[] = [];
for (let i = 0; i < 100; ++i) {
  const data = new Data(dataPrefix.append(`${i}`));
  data.freshnessPeriod = 1;
  await digestSigning.sign(data);
  packets.push(data);
}

console.log(`Inserting ${packets.length} packets under ${dataPrefix} to ${repoPrefix}`);
try {
  await store.insert(...packets);
} finally {
  face.close();
}
```
