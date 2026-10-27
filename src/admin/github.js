// Minimal GitHub REST client for the admin panel. All writes are commits to the
// default branch; the Pages workflow then rebuilds and republishes the site.

export const REPO = { owner: 'elevatestudio018', name: 'JJ-EL', branch: 'main' };

const API = 'https://api.github.com';

const b64encode = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64decodeText = (b64) =>
  new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

export class GitHub {
  constructor(token) {
    this.token = token;
    this.base = `${API}/repos/${REPO.owner}/${REPO.name}`;
  }

  async req(path, opts = {}) {
    const res = await fetch(path.startsWith('http') ? path : this.base + path, {
      ...opts,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!res.ok) {
      const err = new Error((await res.json().catch(() => ({}))).message || res.statusText);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  /** Throws unless the token can write to the repo. */
  async verify() {
    const repo = await this.req('');
    if (!repo.permissions?.push) throw new Error('Token saknar skrivrättighet (Contents: Read and write).');
    return repo;
  }

  async readJson(path) {
    const f = await this.req(`/contents/${path}?ref=${REPO.branch}&t=${Date.now()}`);
    return { data: JSON.parse(b64decodeText(f.content)), sha: f.sha };
  }

  async writeText(path, text, sha, message) {
    return this.writeBytes(path, new TextEncoder().encode(text), sha, message);
  }

  async writeBytes(path, bytes, sha, message) {
    const res = await this.req(`/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: b64encode(bytes), branch: REPO.branch, ...(sha ? { sha } : {}) }),
    });
    return res.content.sha;
  }

  /** File names in a repo directory (empty if it doesn't exist). */
  async listDir(path) {
    try {
      const items = await this.req(`/contents/${path}?ref=${REPO.branch}`);
      return items.filter((i) => i.type === 'file').map((i) => i.name);
    } catch (e) {
      if (e.status === 404) return [];
      throw e;
    }
  }

  async latestRun() {
    try {
      const r = await this.req(`/actions/runs?branch=${REPO.branch}&per_page=1`);
      return r.workflow_runs[0] || null;
    } catch {
      return null; // token lacks Actions read access — status is optional
    }
  }
}

