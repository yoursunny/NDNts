#include <ndn-cxx/data.hpp>
#include <ndn-cxx/security/certificate.hpp>
#include <ndn-cxx/security/verification-helpers.hpp>
#include <ndn-cxx/util/io.hpp>

#include <fstream>
#include <iostream>

int
main(int argc, char* argv[]) {
  std::ifstream file1(argv[1]), file2(argv[2]);
  auto cert = ndn::io::loadTlv<ndn::security::Certificate>(file1, ndn::io::NO_ENCODING);
  auto packet = ndn::io::loadTlv<ndn::Data>(file2, ndn::io::NO_ENCODING);

  bool certOk = ndn::security::verifySignature(cert, cert);
  bool packetOk = ndn::security::verifySignature(packet, cert);
  std::cout << static_cast<int>(certOk) << std::endl << static_cast<int>(packetOk) << std::endl;

  return 0;
}
