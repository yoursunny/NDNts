#!/bin/bash
pnpm recursive exec --filter ./packages -- bash -c 'node ../../mk/make-pkg-tsconfig.js'
node mk/make-solution-tsconfig.js
