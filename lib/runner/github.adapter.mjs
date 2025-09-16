// lib/runner/github.adapter.mjs
// Thin wrapper over tokenBroker to allow testing with injection/mocking
export async function getRunnerRegistrationTokenForProject(projectId){
  const mod = await import('../github/tokenBroker.mjs');
  return mod.getRunnerRegistrationTokenForProject(projectId);
}
