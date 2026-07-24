# The 18-Smell Checklist

For each smell: what it is, how to detect it, and what NOT to flag (to keep the
report high-signal).

## 1. Redundant code — `[redundant]`
Repeated or unnecessary code that can be removed or extracted into a function.
- **Detect:** near-identical blocks within a file; copy-pasted branches that differ by one value.
- **Ignore:** two-line similarities; test setup boilerplate that reads clearer inline.

## 2. Duplicate logic — `[duplicate-logic]`
The same behavior implemented in multiple places, making updates error-prone.
- **Detect:** Grep for distinctive expressions/strings across files (e.g. the same date-format string, the same validation regex, the same price calculation).
- **Ignore:** intentional duplication across independent packages/apps that shouldn't share code.

## 3. Dead code — `[dead-code]`
Variables, functions, imports, or branches that are never used.
- **Detect:** unused imports; exported functions with zero references (Grep the symbol repo-wide before flagging); `if (false)` / unreachable-after-return branches; commented-out code blocks.
- **Ignore:** framework-required exports (Next.js page exports, Payload config hooks), public library APIs.

## 4. Overly complex code — `[complexity]`
Deeply nested conditions, long functions, or confusing control flow.
- **Detect:** nesting ≥4 levels; functions >~60 lines doing several jobs; boolean expressions with 4+ clauses; flag variables steering distant control flow.
- **Ignore:** long but flat and linear functions (e.g. config builders).

## 5. Poor naming — `[naming]`
Vague names such as `x`, `data`, `temp`, `handleStuff` that hide intent.
- **Detect:** single letters outside tiny loop scopes; `data`/`info`/`temp`/`result` for domain objects; names that lie (`getUser` that also writes).
- **Ignore:** conventional short names (`i`, `e` in a catch, `_`, `req`/`res`, `ctx`).

## 6. Magic numbers/strings — `[magic-value]`
Unexplained values like `86400` scattered through code instead of named constants.
- **Detect:** repeated numeric/string literals with domain meaning (timeouts, limits, status strings, role names); the same literal in ≥2 places.
- **Ignore:** `0`, `1`, `-1`, `100` in obvious arithmetic; HTTP status codes next to a response; array indices.

## 7. Missing error handling — `[missing-error-handling]`
Assuming files, network requests, or user inputs always succeed.
- **Detect:** `await fetch(...)` without `res.ok` check; `JSON.parse` on external input without try/catch; file/db ops with no failure path; empty `catch {}` blocks; unhandled promise chains.
- **Ignore:** errors deliberately propagated to a framework-level handler (note the handler exists before ignoring).

## 8. Improper input validation — `[input-validation]`
Accepting unexpected, malformed, or unsafe data.
- **Detect:** request bodies/params used without schema or type checks; `parseInt` without NaN handling; trusting client-supplied IDs/roles; no length/range limits on user input.
- **Ignore:** internal functions whose callers already validated (verify the call sites).

## 9. Global mutable state — `[global-state]`
Shared data changeable from many places, causing unpredictable behavior.
- **Detect:** module-level `let`/mutable objects mutated by exported functions; singletons holding request-specific data; mutable default parameters (Python).
- **Ignore:** module-level constants, memoization caches with clear invalidation, DI containers.

## 10. Tight coupling — `[coupling]`
Components depending on implementation details of other components.
- **Detect:** reaching into another module's internals (`other._private`, deep import paths into another feature's guts); circular imports; a change in one file that would force edits in 3+ others.
- **Ignore:** cohesive modules inside one feature folder importing each other.

## 11. Memory or resource leaks — `[resource-leak]`
Failing to release memory, files, DB connections, timers, or event listeners.
- **Detect:** `setInterval`/`addEventListener`/subscriptions without cleanup (React: missing effect cleanup return); opened files/connections without `finally`/`with`/`defer`; growing module-level caches with no eviction.
- **Ignore:** process-lifetime resources created once at startup.

## 12. Race conditions — `[race-condition]`
Async operations interacting unpredictably because order isn't controlled.
- **Detect:** check-then-act on shared state across an `await`; fire-and-forget promises whose results are assumed later; React state updates from stale closures; concurrent writes to the same row/file without locking or transactions.
- **Ignore:** independent parallel reads (`Promise.all` of getters).

## 13. Hardcoded values — `[hardcoded]`
URLs, credentials, paths, or configuration embedded in source.
- **Detect:** `http(s)://` literals outside config/tests; absolute filesystem paths; ports, bucket names, API base URLs inline; anything that must differ between dev/prod.
- **Ignore:** values in `.env.example`, config files, or test fixtures.

## 14. Inconsistent formatting — `[formatting]`
Mixed indentation, naming conventions, or code styles.
- **Detect:** tabs+spaces mixed in one file; camelCase and snake_case mixed for the same kind of symbol; quote-style churn within a file.
- **Ignore:** anything a configured formatter (prettier/eslint config present) would already catch — just note "run the formatter" once instead of listing lines.

## 15. Missing or weak tests — `[tests]`
Important behaviors and edge cases not verified.
- **Detect:** core business logic (pricing, auth, data transforms) with no test file; tests asserting only "doesn't throw"; error paths never exercised.
- **Ignore:** thin UI wrappers, generated code. Report at file/feature level, not line level.

## 16. Security vulnerabilities — `[security]`
Exposed secrets, SQL injection, XSS, insecure auth.
- **Detect:** string-built SQL with user input; `dangerouslySetInnerHTML`/`innerHTML` with unsanitized data; secrets/tokens/private keys in source (grep `api[_-]?key|secret|password|token\s*=`); `eval` on input; missing auth checks on mutating endpoints; `verify: false`/disabled TLS checks.
- **Never ignore.** Always `critical` unless clearly test-only fake credentials — say so explicitly if downgraded.

## 17. Premature optimization — `[premature-opt]`
Complexity added for performance before a problem was confirmed.
- **Detect:** hand-rolled caching/pooling/memo layers with no benchmark or comment justifying them, where the simple version is obviously fast enough; micro-optimizations (bit tricks, manual loop unrolling) in cold paths.
- **Ignore:** optimization in genuinely hot paths (render loops, per-request middleware) or where a comment/benchmark justifies it.

## 18. Poor documentation — `[docs]`
Complex behavior lacking useful comments or usage instructions.
- **Detect:** non-obvious algorithms, workarounds, or protocol assumptions with no explanatory comment; exported APIs whose parameters/behavior can't be inferred from names; misleading or stale comments contradicting the code.
- **Ignore:** self-explanatory code — never suggest comments that restate the code.
