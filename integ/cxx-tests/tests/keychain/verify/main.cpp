#include <ndn-cxx/data.hpp>
#include <ndn-cxx/security/certificate.hpp>
#include <ndn-cxx/security/verification-helpers.hpp>
#include <ndn-cxx/util/io.hpp>

#include <iostream>

int
main(int argc, char* argv[]) {
  auto cert = ndn::io::load<ndn::security::Certificate>(argv[1], ndn::io::NO_ENCODING);
  auto packet = ndn::io::load<ndn::Data>(argv[2], ndn::io::NO_ENCODING);
  if (cert == nullptr || packet == nullptr) {
    return 1;
  }

  bool certOk = ndn::security::verifySignature(*cert, *cert);
  bool packetOk = ndn::security::verifySignature(*packet, *cert);
  std::cout << static_cast<int>(certOk) << std::endl << static_cast<int>(packetOk) << std::endl;

  return 0;
}
