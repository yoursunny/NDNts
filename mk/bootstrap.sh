#!/bin/bash
set -eo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"/..
ROOTDIR=$(pwd)

./node_modules/.bin/pnpm --filter ./packages recursive exec -- bash -c 'node '$ROOTDIR'/mk/make-pkg-tsconfig.js'
node mk/make-solution-tsconfig.js
