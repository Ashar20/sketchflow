import { sha256 } from '@noble/hashes/sha2.js';
import { sha3_256 } from '@noble/hashes/sha3.js';
import { p256 } from '@noble/curves/nist.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { withPrefix } from '@onflow/util-address';

function hexToBytes(hex: string): Uint8Array {
  const h = hex.replace(/^0x/i, '');
  if (h.length % 2 !== 0) {
    throw new Error('Invalid hex length');
  }
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export type FlowKeySignAlgo = 'ECDSA_P256' | 'ECDSA_secp256k1_k1';
export type FlowKeyHashAlgo = 'SHA2_256' | 'SHA3_256';

export interface FlowSignerOptions {
  privateKeyHex: string;
  address: string;
  keyId: number;
  signAlgo: FlowKeySignAlgo;
  hashAlgo: FlowKeyHashAlgo;
}

/**
 * Builds an FCL/SDK signingFunction for server-side transaction signing.
 */
export function createFlowSigningFunction(opts: FlowSignerOptions) {
  const addr = withPrefix(opts.address.replace(/^0x/i, '0x'));
  const sk = hexToBytes(opts.privateKeyHex);

  return async (signable?: { message?: string }) => {
    const message = signable?.message;
    if (!message) {
      throw new Error('Missing signable message for Flow transaction signing');
    }
    const messageBytes = hexToBytes(message);
    const digest =
      opts.hashAlgo === 'SHA3_256' ? sha3_256(messageBytes) : sha256(messageBytes);

    let sigBytes: Uint8Array;
    if (opts.signAlgo === 'ECDSA_P256') {
      sigBytes = p256.sign(digest, sk, { prehash: false, lowS: true });
    } else {
      sigBytes = secp256k1.sign(digest, sk, { prehash: false, lowS: true });
    }

    return {
      addr,
      keyId: opts.keyId,
      signature: Buffer.from(sigBytes).toString('hex'),
    };
  };
}
