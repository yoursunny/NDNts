#!/bin/bash
set -eo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"/..
ROOTDIR=$(pwd)
BASEURI=${NDNTS_PUBLISH_URI:-https://ndnts-nightly.ndn.today}

rm -rf mk/nightly-output/
mkdir -p mk/nightly-output/

git add .
VERSION=$(git show -s --format='%ct %H' | gawk '{ printf "0.0.%s-nightly-%s", strftime("%Y%m%d", $1, 1), substr($2, 1, 7) }')
./node_modules/.bin/pnpm -r --filter ./packages exec -- bash -c 'node '$ROOTDIR'/mk/edit-packagejson.js VCDN '$VERSION' && mv $(npm pack .) '$ROOTDIR'/mk/nightly-output/$(basename $(pwd)).tgz'
git checkout -- .

pushd mk/nightly-output/ >/dev/null
(
  echo '<!DOCTYPE html>'
  echo '<title>NDNts nightly build</title>'
  echo '<h1>NDNts nightly build '$VERSION'</h1>'
  echo '<p><a href="https://yoursunny.com/p/NDNts/">NDNts homepage</a> | <a href="https://yoursunny.com/t/2020/NDNts-nightly/">Usage Instructions</a></p>'
  echo '<pre>'
  ls *.tgz | gawk '{ printf "'$BASEURI'/%s\n", $1 }'
  echo '</pre>'
  if [[ -n $GTAGID ]]; then
    echo '<script async src="https://www.googletagmanager.com/gtag/js?id='$GTAGID'"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","'$GTAGID'");</script>'
  fi
) >index.html
popd >/dev/null
cp docs/favicon.ico mk/nightly-output/
