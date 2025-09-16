// lib/runner/github.adapter.mjs
// Thin wrapper over tokenBroker to allow testing with injection/mocking
export async function getRunnerRegistrationTokenForProject(projectId){
  const mod = await import('../github/tokenBroker.mjs');
  return mod.getRunnerRegistrationTokenForProject(projectId);
}

export async function runnerExists({ name }){
  // Real implementation would query GitHub API for a runner named `name`.
  // Leave undefined in CI; tests will stub.
  return false;
}
