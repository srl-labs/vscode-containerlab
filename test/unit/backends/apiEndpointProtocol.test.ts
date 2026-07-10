/* global describe, it */
import { expect } from "chai";

import { isApiEndpointManagerRequest } from "../../../src/apiEndpoints/protocol";

describe("API endpoint manager protocol", () => {
  it("accepts typed endpoint operations", () => {
    expect(
      isApiEndpointManagerRequest({
        type: "api-endpoints:request",
        requestId: "one",
        action: "add",
        input: {
          url: "https://api.example.test",
          username: "alice",
          password: "secret",
          sessionDuration: "24h"
        }
      })
    ).to.equal(true);
    expect(
      isApiEndpointManagerRequest({
        type: "api-endpoints:request",
        requestId: "two",
        action: "reconnect",
        input: { endpointId: "endpoint-one", password: "secret" }
      })
    ).to.equal(true);
    expect(
      isApiEndpointManagerRequest({
        type: "api-endpoints:request",
        requestId: "three",
        action: "connect",
        endpointId: "endpoint-one"
      })
    ).to.equal(true);
  });

  it("rejects malformed and unknown operations", () => {
    expect(
      isApiEndpointManagerRequest({
        type: "api-endpoints:request",
        requestId: "one",
        action: "reconnect",
        input: { endpointId: "endpoint-one" }
      })
    ).to.equal(false);
    expect(
      isApiEndpointManagerRequest({
        type: "api-endpoints:request",
        requestId: "two",
        action: "eraseEverything"
      })
    ).to.equal(false);
    expect(isApiEndpointManagerRequest({ action: "refresh" })).to.equal(false);
  });
});
