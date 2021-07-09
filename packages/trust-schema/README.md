# @ndn/trust-schema

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements trust schemas.

* [X] hierarchical trust model verifier
* [ ] hierarchical trust model signer
* [X] trust schema verifier
  * [ ] override certificate issuer in KeyLocator
* [X] trust schema signer
  * [ ] choose certificate issuer among existing certificates
  * [ ] automatically create certificates using local issuer key
  * [ ] automatically request certificates from remote certificate authority

```ts
import { TrustSchema, TrustSchemaSigner, TrustSchemaVerifier, versec2019, versec2021 } from "@ndn/trust-schema";

// other imports for examples
import { Certificate, KeyChain, ValidityPeriod, generateSigningKey } from "@ndn/keychain";
import { Component, Data } from "@ndn/packet";
import { strict as assert } from "assert";
(async () => {
```

## Trust Schema Introduction

Yingdi Yu proposed **trust schema** in [Schematizing Trust in Named Data Networking](https://named-data.net/publications/schematizing_trust_ndn/).
According to his definition:

* A trust schema comprises a set of linked trust rules and one or more trust anchors.
* A trust rule is an association of the data name with its signing key name.
  It can either associate an application data name with its signing key name, or associate a certificate name with its issuer key name.
* One or more trust anchors, i.e. pre-authenticated keys, are included in the trust schema to serve as bootstrapping points of the trust model.

Kathleen Nichols presented a preview of **Versatile Security Toolkit (VerSec)** in [Building a Bridge from Applications to NDN](https://pollere.net/Pdfdocs/BuildingBridge.pdf) at 2019 NDN Community Meeting.
Page 14 shows the syntax of a language for expressing trust rules.
It contains two parts:

* A list of patterns to match (part of) packet names.
* A signing chain that specifies the trust rules using defined patterns.

## Trust Schema Representation

The trust schema implementation in this package is inspired by the above documents.
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
|   |         \-AlternatePattern
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
* `CertNamePattern` matches either `KEY/key-id` or `KEY/key-id/issuer-id/version` suffix in [NDN Certificate Format](https://named-data.net/doc/ndn-cxx/0.7.1/specs/certificate-format.html).
* `ConcatPattern` concatenates two or more other patterns.
* `AlternatePattern` accepts any match among two or more possible patterns.

## VerSec2019 Syntax

This package can import a trust policy written in a language similar to [Building a Bridge from Applications to NDN](https://pollere.net/Pdfdocs/BuildingBridge.pdf) page 14.
The following syntax is accepted:

```abnf
policy = line *(LF line)
line = *SP (comment | patterndef | chain) *SP

comment = "#" *(SP | VCHAR)

patterndef = id *SP "=" *SP pattern
pattern = const | variable | patternref | concat | alternate | ("(" pattern ")")
const = name_component *("/" name_component)
variable = "<_" var ">"
patternref = "<" id ">"
concat = pattern 1*(*SP "/" *SP pattern)
alternate = pattern 1*(*SP "|" *SP pattern)

chain = id 1*(*SP "<=" *SP id)

var = ident
id = ident
ident = ALPHA *(ALPHA | DIGIT)
```

* VariablePattern matches exactly one name component.
* VariablePattern cannot have JavaScript function filters.
* CertNamePattern is created by the special variable `<_KEY>` (case sensitive).
* `<id>` references an existing pattern by its id. The referenced pattern must be defined above.

`versec2019.load()` function imports a policy:

```ts
const policy = versec2019.load(`
site = a/blog
root = <site>/<_KEY>
admin = <site>/admin/<_admin>/<_KEY>
author = <site>/author/<_author>/<_KEY>
article = <site>/article/<_category>/<_year>/<_month>

article <= author <= admin <= root
`);
```

`versec2019.print()` function prints the policy.
You may notice that the output differs from the input, because the library has flattened the patterns for faster execution.

```ts
console.group("VerSec2019 policy");
console.log(versec2019.print(policy));
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

## VerSec2021 Syntax

This package has partial support of the [VerSec Domain Specific Language](https://github.com/pollere/DCT/blob/main/versec/language.md) (VerSec2021) syntax, including:

* component constraints
* `replace` function
* `timestamp` function: translates to a `VariablePattern` that matches a Timestamp name component
* `sysid` function: translates to a `VariablePattern` that assigns to *SYSID* variable
* signing constraints and signing chains

Some notes and limitations:

* This implementation has very limited compile-time schema validation.
* Binary schema format is not supported.
* You can have multiple trust anchors, despite that the VerSec spec allows only one trust anchor.
* You can create a `CertNamePattern` by writing `"KEY"/_/_/_`.
  It should be included at the end of each certificate name.

`versec2021.load()` function imports a policy:

```ts
const policy2021 = versec2021.load(`
// This is the same policy as the previous example, written in VerSec2021 syntax.
_site: "a"/"blog"
root: _site/_KEY
article: _site/"article"/category/year/month <= author

// Notice the variable name distinction between 'adminName' and 'authorName', which is necessary
// to allow them to have different values. Also, the variables cannot be named 'admin' and 'author'
// because that would clash with the pattern name that is implicitly declared as variables.
admin: _site/"admin"/adminName/_KEY <= root
author: _site/_role/authorName/_KEY & { _role: "author" } <= admin

_KEY: "KEY"/_/_/_
`);
```

`versec2021.print()` function prints the policy:

```ts
console.group("VerSec2021 policy");
console.log(versec2021.print(policy2021));
console.groupEnd();
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
  schema: new TrustSchema(policy2021, [rootCert]),
  offline: true,
  keyChain,
});

// The article is trusted.
await schemaVerifier.verify(articleData);

// Although an author could sign the other Data manually, it is not trusted by schema.
await authorPvt.sign(otherData);
await assert.rejects(schemaVerifier.verify(otherData));
```

```ts
})();
```
