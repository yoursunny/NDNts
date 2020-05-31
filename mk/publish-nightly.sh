#!/bin/bash
set -e
set -o pipefail
ROOTDIR=$(pwd)

rm -rf mk/nightly-output/
mkdir -p mk/nightly-output/

VERSION=0.0.$(date +%Y%m%d)-nightly.$(git log --pretty=format:'%h' -n 1)
pnpm recursive exec --filter ./packages -- bash -c 'node '$ROOTDIR'/mk/edit-packagejson.js VCDN '$VERSION' && mv $(npm pack .) '$ROOTDIR'/mk/nightly-output/$(basename $(pwd)).tgz'

pushd mk/nightly-output/ >/dev/null
(
  echo '<!DOCTYPE html>'
  echo '<title>NDNts nightly build</title>'
  echo '<h1>NDNts nightly build '$VERSION'</h1>'
  echo '<p><a href="https://yoursunny.com/p/NDNts/">NDNts homepage</a></p>'
  echo '<pre>'
  ls *.tgz
  echo '</pre>'
) >index.html
popd >/dev/null
cp docs/favicon.ico mk/nightly-output/
