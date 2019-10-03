# NDNts ndn-cxx Compatibility Tests

These integration tests confirm NDNts is compatible with ndn-cxx reference implementation.
They only work on Ubuntu Linux, and require `build-essential clang-format-6.0 libndn-cxx-dev` packages.

* `npm test` executes the tests. C++ compilation is handled automatically.
* `npm run lint` fixes C++ code style.
