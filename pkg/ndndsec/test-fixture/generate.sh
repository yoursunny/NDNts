#!/bin/bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

mkdir -p pem
VALIDITY='--start 20250129043001 --end 20280229230059'

gen_key_cert() {
  local KEYFILE=pem/$1.key
  local CERTFILE=pem/$1.cert
  local NAME=/demo/ndnd-key/$1
  shift
  if [[ -f $KEYFILE ]] && [[ -f $CERTFILE ]]; then
    return
  fi
  ndnd sec keygen $NAME "$@" >$KEYFILE
  ndnd sec sign-cert $KEYFILE $VALIDITY <$KEYFILE >$CERTFILE
}

gen_key_cert Ed25519 ed25519
gen_key_cert RSA-2048 rsa 2048
gen_key_cert RSA-4096 rsa 4096
gen_key_cert EC-P256 ecc secp256r1
gen_key_cert EC-P384 ecc secp384r1
gen_key_cert EC-P521 ecc secp521r1
