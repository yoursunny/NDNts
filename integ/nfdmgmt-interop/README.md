# `@ndn/nfdmgmt` Interoperability Test

`NDNTS_UPLINK` must point to a running NFD or YaNFD as a local-scope face, such as:

* `export NDNTS_UPLINK=unix:///run/nfd/nfd.sock`
* `export NDNTS_UPLINK=tcp://127.0.0.1:6363`

To perform the tests, run one of these scripts and observe the stdout:

```bash
corepack pnpm literate integ/nfdmgmt-interop/general.ts
corepack pnpm literate integ/nfdmgmt-interop/face-rib.ts
corepack pnpm literate integ/nfdmgmt-interop/strategy.ts
corepack pnpm literate integ/nfdmgmt-interop/cs.ts
```
