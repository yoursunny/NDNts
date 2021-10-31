#include "syncps.hpp"
#include <iostream>

/** @brief Timestamp naming convention (rev2). */
namespace Timestamp {

using TlvType = std::integral_constant<int, 0x24>;

inline uint64_t
now()
{
  ::timespec tp;
  ::clock_gettime(CLOCK_REALTIME, &tp);
  return static_cast<uint64_t>(tp.tv_sec) * 1000000 + static_cast<uint64_t>(tp.tv_nsec) / 1000;
}

inline ndn::Name::Component
create(uint64_t v = now())
{
  return ndn::Name::Component::fromNumber(v, ndn_NameComponentType_OTHER_CODE, TlvType::value);
}

inline uint64_t
parse(const ndn::Name::Component& comp)
{
  if (comp.getType() == ndn_NameComponentType_OTHER_CODE &&
      comp.getOtherTypeCode() == TlvType::value) {
    return comp.toNumber();
  }
  return 0;
}

} // namespace Timestamp

int
main(int argc, char** argv)
{
  INIT_LOGGERS();
  log4cxx::Logger::getRootLogger()->setLevel(log4cxx::Level::getTrace());
  // ndn::WireFormat::setDefaultWireFormat(ndn::Tlv0_3WireFormat::get());

  if (argc != 4) {
    std::cerr << "./demo SYNC-PREFIX SUB-PREFIX PUB-PREFIX" << std::endl;
    return 2;
  }
  ndn::Name syncPrefix(argv[1]);
  ndn::Name subPrefix(argv[2]);
  ndn::Name pubPrefix(argv[3]);

  ndn::KeyChain keyChain;
  try {
    keyChain.getDefaultCertificateName();
  } catch (const ndn::Pib::Error&) {
    keyChain.createIdentityV2("/operator");
  }
  ndn::ThreadsafeFace face;
  face.setCommandSigningInfo(keyChain, keyChain.getDefaultCertificateName());
  syncps::SyncPubsub sync(
    face, syncPrefix,
    [](const syncps::Publication& data) {
      auto d = std::chrono::microseconds(
        static_cast<int64_t>(Timestamp::now() - Timestamp::parse(data.getName()[-1])));
      return d >= syncps::maxPubLifetime + syncps::maxClockSkew || d <= -syncps::maxClockSkew;
    },
    [](syncps::VPubPtr& ours, syncps::VPubPtr& others) mutable {
      if (ours.empty()) {
        return ours;
      }
      static const auto cmp = [](const syncps::PubPtr& a, const syncps::PubPtr& b) {
        return Timestamp::parse(a->getName()[-1]) > Timestamp::parse(b->getName()[-1]);
      };
      std::sort(ours.begin(), ours.end(), cmp);
      std::sort(others.begin(), others.end(), cmp);
      std::copy(others.begin(), others.end(), std::back_inserter(ours));
      return ours;
    });

  sync.subscribeTo(subPrefix, [](const syncps::Publication& data) {
    std::cerr << "UPDATE " << data.getName() << std::endl;
  });

  ndn::scheduler::Scheduler sched(face.getIoService());
  int seqNum = 0;
  ndn::scheduler::EventCallback publish = [&]() {
    ndn::Name name = pubPrefix;
    name.append(std::to_string(++seqNum));
    name.append(Timestamp::create());
    std::cerr << "PUBLISH " << name << std::endl;
    ndn::Data publication(name);
    sync.publish(std::move(publication), [](const ndn::Data& pub, bool confirmed) {
      std::cerr << (confirmed ? "CONFIRM " : "LOST ") << pub.getName() << std::endl;
    });

    float randTime = 0.0;
    ndn::CryptoLite::generateRandomFloat(randTime);
    sched.schedule(std::chrono::milliseconds(500 + static_cast<int>(200 * randTime)), publish);
  };
  publish();

  face.getIoService().run();
}
