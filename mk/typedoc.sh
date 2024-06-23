#!/bin/bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"/..

ENTRYPOINTS='pkg/*'
if [[ $# -gt 0 ]]; then
  ENTRYPOINTS=''
fi

exec env NODE_OPTIONS='--max-old-space-size=6144' typedoc --options mk/typedoc.config.cjs --tsconfig mk/tsconfig-typedoc.json --entryPoints $ENTRYPOINTS "$@"
