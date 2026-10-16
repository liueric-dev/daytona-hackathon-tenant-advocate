# Tenant Advocate: 3-minute pitch

## 0:00–0:30 Problem
- NYC renters face a problem (no heat, a surprise fee, a rent increase) with three sources of truth scattered everywhere: a 20-page lease, the city's public building records, and their own memory of what happened and when.
- Landlords have lawyers. Tenants have Google.

## 0:30–2:15 Live demo (one story: "my heat's been out for 3 days")
1. **Address → building record.** It's day 16 of heat season. Point out the open violations by class and the heat complaints from the last 12 months. *"Complaints are reports, not findings. The app keeps those apart."*
2. **Upload lease (`sample-lease.pdf`, fictional).** *"The PDF is untrusted, so it's parsed inside a Daytona sandbox that's deleted right after."* Show the extracted terms with verbatim quotes and ✓ verified, then the red flags: tenant pays all repairs, entry without notice, auto-renewal at +8%.
3. **Issue log.** Log "No heat" started 3 days ago, landlord not yet notified.
4. **Ask:** "My heat has been out for 3 days. What can I do?" Show the tools it chose, the answer where every claim has a citation pill, and the green "All claims cited" badge.
5. **Ask:** "Draft a repair request to my landlord about the heat." Show the letter citing the lease clause and HPD record ids, with **Pending your approval: nothing is sent.** Approve, then copy.
6. **Switch to Arize:** the trace tree shows agent → tool spans → the citation eval span with its pass/fail.

## 2:15–2:45 Safeguards
- **Read-only:** the agent's tools only read. It cannot contact anyone.
- **Human approval gate** on every outgoing letter.
- **Citations everywhere,** with a citation eval on every answer, recorded in Arize.
- **Quotes verified** against the lease text. Invented quotes are dropped.
- **Vetted rules only:** law is stated only from an official source; otherwise it says what to verify, and with whom.
- **Untrusted inputs isolated:** PDFs go to a Daytona sandbox, and lease text and tool output are treated as data, not instructions.
- **Real auth:** Google sign-in and per-user data.

## 2:45–3:00 Stack + what's next
- Claude on Amazon Bedrock · Daytona sandboxes · Arize AX traces + evals · SurrealDB Agent Memory for the issue history · NYC Open Data (HPD)
- **Next:** follow-up reminders when the landlord doesn't respond, more vetted rules (deposits, late fees, rent stabilization), and a landlord portfolio graph in SurrealDB.

## Submission blurb (paste into the form)
Tenant Advocate is an AI agent for NYC renters. It reads your lease inside a Daytona sandbox, pulls your building's HPD violations and complaints from NYC Open Data, and keeps a dated log of your issues. It answers with a citation for every claim, and it drafts landlord letters that wait for your approval and are never sent automatically. Every run is traced in Arize AX with a citation eval. Built with Claude on Amazon Bedrock, Daytona, Arize, SurrealDB Agent Memory, Google sign-in and NYC Open Data. Information only, not legal advice.
