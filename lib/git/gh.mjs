// Stub PR opener for tests; integrate real GH client later.
export async function openPullRequest({ projectRoot, worktree, ticket, title, body }) {
  return {
    id: 1,
    url: 'https://example.com/pr/1',
    branch: `ai/${ticket || 'compose'}`,
    title, body
  };
}
