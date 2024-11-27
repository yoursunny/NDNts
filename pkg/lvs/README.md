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
import { Name } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";
import { printESM } from "@ndn/trust-schema";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const model = Decoder.decode(await fs.readFile("./test-fixture/tutorial.tlv"), LvsModel);
```

## Translate to TrustSchemaPolicy

**TrustSchemaPolicy**, as defined in `@ndn/trust-schema` package, is the native representation of a trust schema policy in NDNts.
Given an LVS model, you can invoke **toPolicy** function to translate the `LvsModel` to an equivalent `TrustSchemaPolicy`.

There are two workflows in doing the translation: build-time translation and runtime translation.

### Build-Time Translation

In *build-time translation*, the LVS model must be available when you build the project.
It is translated to `TrustSchemaPolicy` in a build step, represented by an ECMAScript module.
If any user functions are referenced in the LVS model, they shall be written in another ECMAScript module.
These ECMAScript modules are to be bundled in the compiled project, but the LVS translator is excluded.

1. Use `toPolicy` with `buildTime` option to perform a build-time translation.
2. Save the output of `printESM` as `lvspolicy.mjs`.
3. Save the output of `printUserFns` as `lvsuserfns.mjs`.
4. Fill in the skeletons of user functions.
5. Import `policy` from `lvspolicy.mjs` in your application.

```ts
const policy0 = toPolicy(model, toPolicy.buildTime);
console.group("lvspolicy.mjs");
console.log(printESM(policy0));
console.groupEnd();
console.group("lvsuserfns.mjs");
console.log(printUserFns(policy0));
console.groupEnd();
```

### Runtime Translation

In *runtime translation*, the LVS model is dynamically loaded at runtime (e.g. retrieved from network) and translated to `TrustSchemaPolicy`.
If any user functions are referenced in the LVS model, they shall be provided as runtime.
This requires the LVS translator to be bundled in the compiled project, which would result in much larger browser bundle size.

1. Use `toPolicy` with a table of user functions to perform a runtime translation.
2. The returned `policy` can be directly used in your application.

```ts
const policy1 = toPolicy(model, {
  $isValidID: (component) => component.length === 6,
  $isValidYear: (component) => component.length === 4,
});
```

## TrustSchemaPolicy Usage

When you have the **TrustSchemaPolicy**, either by importing the ECMAScript generated from build-time compilation or by using the result of runtime translation, you can access the signing and verification functionality provided by `@ndn/trust-schema` package.

The *Checker* functionality in python-ndn is equivalent to `policy.canSign` method.

```ts
// Admin's certificate can be signed by the root certificate
assert.equal(policy1.canSign(
  new Name("/ndn/blog/admin/000001/KEY/1/root/1"),
  new Name("/ndn/blog/KEY/1/self/1")), true);
// The component "key" does not match (should be upper-case)
assert.equal(policy1.canSign(
  new Name("/ndn/blog/admin/000001/key/1/root/1"),
  new Name("/ndn/blog/KEY/1/self/1")), false);
// One admin's certificate cannot be signed by another admin.
assert.equal(policy1.canSign(
  new Name("/ndn/blog/admin/000002/KEY/1/root/1"),
  new Name("/ndn/blog/admin/000001/KEY/1/root/1")), false);
// One author's certificate can be signed by an admin (with valid ID).
assert.equal(policy1.canSign(
  new Name("/ndn/blog/author/100001/KEY/1/000001/1"),
  new Name("/ndn/blog/admin/000001/KEY/1/root/1")), true);
// The author's ID is invalid.
assert.equal(policy1.canSign(
  new Name("/ndn/blog/author/1000/KEY/1/000001/1"),
  new Name("/ndn/blog/admin/000001/KEY/1/root/1")), false);
// One reader's certificate can be signed by an admin (with valid ID).
assert.equal(policy1.canSign(
  new Name("/ndn/blog/reader/200001/KEY/1/000001/1"),
  new Name("/ndn/blog/admin/000001/KEY/1/root/1")), true);
// One article can be signed by an author.
assert.equal(policy1.canSign(
  new Name("/ndn/blog/100001/post/2022/1"),
  new Name("/ndn/blog/author/100001/KEY/1/000001/1")), true);
// The author is wrong. The IDs in both article name and certificate name should be the same,
// as they use the same pattern "ID".
assert.equal(policy1.canSign(
  new Name("/ndn/blog/100001/post/2022/1"),
  new Name("/ndn/blog/author/100002/KEY/1/000001/1")), false);
// The year is invalid.
assert.equal(policy1.canSign(
  new Name("/ndn/blog/100001/post/202/1"),
  new Name("/ndn/blog/author/100001/KEY/1/000001/1")), false);
// The article cannot be signed by a reader.
assert.equal(policy1.canSign(
  new Name("/ndn/blog/200001/post/2022/1"),
  new Name("/ndn/blog/reader/200001/KEY/1/000001/1")), false);
```
