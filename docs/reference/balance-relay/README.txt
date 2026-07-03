docs/reference/balance-relay/README.txt

Purpose

This folder contains protocol and template material for the local Chief Balance
Agent + Verbatim Relay workflow.

This is reference material. It is not active rules doctrine, balance doctrine,
combat law, tuning law, or product law. If this folder conflicts with an active
source document, the active source document controls.


Role Boundaries

The Lead Designer owns design intent, rules intent, archetype purpose, and final
tuning philosophy.

The Chief Balance Agent owns balance judgement, interpretation of evidence, and
the next Codex prompts.

Codex owns local repo inspection, implementation when approved, validation, and
evidence-first reporting.

The Relay owns preservation, metadata, validation, and chain-of-custody between
the Chief Balance Agent and Codex.


Evidence Rule

Relay summaries are navigation aids only. They are never source-of-truth
evidence.

Raw Codex reports are authoritative evidence for what Codex inspected, changed,
validated, and found.

Raw job artifacts are local-only by default under:

.incarnate-balance-agent/jobs/

The committed docs/reference/balance-relay/ folder contains only protocol,
schema examples, and templates. It must not contain real current Codex reports
unless the Lead Designer explicitly approves committing a specific artifact.


Local Artifact Policy

.incarnate-balance-agent/ is ignored by git. Use it for local raw job folders,
working relay artifacts, copied prompts, raw Codex responses, validation logs,
and Chief Balance Agent decision notes.

Do not store secrets, tokens, .env content, database URLs, API keys, or
credentials in relay artifacts. If secret-like content appears in a report or
prompt, quarantine the artifact locally and request Lead Designer guidance
before copying, committing, or forwarding it.
