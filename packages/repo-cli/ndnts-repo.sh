#!/bin/bash
PKGDIR="$(readlink -f $(dirname "${BASH_SOURCE[0]}"))"
node --import ${PKGDIR}/../../mk/loader-import.mjs ${PKGDIR}/lib/main_node.js "$@"
