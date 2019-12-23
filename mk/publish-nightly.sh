#!/bin/bash
rm -rf mk/nightly-temp/
verdaccio -c mk/verdaccio-nightly.yaml &
VERDACCIO_PID=$!
export npm_config_registry=http://127.0.0.1:64448
VERSION=0.0.$(date +%Y%m%d)-nightly.$(git log --pretty=format:'%h' -n 1)
pnpm recursive exec --filter ./packages -- bash -c 'node ../../mk/edit-packagejson.js VCDN '$VERSION' && pnpm publish'
kill $VERDACCIO_PID

mkdir -p mk/nightly-output/
for TARBALL in $(find mk/nightly-temp/ -name '*.tgz'); do
  cp $TARBALL mk/nightly-output/$(basename $(dirname $TARBALL)).tgz
done

pushd mk/nightly-output/ >/dev/null
(
  echo '<!DOCTYPE html>'
  echo '<title>NDNts nightly build</title>'
  echo '<h1>NDNts nightly build '$VERSION'</h1>'
  echo '<p><a href="https://yoursunny.com/p/NDNts/">NDNts homepage</a></p>'
  echo '<pre>'
  ls *.tgz
  echo '</pre>'
) > index.html
popd >/dev/null
cp docs/favicon.ico mk/nightly-output/
