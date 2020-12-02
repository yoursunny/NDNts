# @ndn/keychain-cli

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

**ndntssec** is a command line utility to access an NDNts persistent KeyChain.

`NDNTS_KEYCHAIN` environment variable specifies location of the KeyChain.
If missing, the command will operate on a temporary in-memory KeyChain, which is not particularly useful.

NDNts does not provide a "default" KeyChain, because it is unsafe to access the same KeyChain from multiple processes simultaneously.

## `ndntssec list-keys`: List Keys

```sh
NDNTS_KEYCHAIN=/tmp/my-keychain ndntssec list-keys
```

This command prints a list of key names to standard output.

## `ndntssec gen-key`: Generate Key

```sh
NDNTS_KEYCHAIN=/tmp/my-keychain ndntssec gen-key /A
NDNTS_KEYCHAIN=/tmp/my-keychain ndntssec gen-key /A --type ec --curve P-384
NDNTS_KEYCHAIN=/tmp/my-keychain ndntssec gen-key /A --type rsa --modulus-length 2048
```

* The name can either be a subject name (called "identity" in other tools), or a key name.
* `--type` specifies key type: "ec" or "rsa".
* `--curve` specifies ECDSA curve: "P-256", "P-384", or "P-521".
* `--modulus-length` specifies RSA modulus length: 2048, 4096.
* Default is ECDSA key with P-256 curve.

This command adds a self-signed certificate to the KeyChain, and prints the certificate name to stdout.
You may retrieve the self-signed certificate with `ndntssec show-cert` command.

## `ndntssec list-certs`: List Certificates

```sh
NDNTS_KEYCHAIN=/tmp/my-keychain ndntssec list-certs
```

This command prints a list of certificate names to standard output.

## `ndntssec show-cert`: Show Certificate

```sh
NDNTS_KEYCHAIN=/tmp/my-keychain ndntssec show-cert /A/KEY/36=%00%05%96%BA%2C%A5%89%F8/self/35=%00%00%01nD%24%01%87
```

This command prints the specified certificate in Base64 format to standard output.

## `ndntssec issue-cert`: Issue Certificate

```sh
NDNTS_KEYCHAIN=/tmp/issuer-keychain ndntssec issue-cert --issuer /B --issuer-id B --valid-days 72 < A-request.cert > A.cert
```

This command reads a certificate request (self-signed certificate) in Base64 format from standard input, signs (issues) a certificate to the public key enclosed in the certificate request, and prints the issued certificate in Base64 format to standard output.

* `--issuer` specifies name prefix of a private key that signs (issues) the certificate.
  Default is any available key in the KeyChain.
* `--issuer-id` specifies the IssuerId name component.
  Default is an empty component.
* `--valid-days` specifies certificate ValidityPeriod in days from now.
  Default is 30 days.

Example:

```shell
$ NDNTS_KEYCHAIN=/tmp/issuer ndntssec gen-key /issuer
/issuer/KEY/36=%00%05%96%BAy%B2%60%90/self/35=%00%00%01nD7%BB%12

$ NDNTS_KEYCHAIN=/tmp/user ndntssec gen-key /user
/user/KEY/36=%00%05%96%BAz%FCl%C0/self/35=%00%00%01nD8%0F%8E

$ NDNTS_KEYCHAIN=/tmp/user ndntssec show-cert /user/KEY/36=%00%05%96%BAz%FCl%C0/self/35=%00%00%01nD8%0F%8E \
  | NDNTS_KEYCHAIN=/tmp/issuer ndntssec issue-cert --issuer /issuer --issuer-id master --valid-days 72 \
  | NDNTS_KEYCHAIN=/tmp/user ndntssec add-cert

$ NDNTS_KEYCHAIN=/tmp/user ndntssec list-certs
/user/KEY/36=%00%05%96%BAz%FCl%C0/self/35=%00%00%01nD8%0F%8E
/user/KEY/36=%00%05%96%BAz%FCl%C0/master/35=%00%00%01nD9L%05
```

1. Generate `/issuer` key in issuer's KeyChain.
2. Generate `/user` key in user's KeyChain.
3. Show `/user` certificate request, have it signed by `/issuer`, and add the issued certificate to user's KeyChain.
4. Display certificates in user's KeyChain.

## `ndntssec add-cert`: Add Certificate

```sh
NDNTS_KEYCHAIN=/tmp/my-keychain ndntssec add-cert < A.cert
```

This command reads a certificate in Base64 format from standard input, and saves it in the KeyChain.
The corresponding key must exist in the KeyChain.

## `ndntssec delete`: Delete Keys and Certificates

```sh
NDNTS_KEYCHAIN=/tmp/my-keychain ndntssec delete /A
```

This command deletes keys and certificates under a name prefix.

## `ndntssec import-safebag`: Import ndn-cxx SafeBag

```sh
ndnsec export -i /subject -P 888888 | NDNTS_KEYCHAIN=/tmp/my-keychain ndntssec import-safebag --passphrase 888888
```

