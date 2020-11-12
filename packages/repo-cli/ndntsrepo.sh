#!/bin/bash
cd "$( dirname "${BASH_SOURCE[0]}" )"
export TS_CONFIG_PATH=$(readlink -f ../../mk/tsconfig-literate.json)
node --loader @k-foss/ts-esnode --experimental-specifier-resolution=node ./src/main.ts "$@"
