#!/bin/bash
ROOTDIR=$(pwd)
pnpm recursive exec --filter ./packages --workspace-concurrency 1 -- node $ROOTDIR/mk/make-browser-bundle.mjs
