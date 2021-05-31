import { Timestamp, Version } from "@ndn/naming-convention2";
import { Component, Name, TT } from "@ndn/packet";
import assert from "minimalistic-assert";

/** 'KEY' component. */
export const KEY = new Component(TT.GenericNameComponent, "KEY");

/** Default issuerId. */
export const ISSUER_DEFAULT = new Component(TT.GenericNameComponent, "NDNts");

/** Self-signed issuerId. */
export const ISSUER_SELF = new Component(TT.GenericNameComponent, "self");

export interface KeyNameFields {
  subjectName: Name;
  keyId: Component;
}

export interface CertNameFields extends KeyNameFields {
  issuerId: Component;
  version: Component;
  keyName: Name;
}

/** Get subject name from subject name, key name, or certificate name. */
export function toSubjectName(name: Name): Name {
  return isKeyName(name) ? name.getPrefix(-2) :
    isCertName(name) ? name.getPrefix(-4) :
    name;
}

/** Determine whether the name is a key name. */
export function isKeyName(name: Name): boolean {
  return name.length >= 2 && name.get(-2)!.equals(KEY);
}

/** Parse a key name into fields. */
export function parseKeyName(name: Name): KeyNameFields {
  assert(isKeyName(name));
  return {
    subjectName: name.getPrefix(-2),
    keyId: name.get(-1)!,
  };
}

function getKeyNameImpl(name: Name): Name | undefined {
  if (isKeyName(name)) {
    return name;
  }
  if (isCertName(name)) {
    return name.getPrefix(-2);
  }
  return undefined;
}

/**
 * Get key name from key name or certificate name.
 * @throws input name is neither key name nor certificate name.
 */
export function toKeyName(name: Name): Name {
  const keyName = getKeyNameImpl(name);
  if (!keyName) {
    throw new Error(`cannot get key name from ${name}`);
  }
  return keyName;
}

/**
 * Create key name from subject name, key name, or certificate name.
 * @param name subject name, key name, or certificate name.
 * @param opts.keyId keyId component, used only if input name is subject name.
 */
export function makeKeyName(name: Name, opts: Partial<Omit<KeyNameFields, "subjectName">> = {}): Name {
  const keyName = getKeyNameImpl(name);
  if (keyName) {
    return keyName;
  }
  const {
    keyId = Timestamp.create(Date.now()),
  } = opts;
  return name.append(KEY, keyId);
}

/** Determine whether the name is a certificate name. */
export function isCertName(name: Name): boolean {
  return name.length >= 4 && name.get(-4)!.equals(KEY);
}

/** Parse a certificate name into fields. */
export function parseCertName(name: Name): CertNameFields {
  assert(isCertName(name));
  return {
    subjectName: name.getPrefix(-4),
    keyId: name.get(-3)!,
    issuerId: name.get(-2)!,
    version: name.get(-1)!,
    keyName: name.getPrefix(-2),
  };
}

/**
 * Create certificate name from subject name, key name, or certificate name.
 * @param name subject name, key name, or certificate name.
 * @param opts.keyId keyId component, used only if input name is subject name.
 * @param opts.issuerId keyId, used only if input name is subject name.
 * @param opts.version keyId, used only if input name is subject name.
 */
export function makeCertName(name: Name, opts: Partial<Omit<CertNameFields, "subjectName">> = {}): Name {
  if (isCertName(name)) {
    return name;
  }

  const now = new Date();
  const {
    issuerId = ISSUER_DEFAULT,
    version = Version.create(now.getTime()),
  } = opts;
  if (isKeyName(name)) {
    return name.append(issuerId, version);
  }

  const {
    keyId = Timestamp.create(now),
  } = opts;
  return name.append(KEY, keyId, issuerId, version);
}
