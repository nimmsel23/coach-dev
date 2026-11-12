# Coach preview validation — 2026-11-12

Source: `499a21a66f52d299653f8860e284a5104e5efc19` on `dev`.

- [Check (Coach), run 43201161183](https://github.com/nimmsel23/coach-dev/actions/runs/43201161183): completed successfully. The job includes dependencies, functional tests, KB generation and the full Coach build.
- [Deploy Coach, run 43201160756](https://github.com/nimmsel23/coach-dev/actions/runs/43201160756): completed successfully, including functional tests, build, source stamping and preview deployment.
- Preview URL reported by Firebase: <https://vos-coach--dev-3fxzo62g.web.app>.
- Expiration reported by Firebase: 2026-11-13 10:32:33 UTC.
- No open repository issues were returned by GitHub search at this check.

The job logs establish a successful preview deployment. They do not establish
an authenticated browser round-trip. Direct HTTP verification of release.json,
entry pages, JavaScript assets and manifest remains pending; no successful
response from that inspection has been observed yet.

## Acceptance still required

- Verify preview release.json matches the source SHA and entry assets load.
- Authenticate as the Coach on the hosted preview; inspect real client selection,
  console, messages and plan authoring/delivery with appropriate account access.
- Verify edits and saved records through the relevant Firebase data contracts.
- Validate touch, keyboard, scrolling, reload and install behaviour on real
  iPhone 13 / iPad Safari, including interrupted connectivity.
- Obtain the required production release authorization and verify production
  source identity after that release.

The isolated browser fixtures and passing logic tests are incremental evidence.
They do not prove completion of the overall Coach-console/ClientForge objective.
