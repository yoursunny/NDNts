#!/bin/bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
export PATH="$(realpath ../../node_modules/.bin)":$PATH
vitest "$@"
