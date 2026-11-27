import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const USER = "NHWK-cpu";
const TOPIC = "finished";
const TOKEN = process.env.GITHUB_TOKEN;
const headers = {
  Accept: "application/vnd.github+json",
  ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }),
};

const LANG_COLORS = {
  Go: "#00ADD8",
  Python: "#3572A5",
  PHP: "#4F5D95",
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Svelte: "#ff3e00",
  Java: "#b07219",
  "C#": "#178600",
  "Visual Basic .NET": "#945db7",
  HTML: "#e34c26",
  CSS: "#563d7c",
};

const esc = (s = "") =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

async function getFinishedRepos() {
  const repos = [];
  for (let page = 1; ; page++) {
    const res = await fetch(
      `https://api.github.com/users/${USER}/repos?type=owner&per_page=100&page=${page}`,
      { headers },
    );
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const batch = await res.json();
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos
    .filter((r) => !r.fork && r.topics?.includes(TOPIC))
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));
}

function timeAgo(iso) {
  const sec = (Date.now() - new Date(iso)) / 1000;
  const units = [
    ["tahun", 31536000],
    ["bulan", 2592000],
    ["minggu", 604800],
    ["hari", 86400],
    ["jam", 3600],
    ["menit", 60],
  ];
  for (const [name, size] of units) {
    if (sec >= size) return `${Math.floor(sec / size)} ${name} yang lalu`;
  }
  return "baru saja";
}

function wrap(text, max = 60, maxLines = 2) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max) {
      lines.push(line);
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) lines.push(line);
  return lines
    .slice(0, maxLines)
    .map((l, i, arr) =>
      i === maxLines - 1 && lines.length > maxLines
        ? l.slice(0, max - 1) + "…"
        : l,
    );
}

function card(r) {
  const lang = r.language ?? "Other";
  const color = LANG_COLORS[lang] ?? "#8b949e";
  const descLines = wrap(r.description ?? "");
  const descSvg = descLines
    .map(
      (l, i) =>
        `<text x="16" y="${58 + i * 19}" font-size="13.5" fill="#b1bac4">${esc(l)}</text>`,
    )
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="140" viewBox="0 0 400 140">
  <rect x="0.5" y="0.5" width="399" height="139" rx="12" fill="#161b22" stroke="#30363d"/>
  <text x="16" y="32" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="15.5" font-weight="600" fill="#58a6ff">${esc(r.name)}</text>
  ${descSvg}
  <line x1="16" y1="104" x2="384" y2="104" stroke="#21262d"/>
  <circle cx="21" cy="122" r="5" fill="${color}"/>
  <text x="32" y="126" font-size="12" fill="#c9d1d9">${esc(lang)}</text>
  <text x="384" y="126" font-size="12" fill="#8b949e" text-anchor="end">Last commit ${timeAgo(r.pushed_at)}</text>
</svg>`;
}

const repos = await getFinishedRepos();
mkdirSync("assets/cards", { recursive: true });
for (const r of repos) writeFileSync(`assets/cards/${r.name}.svg`, card(r));

// Susun dua kartu per baris
let rows = "";
for (let i = 0; i < repos.length; i += 2) {
  const a = repos[i],
    b = repos[i + 1];
  const td = (r) =>
    `<td width="50%" valign="top"><a href="${r.html_url}"><img src="assets/cards/${r.name}.svg" alt="${esc(r.name)}"></a></td>`;
  rows += `<tr>${td(a)}${b ? td(b) : "<td></td>"}</tr>\n`;
}
const block = `<!-- FINISHED:START -->\n<table>\n${rows}</table>\n<!-- FINISHED:END -->`;

const readme = readFileSync("README.md", "utf8");
const pattern = /<!-- FINISHED:START -->[\s\S]*?<!-- FINISHED:END -->/;
if (!pattern.test(readme))
  throw new Error("Marker FINISHED tidak ditemukan di README.md");
writeFileSync("README.md", readme.replace(pattern, block));
console.log(`Ditemukan ${repos.length} repo finished.`);
