import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

const USER = "NHWK-cpu";
const TOPIC = "finished";
const TOKEN = process.env.GITHUB_TOKEN;
const headers = {
  Accept: "application/vnd.github+json",
  ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }),
};

// ---------- Pengaturan tampilan ----------
// Lebar total tiap kartu (px). Kartu TIDAK diperkecil selama layar cukup lebar.
// Kalau di HP kecil kartu masih terlihat mengecil, turunkan angka ini (mis. 300).
const CARD_W = 320;
const CARD_H = 176;
const GAP = 4; // ruang transparan di sekeliling kartu = jarak antar kartu
const PAD = 16; // padding isi kartu

// Satu daftar font untuk SEMUA teks. Browser memakai yang pertama yang terpasang.
// Nama "Nerd Font"/"NL" ditambahkan karena JetBrains Mono sering terpasang
// dengan nama keluarga tersebut (mis. di Linux).
const FONT =
  "JetBrains Mono, JetBrainsMono Nerd Font, JetBrains Mono NL, Segoe UI, sans-serif";

// Estimasi lebar karakter JetBrains Mono ≈ 0.6 × ukuran font (14px ≈ 8.4px).
const DESC_MAX = 32; // karakter per baris deskripsi
const DESC_LINES = 3;
const TITLE_MAX = 28;
const LANG_MAX = 10;

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
const LANG_LABELS = { "Visual Basic .NET": "VB.NET" };

const esc = (s = "") =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

const md5 = (s) => createHash("md5").update(s).digest("hex");
const cut = (s, max) => (s.length > max ? s.slice(0, max - 1) + "…" : s);

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
    ["thn", 31536000],
    ["bln", 2592000],
    ["mgg", 604800],
    ["hari", 86400],
    ["jam", 3600],
    ["mnt", 60],
  ];
  for (const [name, size] of units) {
    if (sec >= size) return `${Math.floor(sec / size)} ${name} lalu`;
  }
  return "baru saja";
}

function wrap(text, max, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (let w of words) {
    // pecah kata yang lebih panjang dari satu baris (mis. URL)
    while (w.length > max) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(w.slice(0, max));
      w = w.slice(max);
    }
    if (line && (line + " " + w).length > max) {
      lines.push(line);
      line = w;
    } else {
      line = line ? line + " " + w : w;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const out = lines.slice(0, maxLines);
  out[maxLines - 1] = out[maxLines - 1].slice(0, max - 1).trimEnd() + "…";
  return out;
}

// Hue 0-359 yang acak tetapi STABIL: dihitung dari nama repo, jadi warna tiap
// kartu berbeda-beda namun tidak berubah setiap workflow berjalan.
const hueOf = (name) => parseInt(md5(name).slice(0, 6), 16) % 360;

function card(r) {
  const h = hueOf(r.name);
  const lang = r.language ?? "Other";
  const langLabel = cut(LANG_LABELS[lang] ?? lang, LANG_MAX);
  const dot = LANG_COLORS[lang] ?? `hsl(${h}, 60%, 55%)`;
  const title = cut(r.name, TITLE_MAX);
  const desc = wrap(
    r.description?.trim() || "Belum ada deskripsi.",
    DESC_MAX,
    DESC_LINES,
  );

  const x = GAP + PAD;
  const right = CARD_W - GAP - PAD;
  const descSvg = desc
    .map(
      (l, i) =>
        `<text class="desc" x="${x}" y="${64 + i * 20}" font-family="${FONT}" font-size="14">${esc(l)}</text>`,
    )
    .join("\n  ");

  // Warna mengikuti tema browser/OS pengunjung via prefers-color-scheme.
  // Semua teks memakai font yang sama (diset di root, di CSS, dan per elemen).
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" font-family="${FONT}">
  <style>
    svg, text, tspan { font-family: ${FONT}; }
    text { font-size: 14px; }
    .bg { fill: hsl(${h}, 60%, 97%); stroke: hsl(${h}, 45%, 78%); stroke-width: 1.5; }
    .title { fill: hsl(${h}, 75%, 34%); font-size: 16px; font-weight: 700; }
    .desc { fill: hsl(${h}, 12%, 28%); }
    .lang { fill: hsl(${h}, 15%, 18%); }
    .meta { fill: hsl(${h}, 10%, 36%); }
    .sep { stroke: hsl(${h}, 35%, 85%); }
    @media (prefers-color-scheme: dark) {
      .bg { fill: hsl(${h}, 28%, 12%); stroke: hsl(${h}, 40%, 32%); }
      .title { fill: hsl(${h}, 90%, 72%); }
      .desc { fill: hsl(${h}, 15%, 80%); }
      .lang { fill: hsl(${h}, 15%, 88%); }
      .meta { fill: hsl(${h}, 12%, 68%); }
      .sep { stroke: hsl(${h}, 25%, 24%); }
    }
  </style>
  <rect class="bg" x="${GAP}" y="${GAP}" width="${CARD_W - GAP * 2}" height="${CARD_H - GAP * 2}" rx="12"/>
  <text class="title" x="${x}" y="36" font-family="${FONT}" font-size="16">${esc(title)}</text>
  ${descSvg}
  <line class="sep" x1="${x}" y1="124" x2="${right}" y2="124"/>
  <circle cx="${x + 5}" cy="145" r="5" fill="${dot}"/>
  <text class="lang" x="${x + 18}" y="150" font-family="${FONT}" font-size="14">${esc(langLabel)}</text>
  <text class="meta" x="${right}" y="150" font-family="${FONT}" font-size="14" text-anchor="end">Commit ${timeAgo(r.pushed_at)}</text>
</svg>`;
}

const repos = await getFinishedRepos();
console.log(
  "Repo finished:",
  repos.map((r) => `${r.name} [${r.topics.join(", ")}]`),
);
mkdirSync("assets/cards", { recursive: true });

// Tulis tiap kartu sekali, hitung hash untuk cache-busting.
const versions = {};
for (const r of repos) {
  const svg = card(r);
  writeFileSync(`assets/cards/${r.name}.svg`, svg);
  versions[r.name] = md5(svg).slice(0, 8);
}

// Tanpa tabel: gambar inline akan otomatis turun ke baris berikutnya
// saat lebar layar tidak cukup, dan ukurannya tetap CARD_W.
const items = repos
  .map(
    (r) =>
      `<a href="${r.html_url}"><img src="assets/cards/${r.name}.svg?v=${versions[r.name]}" width="${CARD_W}" alt="${esc(r.name)}"></a>`,
  )
  .join("\n");
const block = `<!-- FINISHED:START -->\n<div align="center">\n${items}\n</div>\n<!-- FINISHED:END -->`;

const readme = readFileSync("README.md", "utf8");
const pattern = /<!-- FINISHED:START -->[\s\S]*?<!-- FINISHED:END -->/;
if (!pattern.test(readme))
  throw new Error("Marker FINISHED tidak ditemukan di README.md");
writeFileSync("README.md", readme.replace(pattern, block));
console.log(`Ditemukan ${repos.length} repo finished.`);
