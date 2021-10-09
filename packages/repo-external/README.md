# @ndn/repo-external

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package allows inserting and deleting Data in [ndn-python-repo](https://github.com/UCLA-IRL/ndn-python-repo).
`PyRepoClient` type is a client for [ndn-python-repo protocol](https://ndn-python-repo.readthedocs.io/en/latest/src/specification/specification.html).
`PyRepoStore` type implements a subset of `DataStore` interfaces defined in `@ndn/repo-api` package.

This implementation is compatible with ndn-python-repo version 0.2a5.
To install this version, run:

```bash
pip install ndn-python-repo==0.2a5 python-ndn==0.2b2.post1
```

```ts
import { PyRepoStore } from "@ndn/repo-external";

import { Forwarder } from "@ndn/fw";
import { L3Face } from "@ndn/l3face";
import { enableNfdPrefixReg } from "@ndn/nfdmgmt";
import { UnixTransport } from "@ndn/node-transport";
import { Data, digestSigning, Name } from "@ndn/packet";

(async () => {
  const repoPrefix = process.env.DEMO_PYREPO_PREFIX;
  if (!repoPrefix) {
    console.log(`
    To run @ndn/repo-external demo, set the following environment variables:
    DEMO_PYREPO_PREFIX= command prefix of ndn-python-repo
    `);
    return;
  }
  const dataPrefix = new Name(`/NDNts-repo-external/${Math.floor(Math.random() * 1e9)}`);

  const face = await UnixTransport.createFace({}, process.env.DEMO_NFD_UNIX ?? "/run/nfd.sock");
  enableNfdPrefixReg(face);

  const store = new PyRepoStore({
    repoPrefix: new Name(repoPrefix),
  });

  const packets: Data[] = [];
  for (let i = 0; i < 256; ++i) {
    const data = new Data(dataPrefix.append(`${i}`));
    data.freshnessPeriod = 1;
    await digestSigning.sign(data);
    packets.push(data);
  }

  console.log(`Inserting ${packets.length} packets under ${dataPrefix} to ${repoPrefix}`);
  try {
    await store.insert(...packets);
  } finally {
    await store.close();
    face.close();
  }
})().catch(console.error);
```
