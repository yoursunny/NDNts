#include <PSync/full-producer.hpp>

#include <boost/asio/signal_set.hpp>

#include <iostream>

using namespace ndn::time_literals;

static void
handleUpdate(const std::vector<psync::MissingDataInfo>& updates) {
  for (const auto& update : updates) {
    std::cout << update.prefix << "\t" << update.lowSeq << "\t" << update.highSeq << std::endl;
  }
}

int
main(int argc, char* argv[]) {
  ndn::Face face("127.0.0.1", argv[1]);
  ndn::KeyChain keyChain;

  ndn::Name userNode(argv[3]);
  psync::FullProducer sync(face, keyChain, 30, argv[2], userNode, handleUpdate, 100_ms, 500_ms,
                           psync::CompressionScheme::NONE, psync::CompressionScheme::NONE);

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
