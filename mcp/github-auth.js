// Optional GitHub auth for MCP fetches.
//
// A GITHUB_TOKEN in the environment lifts GitHub's 60 req/hr unauthenticated
// limit to 5000/hr — important for blueprint_scene and deep_dive, which make
// many GitHub calls per run (1 tree + up to 8 contents, plus repo meta). With no
// token set, this returns {} and every fetch stays anonymous — identical to the
// extension, which never sends an Authorization header.
//
// The shape ({ githubToken }) is what fetcher.js and deepdive.js expect as their
// optional trailing `opts` argument.

/** @returns {{ githubToken?: string }} auth opts for the fetch helpers. */
export function ghOpts() {
  const token = process.env.GITHUB_TOKEN;
  return token ? { githubToken: token } : {};
}
