# @ndn/trust-schema

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements trust schemas.

* [X] hierarchical trust model verifier
* [X] hierarchical trust model signer
* [X] trust schema verifier
  * [ ] override certificate issuer in KeyLocator
* [X] trust schema signer
  * [ ] choose certificate issuer among existing certificates
  * [ ] automatically create certificates using local issuer key
  * [ ] automatically request certificates from remote certificate authority

```ts
import { TrustSchema, TrustSchemaSigner, TrustSchemaVerifier, printESM, versec } from "@ndn/trust-schema";

// other imports for examples
import { Certificate, KeyChain, generateSigningKey } from "@ndn/keychain";
import { Component, Data, ValidityPeriod } from "@ndn/packet";
import assert from "node:assert/strict";
```

## Trust Schema Introduction

Yingdi Yu proposed **trust schema** in [Schematizing Trust in Named Data Networking](https://named-data.net/publications/schematizing_trust_ndn/).
According to his definition:

* A trust schema comprises a set of linked trust rules and one or more trust anchors.
* A trust rule is an association of the data name with its signing key name.
  It can either associate an application data name with its signing key name, or associate a certificate name with its issuer key name.
* One or more trust anchors, i.e. pre-authenticated keys, are included in the trust schema to serve as bootstrapping points of the trust model.

Pollere LLC released **Versatile Security Toolkit (VerSec)** as part of [Defined-trust Communications Toolkit (DCT)](https://github.com/pollere/DCT).
It has a [schema description language](https://github.com/pollere/DCT/blob/c863d17db155ee0cdc05215d7d01c4411f72ee06/tools/compiler/doc/language.md) that describes constraints on:

* Layout and components of names.
* Structural and signing relationships between names.

The language specification is fairly complex and contains certain ambiguity.
The compiler implementation is found to have several limitations.

python-ndn library authors defined **Light VerSec (LVS)**, a lightweight modification of VerSec that focuses on signing key validation.
Its [syntax and semantics](https://python-ndn.readthedocs.io/en/latest/src/lvs/lvs.html) are similar to VerSec.
For ease of processing, LVS introduced some restrictions on identifier names and token ordering.
This package can import a subset of LVS models from its textual format via `versec.load()` function.
See `@ndn/lvs` package for more complete LVS support via its binary format.

## Trust Schema Representation

The trust schema implementation in this package is inspired by the above documents and projects.
The overall structure is:

```text
TrustSchema
+-TrustSchemaPolicy
|   +-patterns = set of
|   |   id => Pattern
|   |         +-ConstPattern
|   |         +-VariablePattern
|   |         +-CertNamePattern
|   |         +-ConcatPattern
|   |         +-AlternatePattern
|   |         \-OverlapPattern
|   |
|   \-rules = set of
|       packet name pattern id => signer name pattern id
|
\-trust anchors = array of Certificate
```

`TrustSchema` type represents a trust schema.
It contains a `TrustSchemaPolicy` and an array of trust anchor certificates.

`TrustSchemaPolicy` type represents the policy portion of a trust schema.
It contains a set of patterns, each has a unique `id` string.
It also contains a set of rules, which indicates a packet matching the first pattern should be signed by a key matching the second pattern.

`Pattern` type represents a pattern in the trust schema policy.
It must be one of these sub-types:

* `ConstPattern` matches one or more name components specified as a constant in the policy.
* `VariablePattern` matches one or more name components (specified as a range), optionally overlapped with an inner pattern and filtered by a JavaScript function.
  It can save matched components to a variable.
  When the same variable appears in both packet name pattern and signer name pattern, the matched name component(s) must be the same.
* `CertNamePattern` matches either `KEY/key-id` or `KEY/key-id/issuer-id/version` suffix in [NDN Certificate Format](https://docs.named-data.net/NDN-packet-spec/0.3/certificate.html).
* `ConcatPattern` concatenates two or more other patterns.
* `AlternatePattern` accepts any match among two or more possible patterns.
* `OverlapPattern` accepts one or more name components that satisfy two or more overlapped patterns.

## VerSec Syntax

This package has partial support of the VerSec syntax, including:

* component constraints
* `timestamp` function: translates to a `VariablePattern` that matches a Timestamp name component
* `seq` function: translates to a `VariablePattern` that matches a SequenceNum name component
* `sysid`, `host`, `uid`, `pid` function: translates to a `VariablePattern` that assigns to a variable of the same name upper-cased
* signing constraints and signing chains

Some notes and limitations:

* This implementation has very limited compile-time schema validation.
* You can have multiple trust anchors, despite that the VerSec spec allows only one trust anchor.
* `CertNamePattern` is created by `"KEY"/_/_/_`, which should be included at the end of each certificate name.
* Identifiers starting with `_` cannot be used in signing constraints and signing chains.

**This implementation is deprecated in favor of LVS in @ndn/lvs package.**

`versec.load()` function imports a policy written in VerSec syntax:

```ts
const policy = versec.load(`
_site: "a"/"blog"
root: _site/_KEY
#article: _site/"article"/category/year/month <= author

// Notice the variable name distinction between 'adminName' and 'authorName', which is necessary
// to allow them to have different values. Also, the variables cannot be named 'admin' and 'author'
// because that would clash with the pattern names that are implicitly declared as variables.
admin: _site/"admin"/adminName/_KEY <= root
author: _site/_role/authorName/_KEY & { _role: "author" } <= admin

_KEY: "KEY"/_/_/_
`);
```

`versec.print()` function prints the policy in VerSec syntax.
You may notice that the output differs from the input, because the library has flattened the patterns for faster execution.
Occasionally, certain features may not print correctly, especially if the policy was imported from a different syntax.

```ts
console.group("VerSec policy");
console.log(versec.print(policy));
console.groupEnd();
```

`printESM()` function prints the policy as ECMAScript module.
It shows how you can define the same policy in code.
However, it cannot automatically convert certain VerSec features, and manual edits would be necessary in such cases.
Writing the policy in code can reduce JavaScript bundle size in a web application, because the VerSec compiler is no longer needed at runtime.

```ts
console.group("VerSec policy in ESM");
console.log(printESM(policy));
console.groupEnd();
```

With the policy in place, we can generate a root key and make the trust schema object.

```ts
const keyChain = KeyChain.createTemp();
const [rootPvt, rootPub] = await generateSigningKey(keyChain, "/a/blog");
const rootCert = await Certificate.selfSign({ publicKey: rootPub, privateKey: rootPvt });
await keyChain.insertCert(rootCert);
const schema = new TrustSchema(policy, [rootCert]);
```

## Trust Schema Signer

`TrustSchemaSigner` type can automatically select a signer among available certificates in the KeyChain.

```ts
const schemaSigner = new TrustSchemaSigner({ keyChain, schema });

const [adminPvt, adminPub] = await generateSigningKey(keyChain, "/a/blog/admin/Lixia");
const adminCert = await Certificate.issue({
  publicKey: adminPub,
  validity: ValidityPeriod.daysFromNow(30),
  issuerId: Component.from("blog"),
  issuerPrivateKey: schemaSigner,
});
await keyChain.insertCert(adminCert);
// admin certificate should be signed by root key
assert.equal(adminCert.issuer?.toString(), rootCert.name.toString());

const [authorPvt, authorPub] = await generateSigningKey(keyChain, "/a/blog/author/Yingdi");
const authorCert = await Certificate.issue({
  publicKey: authorPub,
  validity: ValidityPeriod.daysFromNow(30),
  issuerId: Component.from("blog"),
  issuerPrivateKey: schemaSigner,
});
await keyChain.insertCert(authorCert);
// author certificate should be signed by admin key
assert.equal(authorCert.issuer?.toString(), adminCert.name.toString());

const articleData = new Data("/a/blog/article/food/2015/1");
await schemaSigner.sign(articleData);
// article should be signed by author key
assert.equal(articleData.sigInfo.keyLocator?.name?.toString(), authorCert.name.toString());

// Data that does not match the policy cannot be signed.
const otherData = new Data("/a/blog/not-article/poison/2015/13");
await assert.rejects(schemaSigner.sign(otherData));
```

## Trust Schema Verifier

`TrustSchemaVerifier` type can verify packets according to the trust schema.
It can collect intermediate certificates from a local KeyChain and from the network.

```ts
const schemaVerifier = new TrustSchemaVerifier({
  schema: new TrustSchema(policy, [rootCert]),
  offline: true,
  keyChain,
});

// The article is trusted.
await schemaVerifier.verify(articleData);

// Although an author could sign the other Data manually, it is not trusted by schema.
await authorPvt.sign(otherData);
await assert.rejects(schemaVerifier.verify(otherData));
```
