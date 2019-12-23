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
    | xargs rm
  grep -E '\.js$' mk/tsfile.list \
    | xargs sed -i -e '/^import .* from "\.*\/.*";$/ s/";/.js";/' \
                  -e '/^export .* from "\.*\/.*";$/ s/";/.js";/' \
                  -e '/^\/\/\# sourceMappingURL=/ d'
  grep -E '\.d\.ts$' mk/tsfile.list \
    | xargs sed -i -e '/^\/\/\# sourceMappingURL=/ d'
  rm mk/tsfile.list
fi

# ES Module import paths should be URIs with '.js' extension.
# TypeScript allows '.js' in import paths, but ts-jest is unhappy.
# We have to leave '.js' off in TypeScript import paths, and modify the output files before publishing.
# To enable this transform, 'index.ts' should be avoided in favor of 'mod.ts'.
# Source Maps are stripped because (1) files are modified (2) source '.ts' files are not in package.
