import type { Connector } from "./types";

export const githubConnector: Connector = {
  name: "github",
  description: "Collect public GitHub user/org profile and repo metadata (no auth required).",
  supportedTargetTypes: ["username"],
  async run(ctx) {
    if (ctx.targetType !== "username") {
      return { evidence: [], notes: "GitHub connector currently supports username targets only." };
    }

    const username = ctx.input.trim().replace(/^@/, "");
    const headers: Record<string, string> = {
      "Accept": "application/vnd.github+json",
      "User-Agent": "kimi-osint-platform",
    };
    if (process.env.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;

    const profileRes = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, { headers });
    if (!profileRes.ok) {
      const text = await profileRes.text();
      throw new Error(`GitHub API error (${profileRes.status}): ${text}`);
    }
    const profile = await profileRes.json();

    const reposRes = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`,
      { headers },
    );
    if (!reposRes.ok) {
      const text = await reposRes.text();
      throw new Error(`GitHub API error (${reposRes.status}): ${text}`);
    }
    const repos = await reposRes.json();

    return {
      evidence: [
        {
          type: "json",
          title: `GitHub profile: ${username}`,
          content: JSON.stringify(profile, null, 2),
          source: "GitHub",
          tags: ["github", "profile"],
          metadata: { url: profile.html_url },
        },
        {
          type: "json",
          title: `GitHub repos: ${username}`,
          content: JSON.stringify(repos, null, 2),
          source: "GitHub",
          tags: ["github", "repos"],
          metadata: { count: Array.isArray(repos) ? repos.length : undefined },
        },
      ],
    };
  },
};
