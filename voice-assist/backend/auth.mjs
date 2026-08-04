// Cognito ID-token verification for the native app's /api routes.
//
// The app signs in against the SAME Cognito pool as the subcontractor portal
// (Steven's rule: "same as the dashboard"), so there is one identity per person
// across the portal and the app. The app sends the ID token as a Bearer header;
// we verify the signature ourselves rather than putting an API Gateway in front
// of the Lambda, because the Function URL is what gives us response streaming.
//
// No dependencies: node's crypto can build a public key straight from a JWK.

import { createPublicKey, createVerify } from "node:crypto";

const REGION = "us-east-1";
const POOL_ID = "us-east-1_xOJ0DPHK6";
const CLIENT_ID = "5pvilebmogbvcf1edja0uatcrj";
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${POOL_ID}`;

// Cognito rotates signing keys rarely; a cold start refetch is cheap and a
// stale cache would reject good tokens, so keys are cached per container and
// refetched once if a kid misses.
let keyCache = { at: 0, keys: new Map() };

async function jwks(force = false) {
  if (!force && Date.now() - keyCache.at < 6 * 60 * 60 * 1000 && keyCache.keys.size) return keyCache.keys;
  const res = await fetch(`${ISSUER}/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`jwks fetch failed: ${res.status}`);
  const body = await res.json();
  const keys = new Map();
  for (const jwk of body.keys || []) {
    try { keys.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" })); } catch {}
  }
  keyCache = { at: Date.now(), keys };
  return keys;
}

const b64urlJson = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf-8"));

/**
 * Verify a Cognito ID token. Returns {email, name, sub} or throws.
 * Everything that could let a forged token through is checked here: signature,
 * issuer, audience, token_use and expiry.
 */
export async function verifyIdToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [h, p, sig] = parts;

  let header, claims;
  try { header = b64urlJson(h); claims = b64urlJson(p); }
  catch { throw new Error("malformed token"); }
  if (header.alg !== "RS256") throw new Error("unexpected alg");

  let keys = await jwks();
  let key = keys.get(header.kid);
  if (!key) { keys = await jwks(true); key = keys.get(header.kid); }
  if (!key) throw new Error("unknown signing key");

  const ok = createVerify("RSA-SHA256")
    .update(`${h}.${p}`)
    .verify(key, Buffer.from(sig, "base64url"));
  if (!ok) throw new Error("bad signature");

  if (claims.iss !== ISSUER) throw new Error("wrong issuer");
  if (claims.token_use !== "id") throw new Error("not an id token");
  if (claims.aud !== CLIENT_ID) throw new Error("wrong audience");
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error("token expired");

  return {
    sub: claims.sub,
    email: String(claims.email || "").toLowerCase(),
    name: claims.name || claims.given_name || "",
  };
}

/** Pull the bearer token out of the (already lower-cased) header map. */
export function bearer(headers) {
  const raw = headers["authorization"] || "";
  const m = /^Bearer\s+(.+)$/i.exec(raw);
  return m ? m[1].trim() : "";
}
