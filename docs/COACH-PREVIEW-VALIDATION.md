# Coach preview validation — 2026-11-12

Source: `499a21a66f52d299653f8860e284a5104e5efc19` on `dev`.

- [Check (Coach), run 43201161183](https://github.com/nimmsel23/coach-dev/actions/runs/43201161183): completed successfully. The job includes dependencies, functional tests, KB generation and the full Coach build.
- [Deploy Coach, run 43201160756](https://github.com/nimmsel23/coach-dev/actions/runs/43201160756): completed successfully, including functional tests, build, source stamping and preview deployment.
- Preview URL reported by Firebase: <https://vos-coach--dev-3fxzo62g.web.app>.
- Expiration reported by Firebase: 2026-11-13 10:32:33 UTC.
- No open repository issues were returned by GitHub search at this check.

The job logs establish a successful preview deployment. They do not establish
an authenticated browser round-trip. Direct HTTP verification completed: release.json matches the source SHA;
root, coach.html and local.html respond with HTML and loadable entry scripts;
15 referenced JavaScript assets passed node --check; the manifest declares
start_url `/`. Production still identifies e890f563 from 2026-11-10.

**Runtime failure found:** a clean browser profile rendered the outer shell but
left the embedded application empty. Runtime.exceptionThrown reported
`Error: Nicht eingeloggt` from the unread-count hook calling getUid during the
first render. The source correction passes the actor explicitly only after
Coach auth/access approval and has a browser regression for signed-out render,
authorized subscriptions and logout cleanup. A new deployed-preview cold-start
check is required before accepting the hosted login screen.

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


## Follow-up: cold start fixed and verified on Firebase

Preview source `ee20ff10e9aa1102ce2ae79767acb9961f6a8e8e` was observed in
release.json after successful Deploy Coach run 43202282188. A fresh Chromium
profile at 390x844 reached the Coach-Zugang screen with Google and E-Mail sign-in
buttons, preserved the client/messages deep-link and opened the email dialog.
No Runtime.exceptionThrown event occurred in this inspection. No credentials
were entered and no account was created.

The same inspection found that the shared email dialog still claimed Fitness
demo access and exceeded the visible iframe viewport in landscape: its bounds
were top=-94.25, bottom=415.25 at viewport height=321. Contextual copy, scrolling
and keyboard-focus corrections are tracked separately from the fixed cold start.

## Follow-up: hosted mobile email dialog verified

Preview release.json identified `174a6a78c8ecde24c1ddedd82c63a92989860b48`.
[Check 43202986793](https://github.com/nimmsel23/coach-dev/actions/runs/43202986793)
and [Deploy 43202986798](https://github.com/nimmsel23/coach-dev/actions/runs/43202986798)
both completed successfully. Hosted Chromium inspection covered 390x844,
844x390, 768x1024 and 1024x768. The Coach-specific email dialog remained within
the embedded viewport without horizontal overflow; inputs computed to 16px.
At 844x390, its top/bottom were 16/305 within the 321px iframe viewport and
scrolling reached the final control (540px content, 287px client height).
The client/messages deep-link remained intact and no runtime exception occurred.
No credentials were entered. This verifies the deployed layout in emulated
Chromium sizes; real Safari, authentication and production acceptance remain open.

## Follow-up: inspector save isolation published to preview

Source `acb7d5d501cffec4d3850274f536d235533412c1` passed
[Check 43204174931](https://github.com/nimmsel23/coach-dev/actions/runs/43204174931)
and [Deploy 43204174734](https://github.com/nimmsel23/coach-dev/actions/runs/43204174734).
The preview returned HTTP 200 with that exact commit in release.json
(builtAt `2026-11-12T10:53:09.997Z`). The local browser fixture verified
late read/write isolation and negative Notes/Lesson/Approve/Reject adapter
results; the notes retry extension also verifies that an unsaved draft survives
a failed save and is adopted only after successful retry. Functional tests
remain 62/62 passing. This source identity check does not establish a real
Coach account's write permissions or the shared write queue's server ack.
