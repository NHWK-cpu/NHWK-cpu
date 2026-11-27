import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

const USER = "NHWK-cpu";
const TOPIC = "finished";
const TOKEN = process.env.GITHUB_TOKEN;
const headers = {
  Accept: "application/vnd.github+json",
  ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }),
};

// Font di dalam SVG <img> hanya bisa memakai font yang terpasang di perangkat
// pengunjung. JetBrains Mono dipakai jika terpasang, selain itu Segoe UI,
// lalu sans-serif sebagai cadangan terakhir.
const FONT = "'JetBrains Mono', 'Segoe UI', sans-serif";

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

// Lebar 46 karakter cocok untuk JetBrains Mono (lebih lebar dari Segoe UI).
function wrap(text, max = 46, maxLines = 2) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > max) {
      lines.push(line);
      line = w;
    } else {
      line = line ? line + " " + w : w;
    }
  }
  if (line) lines.push(line);
  return lines
    .slice(0, maxLines)
    .map((l, i) =>
      i === maxLines - 1 && lines.length > maxLines
        ? l.slice(0, max - 1) + "…"
        : l,
    );
}

function card(r) {
  const lang = r.language ?? "Other";
  const color = LANG_COLORS[lang] ?? "#8b949e";
  const title = r.name.length > 36 ? r.name.slice(0, 35) + "…" : r.name;
  const descSvg = wrap(r.description ?? "")
    .map(
      (l, i) =>
        `<text class="desc" x="16" y="${58 + i * 19}" font-size="13">${esc(l)}</text>`,
    )
    .join("\n  ");

  // Warna mengikuti preferensi tema browser/OS pengunjung lewat
  // @media (prefers-color-scheme). Di dalam <img>, SVG tidak bisa membaca
  // CSS dari halaman GitHub, jadi aturan ini ditaruh di dalam SVG itu sendiri.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="140" viewBox="0 0 400 140">
  <style>
    text { font-family: ${FONT}; }
    .bg { fill: #ffffff; stroke: #d1d9e0; }
    .title { fill: #0969da; font-weight: 600; }
    .desc { fill: #475569; }
    .lang { fill: #1f2328; }
    .meta { fill: #656d76; }
    .sep { stroke: #d8dee4; }
    @media (prefers-color-scheme: dark) {
      .bg { fill: #161b22; stroke: #30363d; }
      .title { fill: #58a6ff; }
      .desc { fill: #b1bac4; }
      .lang { fill: #c9d1d9; }
      .meta { fill: #8b949e; }
      .sep { stroke: #21262d; }
    }
  </style>
  <rect class="bg" x="0.5" y="0.5" width="399" height="139" rx="12"/>
  <text class="title" x="16" y="32" font-size="15">${esc(title)}</text>
  ${descSvg}
  <line class="sep" x1="16" y1="104" x2="384" y2="104"/>
  <circle cx="21" cy="122" r="5" fill="${color}"/>
  <text class="lang" x="32" y="126" font-size="12">${esc(lang)}</text>
  <text class="meta" x="384" y="126" font-size="12" text-anchor="end">Last commit ${timeAgo(r.pushed_at)}</text>
</svg>`;
}

const repos = await getFinishedRepos();
mkdirSync("assets/cards", { recursive: true });

// Tulis setiap kartu sekali, sekaligus hitung hash untuk cache-busting.
const versions = {};
for (const r of repos) {
  const svg = card(r);
  writeFileSync(`assets/cards/${r.name}.svg`, svg);
  versions[r.name] = createHash("md5").update(svg).digest("hex").slice(0, 8);
}

let rows = "";
for (let i = 0; i < repos.length; i += 2) {
  const a = repos[i],
    b = repos[i + 1];
  const td = (r) =>
    `<td width="50%" valign="top"><a href="${r.html_url}"><img src="assets/cards/${r.name}.svg?v=${versions[r.name]}" alt="${esc(r.name)}"></a></td>`;
  rows += `<tr>${td(a)}${b ? td(b) : "<td></td>"}</tr>\n`;
}
const block = `<!-- FINISHED:START -->\n<table>\n${rows}</table>\n<!-- FINISHED:END -->`;

const readme = readFileSync("README.md", "utf8");
const pattern = /<!-- FINISHED:START -->[\s\S]*?<!-- FINISHED:END -->/;
if (!pattern.test(readme))
  throw new Error("Marker FINISHED tidak ditemukan di README.md");
writeFileSync("README.md", readme.replace(pattern, block));
console.log(`Ditemukan ${repos.length} repo finished.`);
