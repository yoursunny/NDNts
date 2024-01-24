# @ndn/fileserver

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements [ndn6-file-server](https://github.com/yoursunny/ndn6-tools/blob/main/file-server.md) protocol.

## Features

Data structures, encoding and decoding:

* assigned numbers and keywords
* FileMetadata
* directory listing

Client (consumer):

* simple client
  * demonstrated in `@ndn/cat` package `file-client` subcommand
* [BrowserFS](https://browser-fs.github.io/core/) wrapper
  * rudimentary, not really usable

Server (producer): not yet.
