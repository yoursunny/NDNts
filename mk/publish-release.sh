#!/bin/bash
set -eo pipefail
ROOTDIR=$(pwd)
VERSIONSUFFIX=$1

VERSION=0.0.$(git show -s --format='%ct' | gawk '{ print strftime("%Y%m%d", $1, 1) }')$VERSIONSUFFIX
echo 'Publishing version '$VERSION >/dev/stderr

npm whoami # check NPM login

if [[ $NDNTS_SKIP_BUILD -ne 1 ]]; then
  npm run build clean
  npm run lint-ci
  npm run build
  npm test
fi

RECURSE='./node_modules/.bin/pnpm recursive exec --filter ./packages'
$RECURSE -- bash -c 'node '$ROOTDIR'/mk/edit-packagejson.js V '$VERSION
git commit -a -m 'v'$VERSION

$RECURSE -- bash -c 'node '$ROOTDIR'/mk/edit-packagejson.js CDR '$VERSION
$RECURSE -- bash -c 'npm publish --access public'
git checkout -- .
