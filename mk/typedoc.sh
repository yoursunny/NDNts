#!/bin/bash
set -eo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"/..

GTAG=
if [[ -n $GTAGID ]]; then
  GTAG="--gaID $GTAGID"
fi

exec env NODE_OPTIONS='--max-old-space-size=4096' typedoc --tsconfig mk/tsconfig-typedoc.json --entryPoints 'packages/*' $GTAG
