#!/bin/bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"/..
ROOTDIR=$(pwd)
BASEURI=${NDNTS_PUBLISH_URI:-https://ndnts-nightly.ndn.today}

rm -rf mk/nightly-output/
mkdir -p mk/nightly-output/

git add .
VERSION=$(git show -s --format='%ct %H' | gawk '{ printf "0.0.%s-nightly-%s", strftime("%Y%m%d", $1, 1), substr($2, 1, 7) }')
corepack pnpm m --filter='./pkg/**' --workspace-concurrency=1 --reporter-hide-prefix exec \
  bash -c 'node '$ROOTDIR'/mk/edit-packagejson.mjs VCDN '$VERSION' &&
           mv $(corepack pnpm pack .) '$ROOTDIR'/mk/nightly-output/$(basename $(pwd)).tgz'
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
  echo '<script async src="https://www.googletagmanager.com/gtag/js?id=G-YSW3MP43Z4"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}if(location.hostname.endsWith(".ndn.today")){gtag("js",new Date());gtag("config","G-YSW3MP43Z4");}</script>'
) >index.html
popd >/dev/null
cp docs/favicon.ico mk/nightly-output/
