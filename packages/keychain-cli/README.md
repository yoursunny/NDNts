# @ndn/keychain-cli

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

**ndnts-keychain** is a command line utility to access an NDNts persistent KeyChain.

`NDNTS_KEYCHAIN` environment variable specifies location of the KeyChain.
If missing, the command will operate on an in-memory ephemeral KeyChain, which is not particularly useful.

NDNts does not provide a "default" KeyChain, because it is unsafe to access the same KeyChain from multiple processes concurrently.

## `ndnts-keychain list-keys`: List Keys

```bash
NDNTS_KEYCHAIN=/tmp/my-keychain ndnts-keychain list-keys
```

This command prints a list of key names to standard output.

## `ndnts-keychain gen-key`: Generate Key

```bash
NDNTS_KEYCHAIN=/tmp/my-keychain ndnts-keychain gen-key /A
NDNTS_KEYCHAIN=/tmp/my-keychain ndnts-keychain gen-key /A --type ec --curve P-384
NDNTS_KEYCHAIN=/tmp/my-keychain ndnts-keychain gen-key /A --type rsa --modulus-length 2048
```

* The name can either be a subject name (called "identity" in other tools), or a key name.
* `--type` specifies key type: "ec" or "rsa".
* `--curve` specifies ECDSA curve: "P-256", "P-384", or "P-521".
* `--modulus-length` specifies RSA modulus length: 2048, 4096.
* Default is ECDSA key with P-256 curve.

This command adds a self-signed certificate to the KeyChain, and prints the certificate name to stdout.
You may retrieve the self-signed certificate with `ndnts-keychain show-cert` command.

## `ndnts-keychain list-certs`: List Certificates

```bash
NDNTS_KEYCHAIN=/tmp/my-keychain ndnts-keychain list-certs
```

This command prints a list of certificate names to standard output.

## `ndnts-keychain show-cert`: Show Certificate

```bash
NDNTS_KEYCHAIN=/tmp/my-keychain ndnts-keychain show-cert /A/KEY/56=%00%05%96%BA%2C%A5%89%F8/self/52=%00%00%01nD%24%01%87
```

This command prints the specified certificate in Base64 format to standard output.

## `ndnts-keychain issue-cert`: Issue Certificate

```bash
NDNTS_KEYCHAIN=/tmp/issuer-keychain ndnts-keychain issue-cert --issuer /B --issuer-id B --valid-days 72 < A-request.cert > A.cert
```

This command reads a certificate request (self-signed certificate) in Base64 format from standard input, signs (issues) a certificate to the public key enclosed in the certificate request, and prints the issued certificate in Base64 format to standard output.

* `--issuer` specifies a private key that signs (issues) the certificate.
  This may be a key name or a certificate name.
* `--issuer-id` specifies the IssuerId name component.
  Default is an empty component.
* `--valid-days` specifies certificate ValidityPeriod in days from now.
  Default is 30 days.
* `--use-key-name-locator` forces the KeyLocator of the issued certificate to contain a key name instead of a certificate name.

Example:

```shell
$ NDNTS_KEYCHAIN=/tmp/issuer ndnts-keychain gen-key /issuer
/issuer/KEY/56=%00%05%96%BAy%B2%60%90/self/54=%00%00%01nD7%BB%12

$ NDNTS_KEYCHAIN=/tmp/user ndnts-keychain gen-key /user
/user/KEY/56=%00%05%96%BAz%FCl%C0/self/54=%00%00%01nD8%0F%8E

$ NDNTS_KEYCHAIN=/tmp/user ndnts-keychain show-cert /user/KEY/56=%00%05%96%BAz%FCl%C0/self/54=%00%00%01nD8%0F%8E \
  | NDNTS_KEYCHAIN=/tmp/issuer ndnts-keychain issue-cert --issuer /issuer --issuer-id parent --valid-days 72 \
  | NDNTS_KEYCHAIN=/tmp/user ndnts-keychain add-cert

$ NDNTS_KEYCHAIN=/tmp/user ndnts-keychain list-certs
/user/KEY/56=%00%05%96%BAz%FCl%C0/self/54=%00%00%01nD8%0F%8E
/user/KEY/56=%00%05%96%BAz%FCl%C0/parent/54=%00%00%01nD9L%05
```

1. Generate `/issuer` key in issuer's KeyChain.
2. Generate `/user` key in user's KeyChain.
3. Show `/user` certificate request, have it signed by `/issuer`, and add the issued certificate to user's KeyChain.
4. Display certificates in user's KeyChain.

## `ndnts-keychain add-cert`: Add Certificate

```bash
NDNTS_KEYCHAIN=/tmp/my-keychain ndnts-keychain add-cert < A.cert
```

This command reads a certificate in Base64 format from standard input, and saves it in the KeyChain.
The corresponding key must exist in the KeyChain.

