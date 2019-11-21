# @ndn/ndncert-ndnsec

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package offers a command line client for [NDN Certificate Management protocol](https://github.com/named-data/ndncert/wiki/NDNCERT-Protocol-0.2) that integrates with ndn-cxx KeyChain.
This tool allows fully automated NDN testbed certificate request.
It requires `ndnsec` tool to be present.

## Usage

```sh
# start NFD and connect to testbed

# retrieve CA config
ndnpeek -p /ndn/edu/ucla/yufeng/CA/_PROBE/INFO > ndncert-ucla.json

# request a certificate from the CA
ndncert-ndnsec --verbose --ca ndncert-ucla.json

# inspect installed certificates
ndnsec list -c
```

## Internal Workflow

1. Generate a random email address on `mailsac.com`.
2. Send a PROBE command to the CA, asking for namespace allocation.
3. Invoke `ndnsec key-gen` to generate a key pair, and import the private into an in-memory NDNts KeyChain.
4. Execute certificate request procedure, select email challenge.
5. Use `mailsac.com` API to read incoming email and extract PIN code.
6. Invoke `ndnsec cert-install` command to save issued certificate into ndn-cxx KeyChain.
