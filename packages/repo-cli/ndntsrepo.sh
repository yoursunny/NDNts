#!/bin/sh
cd "$( dirname "${BASH_SOURCE[0]}" )"
export TS_CONFIG_PATH=../../mk/tsconfig-literate.json
node --loader @k-foss/ts-esnode --experimental-specifier-resolution=node cli.cjs "$@"
