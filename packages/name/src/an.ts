export class TlvTypes {
  public readonly Name = 0x07;
  public readonly GenericNameComponent = 0x08;
  public readonly ImplicitSha256DigestComponent = 0x01;
  public readonly ParametersSha256DigestComponent = 0x02;
}

export const TT = new TlvTypes();
