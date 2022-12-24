#!/bin/bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"/..
ROOTDIR=$(pwd)
VERSIONSUFFIX=${1:-}

VERSION=0.0.$(git show -s --format='%ct' | awk '{ print strftime("%Y%m%d", $1, 1) }')$VERSIONSUFFIX
echo 'Publishing version '$VERSION >/dev/stderr

corepack pnpm whoami # check NPM login
git diff --exit-code # code must be committed

if [[ ${NDNTS_SKIP_BUILD:-0} -ne 1 ]]; then
  corepack pnpm build clean
  corepack pnpm build
  corepack pnpm lint
  git diff --exit-code
  corepack pnpm test
fi

RECURSE='corepack pnpm m --filter='./packages/**' --workspace-concurrency=1 exec'
$RECURSE bash -c 'node '$ROOTDIR'/mk/edit-packagejson.mjs V '$VERSION
git commit -a -m 'v'$VERSION

$RECURSE bash -c 'node '$ROOTDIR'/mk/edit-packagejson.mjs CDR '$VERSION
$RECURSE bash -c 'corepack pnpm publish --access public --no-git-checks'
git checkout -- .
