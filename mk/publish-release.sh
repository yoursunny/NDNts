#!/bin/bash
set -e
set -o pipefail

npm whoami

npm run build clean
npm run lint-ci
npm run literate lint
npm run build
npm test

VERSION=0.0.$(date +%Y%m%d)$1
pnpm recursive exec --filter ./packages -- bash -c 'node ../../mk/edit-packagejson.js V '$VERSION
git commit -a -m 'v'$VERSION

pnpm recursive exec --filter ./packages -- bash -c 'node ../../mk/edit-packagejson.js CDR '$VERSION
pnpm recursive exec --filter ./packages -- bash -c 'npm publish --access public'
git checkout -- .
