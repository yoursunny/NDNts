# @ndn/lvs

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements [Light VerSec (LVS)](https://python-ndn.readthedocs.io/en/latest/src/lvs/lvs.html).
In particular, this package can import the [LVS model binary format](https://python-ndn.readthedocs.io/en/latest/src/lvs/binary-format.html) and convert to NDNts native trust schema format in `@ndn/trust-schema` package.

## Compile LVS Model with python-ndn and Import into NDNts

This package can only import LVS binary format, but does not support LVS textual format.

To compile LVS textual format to binary format, you need to use python-ndn:

```bash
# create Python virtual environment
python3.11 -m venv ~/lvs.venv
source ~/lvs.venv/bin/activate

# install python-ndn
pip install 'python-ndn[dev] @ git+https://github.com/named-data/python-ndn@61ae78687b3662d472024c95f1ebfc0770c3da7b'

# run the compiler
python ./pkg/lvs/compile.py <~/lvs-model.txt >~/lvs-model.tlv
```

To import the LVS binary format, decode the TLV into **LvsModel** structure.
The example below works with the model given in [python-ndn LVS tutorial](https://github.com/named-data/python-ndn/blob/96ae4bfb0060435e3f19c11d37feca512a8bd1f5/docs/src/lvs/lvs.rst#tutorial).

```ts
import { LvsModel, toPolicy, printUserFns } from "@ndn/lvs";

// other imports for examples
import { Decoder } from "@ndn/tlv";
import { printESM } from "@ndn/trust-schema";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const model = Decoder.decode(await fs.readFile("./test-fixture/tutorial.tlv"), LvsModel);
```

## Translate to TrustSchemaPolicy

Use **toPolicy** to translate the LVS model to **TrustSchemaPolicy** as defined in `@ndn/trust-schema` package.
The policy and the referenced user functions can be printed as ECMAScript modules with **printESM** and **printUserFns** functions.

```ts
const policy0 = toPolicy(model, toPolicy.forPrint);
console.group("lvsPolicy.mjs");
console.log(printESM(policy0));
console.groupEnd();
console.group("lvsUserFns.mjs");
console.log(printUserFns(policy0));
console.groupEnd();
```

1. Save the output of `printESM` as `lvsPolicy.mjs`.
2. Save the output of `printUserFns` as `lvsUserFns.mjs`.
3. Fill in the skeletons of user functions.
4. Import `policy` from `lvsPolicy.mjs` in your application.
