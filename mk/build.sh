#!/bin/bash
set -e
ACT=$1

if [[ $ACT == watch ]]; then
  tsc -b mk/tsconfig-solution.json -w
elif [[ -z $ACT ]] || [[ $ACT == build ]]; then
  tsc -b mk/tsconfig-solution.json --listEmittedFiles \
  | awk '$1=="TSFILE:" { print $2 }' > mk/tsfile.list
elif [[ $ACT == strip ]] && [[ -f mk/tsfile.list ]]; then
  grep -E '\.map$' mk/tsfile.list \
    | xargs rm -f
  grep -E '\.js$' mk/tsfile.list | xargs node mk/build-stripjs.js
  grep -E '\.d\.ts$' mk/tsfile.list \
    | xargs sed -i -e '/^\/\/\# sourceMappingURL=/ d'
  rm mk/tsfile.list
fi
