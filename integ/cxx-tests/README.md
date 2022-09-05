# NDNts C++ Compatibility Tests

These integration tests confirm NDNts is compatible with C++ reference implementations.
They only work on Linux, and require `build-essential libndn-cxx-dev libpsync-dev pkg-config` packages.

`corepack pnpm test` runs the tests.
C++ compilation is handled automatically.

`corepack pnpm clang-format` at the codebase root fixes C++ code style.
This requires `clang-format-11` package.

## Run in Docker

```bash
docker build -t ndnts-cxx - <<EOT
  FROM node:18-bullseye
  RUN echo "deb [trusted=yes] https://nfd-nightly-apt.ndn.today/debian bullseye main" > /etc/apt/sources.list.d/nfd-nightly.list \
   && apt-get update \
   && apt-get -y -qq install --no-install-recommends clang-format-11 libndn-cxx-dev libpsync-dev ndnsec pkg-config \
   && rm -rf /var/lib/apt/lists/*
EOT

docker run -it --rm \
  --network host --mount type=bind,source=$(pwd),target=/NDNts \
  --user $(id -u):$(id -g) --workdir /NDNts \
  ndnts-cxx bash
```
