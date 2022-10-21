#!/bin/bash
PKGDIR="$(readlink -f $(dirname "${BASH_SOURCE[0]}"))"
export TS_CONFIG_PATH=$(readlink -f ${PKGDIR}/../../mk/tsconfig-literate.json)
node --loader ${PKGDIR}/../../mk/loader.mjs ${PKGDIR}/lib/main_node.js "$@"
