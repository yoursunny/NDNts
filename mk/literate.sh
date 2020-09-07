#!/bin/bash
set -e
set -o pipefail
ROOTDIR=$(pwd)

literate_run() {
  if [[ $1 =~ .*\.ts ]]; then
    echo -e '\n\e[96m'RUNNING $1'\e[39m'
    pushd $(dirname $1) >/dev/null
    TSFILE=$(basename $1)
  elif [[ -f $1/README.md ]]; then
    echo -e '\n\e[96m'RUNNING EXAMPLES IN $1/README.md'\e[39m'
    pushd $1 >/dev/null
    TSFILE=literate-temp.ts
    codedown ts <README.md >$TSFILE
  fi
  export TS_CONFIG_PATH=$ROOTDIR/mk/tsconfig-literate.json
  node --loader @k-foss/ts-esnode --experimental-specifier-resolution=node $TSFILE
  popd >/dev/null
}

if [[ $1 == 'extract' ]]; then
  for F in $(grep -l '```ts' packages/*/README.md); do
    codedown ts <$F >$(dirname $F)/literate-temp.ts
  done
  exit
fi

if [[ $1 == 'lint' ]]; then
  for F in $(grep -l '```ts' packages/*/README.md); do
    codedown ts <$F | xo --stdin --stdin-filename=$F.ts
  done
  exit
fi

if [[ -z $1 ]]; then
  for F in $(grep -l '```ts' packages/*/README.md); do
    literate_run $(dirname $F)
  done
  exit
fi

literate_run $1