This command reads a ndn-cxx [SafeBag](https://named-data.net/doc/ndn-cxx/0.6.6/specs/safe-bag.html) object in Base64 format from standard input, and saves the enclosed private key, public key, and certificate in the KeyChain.

## `ndntssec import-ndnsec`: Import ndn-cxx KeyChain via ndnsec

```sh
NDNTS_KEYCHAIN=/tmp/my-keychain ndntssec import-ndnsec

NDNTS_KEYCHAIN=/tmp/my-keychain ndntssec import-ndnsec --prefix /subject
```

This command copies keys and certificates from ndn-cxx KeyChain using `ndnsec` executable, and prints imported key names to standard output.

* `--prefix` limits key names to be under a prefix.
  Default is importing all keys.

See `@ndn/ndnsec` package for more information.

## `ndntssec ndncert03-*`: NDNCERT 0.3

`ndntssec ndncert03-make-profile` command generates a CA profile.

* `--out` specifies output filename.
  The file contains the CA profile Data packet in binary format.
* `--prefix` specifies the name prefix for the CA.
  Conventionally, it should end with `CA` component.
* `--cert` specifies the certificate name for the CA.
  The certificate and the corresponding private key must exist in the keychain given in `NDNTS_KEYCHAIN` environment variable.
* `--valid-days` specifies maximum validity period of issued certificates, in days.
  The default is 30 days.

`ndntssec ndncert03-show-profile` command displays information in a CA profile.

* `--profile` specifies filename of CA profile.

`ndntssec ndncert03-ca` command runs a certificate authority.

* `--profile` specifies filename of CA profile.
* `--store` specifies directory path of a repository that stores issued certificates.
* `--challenge nop` enables "nop" challenge that approves all certificate requests.
* `--challenge pin` enables "pin" challenge that requires the requester to enter a 6-digit PIN code.
  The correct PIN code is displayed on the console of CA.
* `--challenge possession` enables "possession" challenge that requires the requester to own a certificate from a specified issuer.
* `--possession-issuer` specifies filename of issuer certificate to fulfill possession challenge.
  The default is the CA certificate in the CA profile.

`ndntssec ndncert03-client` command requests a certificate.

* `--profile` specifies filename of CA profile.
* `--ndnsec` uses ndn-cxx keychain instead of NDNts keychain.
* `--key` specifies the key name to obtain certificate for.
  The key pair must exist in the keychain given in `NDNTS_KEYCHAIN` environment variable, or ndn-cxx keychain if `--ndnsec` is specified.
* `--challenge nop` enables "nop" challenge.
* `--challenge pin` enables "pin" challenge.
* `--challenge possession` enables "possession" challenge.
* `--possession-cert` specifies existing certificate name to fulfill possession challenge.
  This is required when enabling possession challenge, and the certificate and the corresponding private key must exist in the keychain.
* You may specify multiple challenges, and the first one allowed by the server will be used.

CA example:

```sh
# generate CA key
CACERT=$(NDNTS_KEYCHAIN=/tmp/ca-keychain ndntssec gen-key /A)

# make CA profile
NDNTS_KEYCHAIN=/tmp/ca-keychain ndntssec ndncert03-make-profile --out /tmp/ca.data --prefix /localhost/my-ndncert/CA --cert $CACERT --valid-days 60

# display CA profile
ndntssec ndncert03-show-profile --profile /tmp/ca.data

# start CA
nfd-start
NDNTS_KEYCHAIN=/tmp/ca-keychain NDNTS_NFDREG=1 ndntssec ndncert03-ca --profile /tmp/ca.data --store /tmp/ca-repo --challenge pin
```

Client example using NDNts keychain:

```sh
# generate key pair
REQCERT=$(NDNTS_KEYCHAIN=/tmp/req-keychain ndntssec gen-key /B)
REQKEY=$(echo $REQCERT | awk 'BEGIN { FS=OFS="/" } { NF-=2; print }')

# request certificate via NDNCERT
# (you'll need to enter the PIN shown on CA console)
NDNTS_KEYCHAIN=/tmp/req-keychain ndntssec ndncert03-client --profile /tmp/ca.data --key $REQKEY --challenge pin

# view certificates
NDNTS_KEYCHAIN=/tmp/req-keychain ndntssec list-certs
```

Client example using ndn-cxx keychain:

```sh
# generate key pair
ndnsec key-gen -te /C >/dev/null
REQKEY=$(ndnsec list -k | awk '$1=="+->*" && $2 ~ "^/C/" { print $2 }')

# request certificate via NDNCERT
# (you'll need to enter the PIN shown on CA console)
ndntssec ndncert03-client --profile /tmp/ca.data --ndnsec --key $REQKEY --challenge pin

# view certificates
ndnsec list -c
```

Proof of possession challenge example: (client uses ndn-cxx keychain)

```sh
# generate "other" issuer key
ndnsec key-gen -te /O >/dev/null
ndnsec cert-dump -i /O >/tmp/O.ndncert

# issue "existing" certificate
ndnsec key-gen -te /E >/tmp/E-self.ndncert
ndnsec cert-gen -s /O -i ISSUER-O /tmp/E-self.ndncert >/tmp/E.ndncert
ndnsec cert-install /tmp/E.ndncert

# generate CA key, make CA profile
CACERT=$(NDNTS_KEYCHAIN=/tmp/ca-keychain ndntssec gen-key /A)
NDNTS_KEYCHAIN=/tmp/ca-keychain ndntssec ndncert03-make-profile --out /tmp/ca.data --prefix /localhost/my-ndncert/CA --cert $CACERT --valid-days 60

# start CA with proof of possession challenge
nfd-start
NDNTS_KEYCHAIN=/tmp/ca-keychain NDNTS_NFDREG=1 ndntssec ndncert03-ca --profile /tmp/ca.data --store /tmp/ca-repo --challenge possession --possession-issuer /tmp/O.ndncert

# (in another console window)
# request certificate via NDNCERT using proof of possession challenge
REQKEY=$(ndnsec list -k | awk '$1=="+->*" && $2 ~ "^/E/" { print $2 }')
OCERT=$(ndnsec list -c | awk '$1=="+->*" && $2 ~ "^'$REQKEY'/ISSUER-O/" { print $2 }')
ndntssec ndncert03-client --profile /tmp/ca.data --ndnsec --key $REQKEY --challenge possession --possession-cert $OCERT

# view certificates
ndnsec list -c
ndnsec cert-dump -p -i /E
```
