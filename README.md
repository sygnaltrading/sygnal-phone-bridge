# Private phone bridge (not deployed)

Deploy this separate single-instance WebSocket service on always-on hosting only after cost approval. `render.yaml` is a deployment blueprint, not evidence of a running service. Do not scale horizontally without a shared room transport.

Configure `SYGNAL_SITE_ORIGIN` and `ALLOWED_ORIGINS` on the relay. The website needs `PHONE_BRIDGE_URL` set to the relay's actual `wss://` address. `PHONE_BRIDGE_SIGNING_SEED` is already stored securely; no provider secret or IBKR credential is needed by the relay.

Publish the website auth endpoints before enabling the service. Package/distribute the updated Connector, then bootstrap it using the existing paired desktop browser. Existing downloads do not include these changes. Computer, Connector and Gateway must remain running.

The relay stores no prices, authenticates single-use account capabilities, checks revocation every 30 seconds, expires sessions after two minutes (clients reconnect), bounds two phone sockets per account and four feeds per socket, and forwards only encrypted market payloads. Both chart and independent position transport currently consume one socket each. No phone orders go through this service.

Tests use synthetic envelopes only: encryption/replay/session separation, paired bootstrap guards, room isolation, used-ticket refusal and desktop regressions. A real two-device IBKR session, network switching and updated macOS package must be verified before claiming live readiness.