## `ndnts-keychain delete`: Delete Keys and Certificates

```bash
NDNTS_KEYCHAIN=/tmp/my-keychain ndnts-keychain delete /A
```

This command deletes keys and certificates under a name prefix.

## `ndnts-keychain import-safebag`: Import ndn-cxx SafeBag

```bash
ndnsec export -i /subject -P 888888 | NDNTS_KEYCHAIN=/tmp/my-keychain ndnts-keychain import-safebag --passphrase 888888
```

This command reads a ndn-cxx [SafeBag](https://named-data.net/doc/ndn-cxx/0.8.0/specs/safe-bag.html) object in Base64 format from standard input, and saves the enclosed private key, public key, and certificate in the KeyChain.

## `ndnts-keychain import-ndnsec`: Import ndn-cxx KeyChain via ndnsec

```bash
NDNTS_KEYCHAIN=/tmp/my-keychain ndnts-keychain import-ndnsec

NDNTS_KEYCHAIN=/tmp/my-keychain ndnts-keychain import-ndnsec --prefix /subject
```

This command copies keys and certificates from ndn-cxx KeyChain using `ndnsec` executable, and prints imported key names to standard output.

* `--prefix` limits key names to be under a prefix.
  Default is importing all keys.

See `@ndn/ndnsec` package for more information.

## `ndnts-keychain ndncert03-*`: NDNCERT 0.3

`ndnts-keychain ndncert03-make-profile` command generates a CA profile.

* `--out` specifies output filename.
  The file contains the CA profile Data packet in binary format.
* `--prefix` specifies the name prefix for the CA.
  Conventionally, it should end with `CA` component.
* `--cert` specifies the certificate name for the CA.
  The certificate and the corresponding private key must exist in the keychain given in `NDNTS_KEYCHAIN` environment variable.
* `--valid-days` specifies maximum validity period of issued certificates, in days.
  The default is 30 days.

`ndnts-keychain ndncert03-show-profile` command displays information in a CA profile.

* `--profile` specifies filename of CA profile.
  This may be either the CA profile Data packet in binary format or *client.conf* format compatible with NDNCERT C++ implementation.
* `--json` changes the output to machine-readable JSON format.
* `--clientconf` changes the output to *client.conf* format.
  This option is useful for converting a binary CA profile to use with NDNCERT C++ implementation.

`ndnts-keychain ndncert03-ca` command runs a certificate authority.

* `--profile` specifies filename of CA profile.
  This should be the CA profile Data packet in binary format.
* `--store` specifies directory path of a repository that stores issued certificates.
* `--challenge nop` enables "nop" challenge that approves all certificate requests.
* `--challenge pin` enables "pin" challenge that requires the requester to enter a 6-digit PIN code.
  The correct PIN code is displayed on the console of CA.
* `--challenge email` enables "email" challenge.
  The following environment variables are required when enabling email challenge: `CA_EMAIL_HOST`, `CA_EMAIL_PORT`, `CA_EMAIL_USER`, `CA_EMAIL_PASS`, `CA_EMAIL_FROM`.
* `--challenge possession` enables "possession" challenge that requires the requester to own a certificate from a specified issuer.
* `--possession-issuer` specifies filename of issuer certificate to fulfill possession challenge.
  The default is the CA certificate in the CA profile.

`ndnts-keychain ndncert03-client` command requests a certificate.

* `--profile` specifies filename of CA profile.
  This may be either the CA profile Data packet in binary format or *client.conf* format compatible with NDNCERT C++ implementation.
* `--ndnsec` uses ndn-cxx keychain instead of NDNts keychain.
* `--key` specifies the key name to obtain certificate for.
  The key pair must exist in the keychain given in `NDNTS_KEYCHAIN` environment variable, or ndn-cxx keychain if `--ndnsec` is specified.
  This also accepts a certificate name, whose key will be used.
* If `--key` is omitted, the client sends a PROBE request to the CA.
  Probe parameters are prompted interactively, except that `--email` may be used as `email` parameter.
  Then, it creates a new key whose subject name is the first available name in the PROBE response.
  PROBE response that contains only redirects is not supported and will result in an error.
* `--challenge nop` enables "nop" challenge.
* `--challenge pin` enables "pin" challenge.
* `--challenge email` enables "email" challenge.
* `--email` specifies email address to use in the email challenge.
* `--challenge possession` enables "possession" challenge.
* `--possession-cert` specifies existing certificate name to fulfill possession challenge.
  If `--key` is a certificate name, this may be omitted if using the same certificate.
  The specified certificate and its corresponding private key must exist in the keychain.
* You may specify multiple challenges, and the first one allowed by the server will be used.

### NDNCERT examples

CA setup with PIN challenge:

```bash
# generate CA key
CACERT=$(NDNTS_KEYCHAIN=/tmp/ca-keychain ndnts-keychain gen-key /A)

# make CA profile
NDNTS_KEYCHAIN=/tmp/ca-keychain ndnts-keychain ndncert03-make-profile --out /tmp/ca.data --prefix /localhost/my-ndncert/CA --cert $CACERT --valid-days 60

# display CA profile
ndnts-keychain ndncert03-show-profile --profile /tmp/ca.data

# start CA with PIN challenge
nfd-start
NDNTS_KEYCHAIN=/tmp/ca-keychain ndnts-keychain ndncert03-ca --profile /tmp/ca.data --store /tmp/ca-repo --challenge pin
```

Client using PIN challenge, with NDNts keychain:

```bash
# generate key pair
REQCERT=$(NDNTS_KEYCHAIN=/tmp/req-keychain ndnts-keychain gen-key /B)
REQKEY=$(echo $REQCERT | gawk 'BEGIN { FS=OFS="/" } { NF-=2; print }')

# request certificate with PIN challenge; you'll need to enter the PIN shown on CA console
NDNTS_KEYCHAIN=/tmp/req-keychain ndnts-keychain ndncert03-client --profile /tmp/ca.data --key $REQKEY --challenge pin

# view certificates
NDNTS_KEYCHAIN=/tmp/req-keychain ndnts-keychain list-certs
```

Client using PIN challenge, with ndn-cxx keychain:

```bash
# generate key pair
ndnsec key-gen -te /C >/dev/null
REQKEY=$(ndnsec list -k | gawk '$1=="+->*" && $2 ~ "^/C/" { print $2 }')

# request certificate with PIN challenge; you'll need to enter the PIN shown on CA console
ndnts-keychain ndncert03-client --profile /tmp/ca.data --ndnsec --key $REQKEY --challenge pin

# view certificates
ndnsec list -c
```

Email challenge, NDNts keychain on client side:

```bash
# before start, prepare CA profile using commands in the PIN challenge example

export CA_EMAIL_HOST=smtp.ethereal.email
export CA_EMAIL_PORT=587
export CA_EMAIL_USER=mireya.hoeger51@ethereal.email
export CA_EMAIL_PASS=ZMGMfXc1E7NvMr9sJB
export CA_EMAIL_FROM=$CA_EMAIL_USER

# start CA with email challenge
nfd-start
NDNTS_KEYCHAIN=/tmp/ca-keychain ndnts-keychain ndncert03-ca --profile /tmp/ca.data --store /tmp/ca-repo --challenge email

# generate key pair
REQCERT=$(NDNTS_KEYCHAIN=/tmp/req-keychain ndnts-keychain gen-key /M)
REQKEY=$(echo $REQCERT | gawk 'BEGIN { FS=OFS="/" } { NF-=2; print }')

# request certificate with email challenge; you'll need to enter the PIN received from email
REQEMAIL=someone@example.com
NDNTS_KEYCHAIN=/tmp/req-keychain ndnts-keychain ndncert03-client --profile /tmp/ca.data --key $REQKEY --challenge email --email $REQEMAIL

# view certificates
NDNTS_KEYCHAIN=/tmp/req-keychain ndnts-keychain list-certs
```

Proof of possession challenge, ndn-cxx keychain on client side:

```bash
# generate "other" issuer key
ndnsec key-gen -te /O >/dev/null
ndnsec cert-dump -i /O >/tmp/O.ndncert

# issue "existing" certificate
ndnsec key-gen -te /E >/tmp/E-self.ndncert
ndnsec cert-gen -s /O -i ISSUER-O /tmp/E-self.ndncert >/tmp/E.ndncert
ndnsec cert-install /tmp/E.ndncert

# generate CA key, make CA profile
CACERT=$(NDNTS_KEYCHAIN=/tmp/ca-keychain ndnts-keychain gen-key /A)
NDNTS_KEYCHAIN=/tmp/ca-keychain ndnts-keychain ndncert03-make-profile --out /tmp/ca.data --prefix /localhost/my-ndncert/CA --cert $CACERT --valid-days 60

# start CA with possession challenge
nfd-start
NDNTS_KEYCHAIN=/tmp/ca-keychain ndnts-keychain ndncert03-ca --profile /tmp/ca.data --store /tmp/ca-repo --challenge possession --possession-issuer /tmp/O.ndncert

# request certificate with possession challenge
REQKEY=$(ndnsec list -k | gawk '$1=="+->*" && $2 ~ "^/E/" { print $2 }')
OCERT=$(ndnsec list -c | gawk '$1=="+->*" && $2 ~ "^'$REQKEY'/ISSUER-O/" { print $2 }')
ndnts-keychain ndncert03-client --profile /tmp/ca.data --ndnsec --key $REQKEY --challenge possession --possession-cert $OCERT

# view certificates
ndnsec list -c
ndnsec cert-dump -p -i /E
```
