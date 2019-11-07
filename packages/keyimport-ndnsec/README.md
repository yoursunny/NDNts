# @ndn/keyimport-ndnsec

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package provides API and command line tool to import private keys from ndn-cxx KeyChain.

## SafeBag

This package can deal with [SafeBag](https://named-data.net/doc/ndn-cxx/0.6.6/specs/safe-bag.html) format, which contains certificate and private key exported by ndn-cxx `ndnsec` tool.
Since SafeBag contains encrypted PKCS#8 data that is not supported by WebCrypto, this package is only available in Node.js environment, and cannot work in browsers.

`ndnsec2ndnts safebag` command imports a SafeBag into an NDNts persistent KeyChain.

```sh
ndnsec key-gen /ME
ndnsec export /ME -P passw0rd > ME.safebag
ndnsec2ndnts safebag --locator /tmp/my-keychain --passphrase passw0rd ME.safebag
```

This command does not depend on `ndnsec` tool.
It can work even if ndn-cxx is not installed on the local machine.

## Clone from ndn-cxx KeyChain

`ndnsec2ndnts clone` command copies all private keys of current user's ndn-cxx KeyChain to an NDNts persistent KeyChain.

```sh
ndnsec2ndnts clone --locator /tmp/my-keychain
```

This command requires `ndnsec` tool to be installed on the local machine.
Due to [ndn-cxx limitation](https://redmine.named-data.net/issues/5043), this command is only able to copy the "default key" of each identity.
