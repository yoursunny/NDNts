# @ndn/keychain-cli

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

**ndntssec** is a command line utility to access an NDNts persistent KeyChain.

## Simple Commands

* List keys: `ndntssec --locator /tmp/my-keychain list-keys`
* List certificates: `ndntssec --locator /tmp/my-keychain list-certs`
* Show certificate (in Base64 format): `ndntssec --locator /tmp/my-keychain show-cert /A/KEY/36=%00%05%96%BA%2C%A5%89%F8/self/35=%00%00%01nD%24%01%87`
* Add certificate (key must exist): `ndntssec --locator /tmp/my-keychain add-cert < A.cert`
* Delete keys and certificates (specify name prefix): `ndntssec --locator /tmp/my-keychain delete /A`

In all commands, `--locator` specifies the location of the KeyChain.
It is unsafe to access the same KeyChain from multiple processes simultaneously.
Therefore, NDNts does not provide a "default" KeyChain.

## Generate Key

```sh
ndntssec --locator /tmp/my-keychain gen-key /A
ndntssec --locator /tmp/my-keychain gen-key /A --type ec --curve P-384
ndntssec --locator /tmp/my-keychain gen-key /A --type rsa --modulus-length 1024
```

* The name can either be a subject name (called "identity" in other tools), or a key name.
* `--type` specifies key type: "ec" or "rsa".
* `--curve` specifies ECDSA curve: "P-256", "P-384", or "P-521".
* `--modulus-length` specifies RSA modulus length: 1024, 2048, 4096.
* Default is ECDSA key with P-256 curve.

This command adds a self-signed certificate to the KeyChain, and prints the certificate name to stdout.
You may retrieve the certificate with `ndntssec show-cert` command.

## Issue Certificate

```sh
ndntssec --locator /tmp/issuer-keychain issue-cert --issuer /B --issuer-id B --valid-days 72 < A-request.cert > A.cert
```

* `--issuer` specifies name prefix of a private key that signs (issues) the certificate.
  Default is any available key in the KeyChain.
* `--issuer-id` specifies the IssuerId name component.
  Default is an empty component.
* `--valid-days` specifies certificate ValidityPeriod in days from now.
  Default is 30 days.

This command reads a certificate request (self-signed certificate) in Base64 format from standard input, signs (issues) a certificate to the public key enclosed in the certificate request, and prints the issued certificate in Base64 format to standard output.

### Example

```shell
$ ndntssec --locator /tmp/issuer gen-key /issuer
/issuer/KEY/36=%00%05%96%BAy%B2%60%90/self/35=%00%00%01nD7%BB%12

$ ndntssec --locator /tmp/user gen-key /user
/user/KEY/36=%00%05%96%BAz%FCl%C0/self/35=%00%00%01nD8%0F%8E

$ ndntssec --locator /tmp/user show-cert /user/KEY/36=%00%05%96%BAz%FCl%C0/self/35=%00%00%01nD8%0F%8E \
  | ndntssec --locator /tmp/issuer issue-cert --issuer /issuer --issuer-id master -
-valid-days 72 \
  | ndntssec --locator /tmp/user add-cert

$ ndntssec --locator /tmp/user list-certs
/user/KEY/36=%00%05%96%BAz%FCl%C0/self/35=%00%00%01nD8%0F%8E
/user/KEY/36=%00%05%96%BAz%FCl%C0/master/35=%00%00%01nD9L%05
```

1. Generate `/issuer` key in issuer's KeyChain.
2. Generate `/user` key in user's KeyChain.
3. Show `/user` certificate request, have it signed by `/issuer`, and add the issued certificate to user's KeyChain.
4. Display certificates in user's KeyChain.
