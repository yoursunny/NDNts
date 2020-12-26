#include <ndn-cxx/data.hpp>
#include <ndn-cxx/security/certificate.hpp>
#include <ndn-cxx/security/verification-helpers.hpp>
#include <ndn-cxx/util/io.hpp>

#include <iostream>

int
main()
{
  std::string certFile, packetFile;
  std::cin >> certFile >> packetFile;
  auto cert = ndn::io::load<ndn::security::v2::Certificate>(certFile, ndn::io::NO_ENCODING);
  auto packet = ndn::io::load<ndn::Data>(packetFile, ndn::io::NO_ENCODING);

  bool certOk = ndn::security::verifySignature(*cert, *cert);
  bool packetOk = ndn::security::verifySignature(*packet, *cert);
  std::cout << static_cast<int>(certOk) << std::endl << static_cast<int>(packetOk) << std::endl;

  return 0;
}
