#!/bin/bash
set -eo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"/..

GTAG=
if [[ -n $GTAGID ]]; then
  GTAG="--gaID $GTAGID"
fi

typedoc --tsconfig mk/tsconfig-typedoc.json $(find packages -maxdepth 3 '(' -name 'mod.ts' -o -name 'main.ts' ')' -path 'packages/*/src/*.ts' -printf '--entryPoints %p\n') $GTAG
