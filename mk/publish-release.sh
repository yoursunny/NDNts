#!/bin/bash
set -e
npm run clean
npm run build
npm run build strip
npm test

VERSION=0.0.$(date +%Y%m%d)$1
pnpm recursive exec --filter ./packages -- bash -c 'node ../../mk/edit-packagejson.js V '$VERSION
git commit -a -m 'v'$VERSION

pnpm recursive exec --filter ./packages -- bash -c 'node ../../mk/edit-packagejson.js CDR '$VERSION' && npm publish --access public'
git checkout -- .
