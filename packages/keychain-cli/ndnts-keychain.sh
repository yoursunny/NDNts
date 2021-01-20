#!/bin/bash
PKGDIR="$(dirname "${BASH_SOURCE[0]}")"
export TS_CONFIG_PATH=$(readlink -f ${PKGDIR}/../../mk/tsconfig-literate.json)
node --loader ${PKGDIR}/../../mk/loader.mjs --experimental-specifier-resolution=node ${PKGDIR}/src/main.ts "$@"
