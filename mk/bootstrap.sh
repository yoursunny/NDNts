#!/bin/bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"/..
ROOTDIR=$(pwd)

corepack pnpm -r --filter='./packages/**' exec -- bash -c "node ${ROOTDIR}/mk/make-pkg-tsconfig.js"
node mk/make-solution-tsconfig.js
