#include <ndn-cxx/security/v2/certificate.hpp>
#include <ndn-cxx/util/io.hpp>
#include <ndn-cxx/util/time.hpp>

#include <iostream>

int
main()
{
  auto cert = ndn::io::load<ndn::security::v2::Certificate>(
    std::cin, ndn::io::NO_ENCODING);
  std::cout << cert->getName() << std::endl;
  std::cout << cert->getIdentity() << std::endl;
  std::cout << cert->getKeyId() << std::endl;
  std::cout << cert->getIssuerId() << std::endl;

  auto validity = cert->getValidityPeriod().getPeriod();
  {
    using namespace ndn::time;
    std::cout
      << duration_cast<milliseconds>(validity.first.time_since_epoch()).count()
      << std::endl;
    std::cout
      << duration_cast<milliseconds>(validity.second.time_since_epoch()).count()
      << std::endl;
  }

  return 0;
}
