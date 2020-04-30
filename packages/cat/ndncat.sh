#!/bin/sh
node --experimental-modules --loader ../../mk/esm-loader.mjs --experimental-specifier-resolution=node cli.cjs "$@"
