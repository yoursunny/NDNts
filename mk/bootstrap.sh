#!/bin/bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"/..
ROOTDIR=$(pwd)

corepack pnpm -r --filter='./pkg/**' exec -- bash -c "node ${ROOTDIR}/mk/make-pkg-tsconfig.mjs"
node mk/make-solution-tsconfig.mjs

(
  cd mk/node_modules/@k-foss/ts-esnode/out/dist
  for F in findFiles Utils; do
    if ! [[ -f $F ]]; then
      ln -s $F.js $F
    fi
  done
)
