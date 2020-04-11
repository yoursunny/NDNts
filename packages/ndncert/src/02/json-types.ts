export interface CaInfo {
  "ca-prefix": string;
  "ca-info": string;
  probe: string;
  certificate: string;
}

export type ProbeRequest = Record<string, any>;

export interface ProbeResponse {
  name: string;
}

export interface NewRequest {
  "ecdh-pub": string;
  "cert-request": string;
  "probe-token"?: string;
}

export interface NewResponse {
  "ecdh-pub": string;
  "salt": string;
  "request-id": string;
  "status": string;
  "challenges": ChallengeDefinition[];
}

export interface ChallengeDefinition {
  "challenge-id": string;
}

export interface ChallengeRequest extends Record<string, any> {
  "selected-challenge": string;
}

export interface ChallengeResponse {
  status: string;
  "challenge-status": string;
  "remaining-tries": string;
  "remaining-time": string;
  "certificate-id"?: string;
}
