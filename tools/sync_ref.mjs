// 把本地 git 对齐到远端 HEAD：补 blob/tree/commit 对象，再把 ref 指过去。
// 本仓库提交全走 GitHub API（git push 在当前离线不可用），本地缺对象，
// `git status` 会报 bad tree object HEAD，所以每次提交后都要跑一次。
import { execFileSync } from 'node:child_process';
const REPO = 'ch2571875057-ux/emirates-concert-venue';
const tok = /password=(.*)/.exec(execFileSync('git', ['credential-manager', 'get'],
  { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' }))[1].trim();
const H = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'User-Agent': 'x' };
const get = async (u) => (await fetch(u, { headers: H })).json();
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();

const head = (await get(`https://api.github.com/repos/${REPO}/git/ref/heads/main`)).object.sha;
const want = [];   // 需补齐的 commit
let cur = head;
while (cur) {
  try { git('cat-file', '-e', cur + '^{commit}'); break; }
  catch { const c = await get(`https://api.github.com/repos/${REPO}/git/commits/${cur}`); want.push(c); cur = c.parents[0]?.sha; }
}

const blobs = new Map();
async function buildTree(sha) {
  if (blobs.has(sha)) return blobs.get(sha);
  const node = await get(`https://api.github.com/repos/${REPO}/git/trees/${sha}`);
  const lines = [];
  for (const e of node.tree) {
    let s = e.sha;
    if (e.type === 'tree') s = await buildTree(e.sha);
    else if (!exists(s)) {
      const j = await (await fetch(`https://api.github.com/repos/${REPO}/git/blobs/${s}`, { headers: H })).json();
      const buf = Buffer.from(j.content, j.encoding === 'base64' ? 'base64' : 'utf8');
      execFileSync('git', ['hash-object', '-w', '-t', 'blob', '--stdin'], { input: buf });
    }
    lines.push(`${e.mode} ${e.type} ${s}\t${e.path}`);
  }
  const out = execFileSync('git', ['mktree'], { input: lines.join('\n') + '\n', encoding: 'utf8' }).trim();
  blobs.set(sha, out);
  return out;
}
function exists(sha) { try { git('cat-file', '-e', sha); return true; } catch { return false; } }

const fmt = (a) => `${a.name} <${a.email}> ${Math.floor(new Date(a.date).getTime() / 1000)} +0800`;
for (const c of want.reverse()) {
  await buildTree(c.tree.sha);
  const body = [`tree ${c.tree.sha}`, ...c.parents.map((p) => `parent ${p.sha}`),
    `author ${fmt(c.author)}`, `committer ${fmt(c.committer)}`, '', c.message].join('\n');
  execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], { input: body });
}
git('update-ref', 'refs/heads/main', head);
execFileSync('git', ['reset'], { stdio: 'ignore' });
console.log('synced', head.slice(0, 8), 'commits', want.length);
