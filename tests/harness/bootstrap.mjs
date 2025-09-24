// tests/harness/bootstrap.mjs
// Load all async guards BEFORE any other tests.
// Add this as the FIRST line of tests/all.test.mjs:
//   import "./harness/bootstrap.mjs";
import "./leak-guard.mjs";
import "./promise-guard.mjs";
import "./hooks-guard.mjs";
export {};
