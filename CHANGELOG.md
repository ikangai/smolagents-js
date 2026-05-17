# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Test suite** — 135 unit and integration tests across 19 files in `test/`,
  covering every source module (`EventEmitter`, `Tool`, `Model`, `prompts`,
  `Agent` base, `ToolCallingAgent`, `CodeAgent`, `ManagedAgent`, `Sandbox`,
  `index`). Uses Node's built-in `node --test` runner — zero new dependencies.
- **`npm test`** — `package.json` now defines a `test` script that runs the
  suite with the `spec` reporter for readable local output. Pinned `engines.node`
  to `>=20` (required for stable `node --test` + ESM behaviour).
- **GitHub Actions CI** — `.github/workflows/test.yml` runs the suite on every
  push and pull request to `main` against Node 20.x and 22.x using the TAP
  reporter for machine-friendly logs.

### Fixed

- **`ToolCallingAgent` system prompt no longer lists managed agents twice.**
  `buildSystemPrompt()` previously passed `_getAllTools()` (which already
  includes managed agents) and `this.managedAgents` separately to
  `toolCallingSystemPrompt`, causing every sub-agent to appear in both the
  tools section and the agents section. Mirror of the fix applied to
  `CodeAgent` in `8d39ea4`. ([`ba33b4e`](ba33b4e))
- **Parallel `tool_calls` in one LLM response no longer corrupt the
  conversation history.** `extractAction` processed only the first tool call
  but `appendActionToHistory` recorded all of them on the assistant message —
  leaving the rest unanswered. The next request was then rejected by
  OpenAI/OpenRouter, which require every `tool_call` to be followed by a
  matching `role:'tool'` message. The executed call is now carried through
  the action object and stored alone. ([`5b63d91`](5b63d91))
- **`Sandbox.execute` now rejects non-identifier tool names with a clear error.**
  The sandbox interpolates tool names directly into iframe-generated
  JavaScript (function declarations, identifier lists, and a quoted `tool`
  field). Names containing characters outside `[A-Za-z0-9_$]` either produced
  a `SyntaxError` that surfaced as a confusing execution timeout or, with
  quote characters, could break out of a string literal and inject code into
  the iframe. The check happens up front, before any code is generated.
  ([`bd07a7a`](bd07a7a))
- **Malformed `tool_call.arguments` JSON is now a recoverable tool error.**
  `extractAction` parsed `call.function.arguments` with `JSON.parse`, but
  `extractAction` runs outside `agent.run`'s per-step try/catch — a malformed
  arguments string (which models do sometimes emit) threw past the recovery
  path and killed the entire agent run. The parse failure is now caught in
  `extractAction` and surfaced through `executeAction`, where it becomes a
  tool error the model can react to on the next iteration. The documented
  `act`-event `args` field is preserved (alongside a new `parseError` field).
  ([`cca8610`](cca8610))

### Locked in by tests

Every fix above now has explicit regression coverage in the test suite:

| Fix | Locked in by |
|-----|--------------|
| Duplicate managed agents in `ToolCallingAgent` prompt | `tool-calling-agent.test.js` → "lists managed agents exactly once" |
| `CodeAgent` prompt dup (`8d39ea4` / S6) | `code-agent.test.js` → "S6 dedup fix from 8d39ea4" |
| Parallel `tool_calls` history corruption | `tool-calling-agent.test.js` + `agent-history.test.js` → "parallel-call dedup" |
| Sandbox identifier validation | `sandbox.test.js` → 4 rejection cases (hyphen / quote / digit-start / empty) |
| Malformed JSON args recoverable | `tool-calling-agent.test.js` + `agent-run-errors.test.js` → "malformed JSON" |

### Known limitations

- `Sandbox.execute`'s iframe runtime cannot be exercised in Node — it needs
  a real browser. The validation gate, lifecycle, and message-routing
  internals are unit-tested via stubbed `document`/`window`; full
  end-to-end iframe execution would require a browser harness such as
  Playwright or `@web/test-runner`.

## [0.1.0] — 2026-02-09

### Added

- Initial release.
- `Agent` base class with ReAct loop (think → act → observe).
- `ToolCallingAgent` — parses OpenAI-style `tool_calls`.
- `CodeAgent` — extracts JS code blocks and executes them in an iframe
  `Sandbox` with `allow-scripts` only.
- `ManagedAgent` — wraps an agent as a tool for multi-agent orchestration.
- `Tool` / `tool()` — schema definition and OpenAI-function-calling
  conversion.
- `Model` — minimal OpenRouter API client.
- `EventEmitter` — `on` / `off` / `emit` mixin for `think` / `act` /
  `observe` / `error` / `done` events.
- Three example HTML pages: `basic.html`, `code-agent.html`, `multi-agent.html`.
