import { Certificate, EcPrivateKey, ValidityPeriod } from "../src";
import { CertificateStorage } from "../src/platform";

export interface TestRecord {
  certs: string[];
  list0: string[];
  list1: string[];
  list2: string[];
  reads: string[];
}

export async function execute(certStore: CertificateStorage): Promise<TestRecord> {
  const certs = [] as Certificate[];
  const validity = new ValidityPeriod(new Date(1542099529000), new Date(1602434283000));
  for (let i = 0; i < 40; ++i) {
    const [privateKey, publicKey] = await EcPrivateKey.generate(`/${i}`, "P-256");
    const cert = await Certificate.selfSign({
      // tslint:disable-next-line object-literal-sort-keys
      validity,
      privateKey,
      publicKey,
    });
    certs.push(cert);
  }

  const list0 = (await certStore.list()).map((name) => name.toString());
  await Promise.all(
    certs.map((cert) => certStore.insert(cert)),
  );
  const list1 = (await certStore.list()).map((name) => name.toString());
  await Promise.all(
    certs.filter((cert, index) => index % 4 === 0)
    .map((cert) => certStore.erase(cert.name)),
  );
  const list2 = (await certStore.list()).map((name) => name.toString());

  const reads = [] as string[];
  for (let i = 0; i < 40; ++i) {
    try {
      const read = await certStore.get(certs[i].name);
      reads.push(read.name.toString());
    } catch {
      reads.push("");
    }
  }

  return {
    certs: certs.map((cert) => cert.name.toString()),
    list0,
    list1,
    list2,
    reads,
  } as TestRecord;
}

export function check(record: TestRecord) {
  expect(record.list0).toHaveLength(0);
  expect(record.list1).toHaveLength(40);
  expect(record.list2).toHaveLength(30);
  expect(record.reads.filter((v) => v === "")).toHaveLength(10);

  record.certs.sort();
  record.list1.sort();
  expect(record.list1).toEqual(record.certs);
}
