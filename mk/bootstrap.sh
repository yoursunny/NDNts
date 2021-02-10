#!/bin/bash
set -eo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"/..
ROOTDIR=$(pwd)

pnpm recursive exec --filter ./packages -- bash -c 'node '$ROOTDIR'/mk/make-pkg-tsconfig.js'
node mk/make-solution-tsconfig.js
