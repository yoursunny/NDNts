#include <PSync/full-producer.hpp>

#include <boost/asio/signal_set.hpp>

#include <iostream>

using namespace ndn::time_literals;

int
main(int argc, char* argv[]) {
  ndn::Face face("127.0.0.1", argv[1]);
  ndn::KeyChain keyChain;

  psync::FullProducer::Options opts;
  opts.onUpdate = [](const std::vector<psync::MissingDataInfo>& updates) {
    for (const auto& update : updates) {
      std::cout << update.prefix << "\t" << update.lowSeq << "\t" << update.highSeq << std::endl;
    }
  };
  opts.ibfCount = 30;
  opts.ibfCompression =
    argv[4][0] == '1' ? psync::CompressionScheme::ZLIB : psync::CompressionScheme::NONE;
  opts.syncInterestLifetime = 100_ms;
  opts.syncDataFreshness = 500_ms;
  opts.contentCompression = opts.ibfCompression;

  psync::FullProducer sync(face, keyChain, argv[2], opts);

  ndn::Name userNode(argv[3]);
  sync.addUserNode(userNode);

  boost::asio::signal_set signalSet(face.getIoContext(), SIGINT, SIGUSR1);
  std::function<void(const boost::system::error_code&, int signal)> handleSignal =
    [&](const boost::system::error_code&, int signal) {
      signalSet.async_wait(handleSignal);
      switch (signal) {
        case SIGINT:
          std::exit(0);
          break;
        case SIGUSR1:
          sync.publishName(userNode);
          break;
      }
    };
  signalSet.async_wait(handleSignal);

  face.processEvents();
  return 0;
}
