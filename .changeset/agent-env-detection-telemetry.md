---
"@tutti-os/desktop": patch
---

Add `agent.env_detected` and `agent.env_issue_reported` analytics events for the agent environment wizard. `agent.env_detected` reports each provider's detection outcome automatically — availability, CLI/adapter/auth state, and the network registry/API/proxy reachability — using only privacy-safe booleans and enums (no file paths, account email, or proxy address), and fires once per distinct outcome so routine polling doesn't spam the funnel. A new "上报异常" button lets users send a fuller diagnostic payload (CLI paths, endpoints, proxy address, error detail) only after they agree once; consent is remembered, and the account email is still withheld.
