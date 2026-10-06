import test from "node:test";
import assert from "node:assert/strict";
import { GoogleIdentityError, verifyGoogleCredential } from "./googleIdentity.js";

const clientId = "test-client.apps.googleusercontent.com";
const validClaims = {
  aud: clientId,
  iss: "https://accounts.google.com",
  email: "lady@example.com",
  email_verified: "true",
  exp: String(Math.floor(Date.now() / 1000) + 300),
  name: "Lady Carvajal",
  picture: "https://lh3.googleusercontent.com/avatar/photo.png",
};

function fetchClaims(claims, ok = true) {
  return async () => ({ ok, json: async () => claims });
}

test("verifies the Google identity and returns its profile picture", async () => {
  const profile = await verifyGoogleCredential("signed-google-credential", {
    clientId,
    fetchImpl: fetchClaims(validClaims),
  });

  assert.deepEqual(profile, {
    email: "lady@example.com",
    name: "Lady Carvajal",
    picture: "https://lh3.googleusercontent.com/avatar/photo.png",
  });
});

test("rejects a Google credential issued for another client", async () => {
  await assert.rejects(
    verifyGoogleCredential("signed-google-credential", {
      clientId,
      fetchImpl: fetchClaims({ ...validClaims, aud: "another-client" }),
    }),
    GoogleIdentityError,
  );
});

test("rejects an unverified Google email", async () => {
  await assert.rejects(
    verifyGoogleCredential("signed-google-credential", {
      clientId,
      fetchImpl: fetchClaims({ ...validClaims, email_verified: "false" }),
    }),
    GoogleIdentityError,
  );
});

test("uses no picture when Google's profile URL is not HTTPS", async () => {
  const profile = await verifyGoogleCredential("signed-google-credential", {
    clientId,
    fetchImpl: fetchClaims({ ...validClaims, picture: "http://example.com/avatar.png" }),
  });

  assert.equal(profile.picture, "");
});
