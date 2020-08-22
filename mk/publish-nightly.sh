#!/bin/bash
set -e
set -o pipefail
ROOTDIR=$(pwd)

rm -rf mk/nightly-output/
mkdir -p mk/nightly-output/

VERSION=$(git show -s --format='%ct %H' | awk '{ printf "0.0.%s-nightly-%s", strftime("%Y%m%d", $1, 1), substr($2, 1, 7) }')
pnpm recursive exec --filter ./packages -- bash -c 'node '$ROOTDIR'/mk/edit-packagejson.js VCDN '$VERSION' && mv $(npm pack .) '$ROOTDIR'/mk/nightly-output/$(basename $(pwd)).tgz'

pushd mk/nightly-output/ >/dev/null
(
  echo '<!DOCTYPE html>'
  echo '<title>NDNts nightly build</title>'
  echo '<h1>NDNts nightly build '$VERSION'</h1>'
  echo '<p><a href="https://yoursunny.com/p/NDNts/">NDNts homepage</a> | <a href="https://yoursunny.com/t/2020/NDNts-nightly/">Usage Instructions</a></p>'
  echo '<pre>'
  ls *.tgz | awk '{ printf "https://ndnts-nightly.ndn.today/%s\n", $1 }'
  echo '</pre>'
  if [[ -n $GTAGID ]]; then
    echo '<script async src="https://www.googletagmanager.com/gtag/js?id='$GTAGID'"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","'$GTAGID'");</script>'
  fi
) >index.html
popd >/dev/null
cp docs/favicon.ico mk/nightly-output/
