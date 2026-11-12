/* ============================================================
   NEBULA — Central de Jogos
   Leve, sem dependências. Vanilla JS.
   ============================================================ */
'use strict';

/* ---------------- Dados ---------------- */

const JSD = 'https://cdn.jsdelivr.net/gh/Onex558/';
const RAW_U = 'https://raw.githubusercontent.com/Onex558/uranium-source-/main/';
const RAW_R = 'https://raw.githubusercontent.com/Onex558/retro-games-/main/';
const W_BASE = 'https://script.google.com/macros/s/AKfycbw3KzPix7iLtyJFB7eVqm2NCWhRoqSl0G38p7YeJm6KEHlETcuc-8jVnom69pUcwQUk/exec?id=';
const LINKS = [
  { id: 'HVLL6YBBC5', ok: true },
  { id: 'V9KM79NFHC', ok: true },
  { id: 'J4JXSS9W3N', ok: false },
  { id: 'GEMXRNAA6W', ok: true },
  { id: 'HUZSGDFGGP', ok: true },
];
const W0 = W_BASE + LINKS[0].id;
const I = 'uranium-source-@main/images/';

/* [nome, capa (relativa ao CDN jsDelivr) ou null, jogável, download, tag]
   jogável/download: 'u:arquivo' (uranium-source-@main) | 'r:arquivo' (retro-games-@main)
   'w' = no site original (WebSight) | '' = sem arquivo direto */
const GAMES = [
  ['Doom', I + '1200.webp', 'u:doom.html', 'u:doom.html'],
  ['Doom 2', I + 'ss_05f81f237a6370c3c797af951b42291dc747d199.1920x1080.jpg', 'u:doom2.html', 'u:doom2.html'],
  ['Doom 3', I + 'doom3box.jpg', 'u:doom3.html', 'u:doom3.html'],
  ['Capuchin', I + 'capuchinimg.jpg', 'w', 'w'],
  ['Doom 64', I + 'doom_64_box.jpg', 'u:doom64.html', 'u:doom64.html'],
  ['Gran Turismo 2', I + '61qihedj+5l._ac_uf1000,1000_ql80_.jpg', 'u:gt2.html', 'u:gt2.html'],
  ['GTA Advance', I + 'grand theft auto advance (usa)-image.png', 'u:gtaa.html', 'u:gtaa.html'],
  ['GTA China', I + 'grand theft auto - chinatown wars (usa) (en,fr,de,es,it)-image.png', 'u:gtachina.html', 'u:gtachina.html'],
  ['GTA Vice City Stories', I + 'gtavcs.jpg', 'u:gtavcs.html', 'u:gtavcs.html'],
  ['Journey', I + 'journey-image.png', 'u:journey.html', 'u:journey.html'],
  ['LEGO Star Wars', I + '61xyz0rhcol._ac_uf1000,1000_ql80_.jpg', 'u:lsw.html', 'u:lsw.html'],
  ['LEGO Star Wars 2', I + 'download.jfif', 'u:lsw2.html', 'u:lsw2.html'],
  ['Super Mario World', I + 'super_mario_world_coverart.png', 'u:smw.html', 'u:smw.html'],
  ['Scribblenauts', I + 'scribblenauts_cover.jpg', 'u:scribblenauts.html', 'u:scribblenauts.html'],
  ['Opposing Force', I + 'opposing.png', 'u:opposing.html', 'u:opposing.html'],
  ['Peggle', I + 'peggle.png', 'u:peggle.html', 'u:peggle.html'],
  ['Super Mario Bros', I + 'super_mario_bros._box.png', 'u:smb.html', 'u:smb.html'],
  ['Super Mario Bros 2', I + 'super mario bros. 2 (usa) (rev 1)-image.png', 'u:smb2.html', 'u:smb2.html'],
  ['Super Mario Bros 3', I + 'super mario bros. 3 (usa) (rev 1)-image.png', 'u:smb3.html', 'u:smb3.html'],
  ['Ms. Pac-Man', I + 'mspacman-thumb.png', 'u:mspacman.html', 'u:mspacman.html'],
  ["Patrick's", I + 'OIP.jpg', 'u:patricks/index.html', 'w'],
  ['Plants vs. Zombies', I + 'plants+vs.+zombies+(usa)-image.jpg', 'u:pvz.html', 'u:pvz.html'],
  ['Shotgun Mario 64', I + 'shotgunmario64.png', 'u:shotgunmario64.html', 'u:shotgunmario64.html'],
  ['Pac-Man', I + 'puckman-thumb.jpg', 'u:puckman.html', 'u:puckman.html'],
  ['Half-Life', I + 'half-life.png', 'w', 'w'],
  ['NBA JAM', I + 'nbajamte-1673053591219.jpg', 'w', 'w'],
  ['BitLife', I + 'images (71).jpeg', 'w', 'w'],
  ['Paper Mario DS', I + 'paper mario ds.jpg', 'w', 'w'],
  ['Bitplanes', I + 'bitplaness.jpg', 'w', 'w'],
  ['Backyard Baseball 10', I + '6333099-backyard-baseball-10-nintendo-ds-front-cover.jpg', 'w', 'w'],
  ['Angry Birds', I + 'angry birds.jpg', 'w', 'w'],
  ['Flushed Away DS', I + 'ds_flushed_away_p_mvu68a.jpg', 'r:flushed away.html', 'r:flushed away.html'],
  ['Mario Party Advance', I + 'MariopartyGBA.jpg', 'w', 'w'],
  ['Subway Surfers Berlin', I + 'subway-surfers-berlin.png', 'w', 'w'],
  ['Baseball Bros', I + 'baseball_bros.webp', 'w', 'w'],
  ["Five Nights at Shrek's", I + '770ff34d406e6ccd6ee470d9d9b3d55f.jpg', 'w', 'w'],
  ['FIFA World Cup 2026 SNES', I + 'image-49.png', 'w', 'w'],
  ['Cookie Clicker', I + '432bf350e866b2544f9a5cd80de83e0c24f4efddfd7811016c4aa33e48c5df7c.avif', 'w', 'w'],
  ['Spaceflight Simulator', I + '09dc947ac1fdd31481539b5768a86513.png', 'w', 'w'],
  ['1v1.LOL', I + 'channels4_profile.jpg', 'w', 'w'],
  ['2048', I + 'download.png', 'w', 'w'],
  ['2048 Cupcakes', I + 'download.jpg', 'w', 'w'],
  ['3 Pandas', I + 'images.jpg', 'w', 'w'],
  ['3 Pandas Brazil', I + 'pandasinjapna.jpg', 'w', 'w'],
  ['3 Pandas Fantasy', I + '3pandasinfanstasy.jpeg', 'w', 'w'],
  ['3 Pandas Japan', I + '3pandasinjapan.jpeg', 'w', 'w'],
  ['3 Pandas Night', I + 'panasdss night.jpeg', 'w', 'w'],
  ['3 Slices 2', I + '3slicesof2.png', 'w', 'w'],
  ['4th and Goal', I + '4thandgoal.jpeg', 'w', 'w'],
  ['8 Ball Classic', I + '8BallBilliardsClassicTeaser.jpg', 'w', 'w'],
  ['8 Ball Pool', I + '8-Ball-Pool.png.webp', 'w', 'w'],
  ['ADOFAI', I + 'adofai.jpg', 'w', 'w'],
  ['A Dark Room', I + 'Adventure-Capitalist.webp', 'w', 'w'],
  ['Adventure Capitalist', I + 'altered-beast-3.jpg', 'w', 'w'],
  ['Altered Beast', I + 'geometry-dash-wave-game.png', 'w', 'w'],
  ['Geometry Dash Wave', I + 'Awesome-Pirates.jpg', 'w', 'w'],
  ['Awesome Pirates', I + 'sm64_b3313_fanart_by_modraw08_djcr62e-fullview.jpg', 'w', 'w'],
  ['B3313', I + 'bfdi_branches__demo__poster__by_bobbyinteraction5_dhr7288-fullview.jpg', 'w', 'w'],
  ['BFDI Branches', 'uranium-source-@refs/heads/main/images/bmx 2.avif', 'w', 'w'],
  ['BMX 2', I + 'OIP.jpg', 'w', 'w'],
  ['Bloons TD 1', I + 'bank-robbery.jpg', 'w', 'w'],
  ['Bank Robbery', I + 'Bonanza-Bros-destc-1024x576.jpg', 'w', 'w'],
  ['Bonanza Bros', I + 'bounty-of-one-button-1696613856511.jpg', 'w', 'w'],
  ['Bounty Of One', I + 'brawl-stars-game-ft.webp', 'w', 'w'],
  ['Brawl Stars', I + 'celltosingularity-1673648155490.jpg', 'w', 'w'],
  ['Cell To Singularity', 'uranium-source-@refs/heads/main/images/chicken-cs_16x9-cover.avif', 'w', 'w'],
  ['Chicken CS', I + 'CircloO_2.png', 'w', 'w'],
  ['CircloO 2', I + 'crystal-castles_5.png', 'w', 'w'],
  ['Crystal Castles', I + 'dashmetry.png', 'w', 'w'],
  ['Dashmetry', I + '1200px-Dragon_Ball_Z-_The_Legacy_of_Goku_(us)_cover.jpg', 'w', 'w'],
  ['Dragon Ball Z Legacy of Goku', I + 'Dragon-Quest-IX-Box-art-1280px-50p.webp', 'w', 'w'],
  ['Dragon Quest IX', I + 'fifa 7.jpg', 'w', 'w'],
  ['FIFA 07', 'uranium-source-@refs/heads/main/images/FIFA-10-Cover.avif', 'w', 'w'],
  ['FIFA 10', I + 'Fifa11_Game_Cover.jpg', 'w', 'w'],
  ['FIFA 11', I + 'fnaf1_cover.webp', 'w', 'w'],
  ['FNAF', I + 'five-nights-at-freddys-2-game.jpg', 'w', 'w'],
  ['FNAF 2', I + 'fnaf3_cover.webp', 'w', 'w'],
  ['FNAF 3', 'uranium-source-@refs/heads/main/images/fnaf-4-poster.avif', 'w', 'w'],
  ['FNAF 4', I + '56869-dan-kitchen-s-tomcat-the-f-14-fighter-simulator-atari-2600-front-cover.webp', 'w', 'w'],
  ['Tomcat F-14 Flight Sim', I + 'microsoft-flight-simulator-4-03-big.webp', 'w', 'w'],
  ['MS Flight Sim Old', I + 'images (6).jpeg', 'u:microsoftflightsimold.html', 'u:microsoftflightsimold.html'],
  ['Untime', I + 'images (5).jpeg', 'w', 'w'],
  ['Untitled Goose Game', I + 'images (8).jpeg', 'w', 'w'],
  ['Upgrade Complete', I + 'images (7).jpeg', 'w', 'w'],
  ['Upgrade Complete 2', I + 'images (9).jpeg', 'w', 'w'],
  ['Upslash', I + 'download (2).jpeg', 'w', 'w'],
  ['Urban Champion', I + 'images (72).jpeg', 'w', 'w'],
  ['Cluster Rush', I + 'images (10).jpeg', 'w', 'w'],
  ['Vampire Survivors', I + 'header.jpg', 'w', 'w'],
  ['Vanguard', I + 'images (11).jpeg', 'w', 'w'],
  ['Vapor Trails', I + 'images (12).jpeg', 'w', 'w'],
  ['Minecraft Tower Defense', I + 'images (1).webp', 'w', 'w'],
  ['Hell Talker', I + 'images.png', 'w', 'w'],
  ['10 Minutes Til Dawn', I + 'images (16).jpeg', 'w', 'w'],
  ['Crossy Road', I + 'images (1).png', 'w', 'w'],
  ['Slope', I + 'images (19).jpeg', 'w', 'w'],
  ['Run', I + 'images (20).jpeg', 'w', 'w'],
  ['Run 2', I + 'images (21).jpeg', 'w', 'w'],
  ['Retro Bowl', I + 'unnamed.png', 'w', 'w'],
  ["Baldi's Basics", I + 'baldisbasics_plus.webp', 'w', 'w'],
  ['Chess', I + 'images (22).jpeg', 'w', 'w'],
  ['Minecraft', I + 'download (3).jpeg', 'u:mcpe.html', 'u:mcpe.html'],
  ['Stack', I + 'images (25).jpeg', 'w', 'w'],
  ['Happy Wheels', I + 'happy-wheels-logo.avif', 'u:happywheels.html', 'u:happywheels.html'],
  ['Orange Roulette', I + 'images (27).jpeg', 'w', 'w'],
  ['Friday Night Funkin Twiddler Finger', I + 'images (32).jpeg', 'w', 'w'],
  ['Friday Night Funkin Aethos', I + 'images (33).jpeg', 'w', 'w'],
  ['Friday Night Funkin Binary Breakdown', I + 'images (34).jpeg', 'w', 'w'],
  ['Friday Night Funkin Below Depths', I + 'images (35).jpeg', 'w', 'w'],
  ['Friday Night Funkin Black Betrayal', I + 'images (36).jpeg', 'w', 'w'],
  ['Friday Night Funkin B Side', I + 'images (37).jpeg', 'w', 'w'],
  ['Friday Night Funkin Candy Carrier', I + 'images (38).jpeg', 'w', 'w'],
  ['Friday Night Funkin Chara', I + 'images (39).jpeg', 'w', 'w'],
  ['Friday Night Funkin City Tales', I + 'images (40).jpeg', 'w', 'w'],
  ['Friday Night Funkin Corrision', I + 'images (17).jpeg', 'w', 'w'],
  ['Friday Night Funkin Cory', I + 'maxresdefault.jpg', 'w', 'w'],
  ['Friday Night Funkin Crunchin', I + 'images (42).jpeg', 'w', 'w'],
  ['Friday Night Funkin Deceiver', I + 'images (43).jpeg', 'w', 'w'],
  ['Friday Night Funkin Desolation', I + 'images (44).jpeg', 'w', 'w'],
  ['Friday Night Funkin Golden Apple', I + 'images (50).jpeg', 'w', 'w'],
  ['Doodle Jump', I + 'images (49).jpeg', 'w', 'w'],
  ['Basket Bros', I + 'images (54).jpeg', 'w', 'w'],
  ['Paper.io', I + '6-1-684971-52.webp', 'w', 'w'],
  ['Moto X3M', I + 'images (55).jpeg', 'w', 'w'],
  ['Moto X3M 2', I + 'images (56).jpeg', 'w', 'w'],
  ['Moto X3M Winter', I + 'moto-x3m-4-winter-logo.jpeg', 'w', 'w'],
  ['Google Dino Game', I + 'unnamed (1).png', 'w', 'w'],
  ['Pac Man', I + 'images (2).png', 'w', 'w'],
  ['Parking Fury', I + 'images (57).jpeg', 'w', 'w'],
  ['Fruit Ninja', I + 'images (58).jpeg', 'w', 'w'],
  ['Flappy Bird', I + 'images (59).jpeg', 'w', 'w'],

  /* Escolhidos a mão no site original (sem capa) */
  ['Deathrun 3D', null, 'w', 'w', 'escolhido'],
  ['TikTok Unblockable', null, 'w', 'w', 'escolhido'],
  ['Tanuki Sunset', null, 'w', 'w', 'escolhido'],
  ['Block Blast', null, 'w', 'w', 'escolhido'],
  ['People Playground', null, 'w', 'w', 'escolhido'],
  ['Ragdoll Archers', null, 'w', 'w', 'escolhido'],
  ['Ragdoll Hit', null, 'w', 'w', 'escolhido'],
  ['Wordle', null, 'w', 'w', 'escolhido'],
  ['Gdweb', null, 'w', 'w', 'escolhido'],
  ['Sandboxels', null, 'w', 'w', 'escolhido'],

  /* Biblioteca externa (Axiom, Noah\u2019s Hub, etc.) */
  ['3d Bolt Master', null, 'w', 'w', 'externo'],
  ['3d Bowling', null, 'w', 'w', 'externo'],
  ['99 Balls 3d', null, 'w', 'w', 'externo'],
  ['Amaze', null, 'w', 'w', 'externo'],
  ['Angry Birds Showdown', null, 'w', 'w', 'externo'],
  ['Aquapark Io', null, 'w', 'w', 'externo'],
  ['Archery World Tour', null, 'w', 'w', 'externo'],
  ['Attack Hole', null, 'w', 'w', 'externo'],
  ['Ball Blast', null, 'w', 'w', 'externo'],
  ['Balloon Paradise', null, 'w', 'w', 'externo'],
  ['Basket Battle', null, 'w', 'w', 'externo'],
  ['Basketball Frvr', null, 'w', 'w', 'externo'],
  ['Bazooka Boy', null, 'w', 'w', 'externo'],
  ['Bolly Beat', null, 'w', 'w', 'externo'],
  ['Bottle Jump 3d', null, 'w', 'w', 'externo'],
  ['Bouncemasters', null, 'w', 'w', 'externo'],
  ['Bowmasters', null, 'w', 'w', 'externo'],
  ['Bridge Race', null, 'w', 'w', 'externo'],
  ['Build A Queen', null, 'w', 'w', 'externo'],
  ['Cannon Balls 3d', null, 'w', 'w', 'externo'],
  ['Carrom Clash', null, 'w', 'w', 'externo'],
  ['Chess Classic', null, 'w', 'w', 'externo'],
  ['City Smash', null, 'w', 'w', 'externo'],
  ['Color Burst 3d', null, 'w', 'w', 'externo'],
  ['Color Match', null, 'w', 'w', 'externo'],
  ['Color Water Sort 3d', null, 'w', 'w', 'externo'],
  ['Dan The Man', null, 'w', 'w', 'externo'],
  ['Dig Deep', null, 'w', 'w', 'externo'],
  ['Draw The Line', null, 'w', 'w', 'externo'],
  ['Fashion Battle', null, 'w', 'w', 'externo'],
  ['Fill The Fridge', null, 'w', 'w', 'externo'],
  ['Find The Alien', null, 'w', 'w', 'externo'],
  ['Flappy Dunk', null, 'w', 'w', 'externo'],
  ['Fork N Sausage', null, 'w', 'w', 'externo'],
  ['Freekick Football', null, 'w', 'w', 'externo'],
  ['Go Escape', null, 'w', 'w', 'externo'],
  ['Going Balls', null, 'w', 'w', 'externo'],
  ['Guess Their Answer', null, 'w', 'w', 'externo'],
  ['Gym Stack', null, 'w', 'w', 'externo'],
  ['Harvest Io', null, 'w', 'w', 'externo'],
  ['Hide N Seek', null, 'w', 'w', 'externo'],
  ['Hill Climb Racing Lite', null, 'w', 'w', 'externo'],
  ['Kitchen Bazar', null, 'w', 'w', 'externo'],
  ['Magic Tiles 3', null, 'w', 'w', 'externo'],
  ['Match Triple 3d', null, 'w', 'w', 'externo'],
  ['Maze Speedrun', null, 'w', 'w', 'externo'],
  ['Mob Control Html5', null, 'w', 'w', 'externo'],
  ['Mr Racer', null, 'w', 'w', 'externo'],
  ['Om Nom Run', null, 'w', 'w', 'externo'],
  ['Pac Man Superfast', null, 'w', 'w', 'externo'],
  ['Parking Rush', null, 'w', 'w', 'externo'],
  ['Pokey Ball', null, 'w', 'w', 'externo'],
  ['Pou', null, 'w', 'w', 'externo'],
  ['Race Master 3d', null, 'w', 'w', 'externo'],
  ['Room Sort', null, 'w', 'w', 'externo'],
  ['Royal Towers Medieval Td', null, 'w', 'w', 'externo'],
  ['Scooter Xtreme', null, 'w', 'w', 'externo'],
  ['Slice It All', null, 'w', 'w', 'externo'],
  ['Slime Io', null, 'w', 'w', 'externo'],
  ['Soccer Dash', null, 'w', 'w', 'externo'],
  ['Solar Smash', null, 'w', 'w', 'externo'],
  ['Stacky Dash', null, 'w', 'w', 'externo'],
  ['State Io', null, 'w', 'w', 'externo'],
  ['Stealth Master', null, 'w', 'w', 'externo'],
  ['Stick War Legacy', null, 'w', 'w', 'externo'],
];

const TAG_LABEL = { 'escolhido': 'escolhido', 'externo': 'biblioteca' };

/* ---------------- Utilidades ---------------- */

const $ = (s, r = document) => r.querySelector(s);
const enc = p => p.split('/').map(encodeURIComponent).join('/');
const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function playURL(g) {
  const p = g[2];
  if (!p || p === 'w') return W0;
  if (p.startsWith('u:')) return JSD + 'uranium-source-@main/' + enc(p.slice(2));
  if (p.startsWith('r:')) return JSD + 'retro-games-@main/' + enc(p.slice(2));
  return W0;
}
function isWebGame(g) { return !g[2] || g[2] === 'w'; }
function rawURL(ref) {
  const k = ref[0], f = enc(ref.slice(2));
  return (k === 'u' ? RAW_U : RAW_R) + f;
}
function coverURL(c) { return JSD + enc(c); }

let toastTimer = null;
function toast(msg, ms = 3600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/* Abrir em about:blank (comportamento original) */
function openInBlank(url) {
  const w = window.open('about:blank', '_blank');
  if (!w) { toast('Pop-up bloqueado! Permita pop-ups para este site e tente de novo. 🙏'); return; }
  try {
    w.opener = null;
    w.location.replace(url);
  } catch (e) {
    try { w.close(); } catch (_) { /* ok */ }
    window.open(url, '_blank', 'noopener');
  }
}

let webHinted = false;
function webHint() {
  if (webHinted) return;
  webHinted = true;
  toast('Esse jogo mora no site original — abri lá pra você! (este aviso aparece só uma vez) ✨', 4600);
}

/* Download real (fetch → blob) quando houver arquivo direto */
async function downloadGame(name, ref) {
  if (!ref || ref === 'w') { webHint(); openInBlank(W0); return; }
  const url = rawURL(ref);
  const fname = ref.split(':').pop().split('/').pop() || 'jogo';
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('http ' + res.status);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('⬇ Baixando “' + name + '”…');
  } catch (e) {
    window.open(url, '_blank', 'noopener');
    toast('Abri o arquivo em outra aba — use “Salvar página como…” para guardar. 💾');
  }
}

/* ---------------- Configurações ---------------- */

const KEY = 'nebula-settings';
const DEF = { particles: true, density: 'media', cursor: true, reduce: false };
const FINE = matchMedia('(pointer: fine)').matches;
let S = { ...DEF };
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved && typeof saved === 'object') S = { ...DEF, ...saved };
} catch (e) { /* usa padrão */ }
if (!localStorage.getItem(KEY) && matchMedia('(prefers-reduced-motion: reduce)').matches) S.reduce = true;

function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ok */ }
}

/* ---------------- Partículas ---------------- */

const cvs = $('#particles');
const ctx = cvs.getContext('2d');
const DENSITY = { baixa: 34, media: 64, alta: 100 };
let parts = [];
let confetti = [];
let rafId = null;
let DPR = 1;

function resizeCanvas() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  cvs.width = Math.floor(innerWidth * DPR);
  cvs.height = Math.floor(innerHeight * DPR);
}

function spawn() {
  return {
    x: Math.random() * cvs.width,
    y: Math.random() * cvs.height,
    vx: (Math.random() - .5) * .38 * DPR,
    vy: (Math.random() - .5) * .38 * DPR,
    r: (Math.random() * 1.4 + .7) * DPR,
    a: Math.random() * .4 + .18,
    c: Math.random() < .72 ? '139,124,247' : '94,234,212',
    tw: Math.random() * 6.28,
  };
}

function seedParticles() {
  const n = DENSITY[S.density] || 64;
  parts = Array.from({ length: n }, spawn);
}

function drawStatic() {
  ctx.clearRect(0, 0, cvs.width, cvs.height);
  for (const p of parts) {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(' + p.c + ',' + p.a + ')';
    ctx.arc(p.x, p.y, p.r, 0, 7);
    ctx.fill();
  }
}

function tick() {
  rafId = null;
  ctx.clearRect(0, 0, cvs.width, cvs.height);

  const alive = (S.particles && !S.reduce) || confetti.length > 0;
  if (alive && !document.hidden) {
    if (S.particles && !S.reduce) {
      const L = 110 * DPR;
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.tw += .02;
        if (p.x < 0) p.x += cvs.width; if (p.x > cvs.width) p.x -= cvs.width;
        if (p.y < 0) p.y += cvs.height; if (p.y > cvs.height) p.y -= cvs.height;
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const a = parts[i], b = parts[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < L * L) {
            const al = (1 - Math.sqrt(d2) / L) * .13;
            ctx.strokeStyle = 'rgba(139,124,247,' + al.toFixed(3) + ')';
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      for (const p of parts) {
        const flick = .7 + .3 * Math.sin(p.tw);
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + p.c + ',' + (p.a * flick).toFixed(3) + ')';
        ctx.arc(p.x, p.y, p.r, 0, 7);
        ctx.fill();
      }
    }
    /* confete */
    confetti = confetti.filter(c => c.life > 0 && c.y < cvs.height + 20);
    for (const c of confetti) {
      c.x += c.vx; c.y += c.vy; c.vy += c.g; c.rot += c.vr; c.life--;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.globalAlpha = Math.min(1, c.life / 40);
      ctx.fillStyle = c.c;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    rafId = requestAnimationFrame(tick);
  }
}

function ensureLoop() { if (rafId === null) rafId = requestAnimationFrame(tick); }

function burst(x, y, n) {
  const colors = ['#8b7cf7', '#5eead4', '#f472b6', '#facc15', '#60a5fa', '#34d399'];
  for (let i = 0; i < n; i++) {
    confetti.push({
      x, y,
      vx: (Math.random() - .5) * 11 * DPR,
      vy: -(Math.random() * 8 + 3) * DPR,
      g: .22 * DPR,
      w: (5 + Math.random() * 6) * DPR,
      h: (3 + Math.random() * 4) * DPR,
      rot: Math.random() * 6.28,
      vr: (Math.random() - .5) * .32,
      c: colors[(Math.random() * colors.length) | 0],
      life: 80 + Math.random() * 55,
    });
  }
  ensureLoop();
}

function particlesApply() {
  if (S.particles) {
    seedParticles();
    if (S.reduce) drawStatic(); else ensureLoop();
  } else {
    parts = [];
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    if (confetti.length) ensureLoop();
  }
}

/* ---------------- Cursor personalizado ---------------- */

const dot = $('#cur-dot');
const ring = $('#cur-ring');
let mx = innerWidth / 2, my = innerHeight / 2;
let rx = mx, ry = my, rs = 1, ts = 1;
let cursorOn = false;

function cursorLoop() {
  if (cursorOn) {
    rx += (mx - rx) * .16;
    ry += (my - ry) * .16;
    rs += (ts - rs) * .2;
    dot.style.transform = 'translate(' + mx + 'px,' + my + 'px) translate(-50%,-50%)';
    ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px) translate(-50%,-50%) scale(' + rs.toFixed(3) + ')';
  }
  requestAnimationFrame(cursorLoop);
}

function cursorApply() {
  cursorOn = S.cursor && FINE;
  document.documentElement.classList.toggle('cursor-on', cursorOn);
  if (!cursorOn) { dot.style.opacity = 0; ring.style.opacity = 0; }
}

if (FINE) {
  addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });
  addEventListener('pointerdown', () => { ts = .8; }, { passive: true });
  addEventListener('pointerup', () => { ts = ringHover ? 1.45 : 1; }, { passive: true });
  let ringHover = false;
  addEventListener('pointerover', e => {
    const hit = e.target.closest ? e.target.closest('a, button, input, label, .card, .seg button') : null;
    if (hit !== null && hit !== ringHover) {
      ringHover = !!hit;
      ring.classList.toggle('cur-hover', ringHover);
      ts = ringHover ? 1.45 : 1;
    }
  }, { passive: true });
  document.addEventListener('mouseleave', () => { dot.style.opacity = 0; ring.style.opacity = 0; });
  document.addEventListener('mouseenter', () => { if (cursorOn) { dot.style.opacity = 1; ring.style.opacity = 1; } });
  requestAnimationFrame(cursorLoop);
}

/* ---------------- Render: jogos ---------------- */

const grid = $('#grid');
const emptyMsg = $('#empty');

const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
const ICON_DL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function makeCard(g) {
  const [name, cover, play, dl, tag] = g;
  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.search = norm(name);

  const coverBox = document.createElement('div');
  coverBox.className = 'card-cover';

  const fb = document.createElement('span');
  fb.className = 'card-fallback';
  fb.textContent = name.trim().charAt(0).toUpperCase();
  coverBox.appendChild(fb);

  if (cover) {
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = 'Capa de ' + name;
    img.src = coverURL(cover);
    img.addEventListener('load', () => img.classList.add('loaded'));
    img.addEventListener('error', () => img.remove());
    if (img.complete && img.naturalWidth) img.classList.add('loaded');
    coverBox.appendChild(img);
  }

  if (tag) {
    const t = document.createElement('span');
    t.className = 'card-tag';
    t.textContent = TAG_LABEL[tag] || tag;
    coverBox.appendChild(t);
  }

  const body = document.createElement('div');
  body.className = 'card-body';

  const h3 = document.createElement('h3');
  h3.className = 'card-name';
  h3.textContent = name;

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const bPlay = document.createElement('button');
  bPlay.type = 'button';
  bPlay.className = 'btn btn-play';
  bPlay.dataset.cursor = '';
  bPlay.innerHTML = ICON_PLAY + '<span>Jogar</span>';
  bPlay.setAttribute('aria-label', 'Jogar ' + name + ' (abre em about:blank)');
  bPlay.addEventListener('click', () => {
    if (isWebGame(g)) webHint();
    openInBlank(playURL(g));
  });

  const bDl = document.createElement('button');
  bDl.type = 'button';
  bDl.className = 'btn btn-dl';
  bDl.dataset.cursor = '';
  bDl.innerHTML = ICON_DL + '<span>Baixar</span>';
  bDl.setAttribute('aria-label', 'Baixar ' + name);
  bDl.addEventListener('click', () => downloadGame(name, dl));

  actions.append(bPlay, bDl);
  body.append(h3, actions);
  card.append(coverBox, body);
  return card;
}

let observer = null;
function observeCards() {
  if (observer) observer.disconnect();
  if (S.reduce || !('IntersectionObserver' in window)) {
    grid.querySelectorAll('.card').forEach(c => c.classList.add('in'));
    return;
  }
  observer = new IntersectionObserver(entries => {
    for (const en of entries) {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        observer.unobserve(en.target);
      }
    }
  }, { threshold: .06, rootMargin: '0px 0px -20px 0px' });
  grid.querySelectorAll('.card').forEach(c => observer.observe(c));
}

function renderGames() {
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const g of GAMES) frag.appendChild(makeCard(g));
  grid.appendChild(frag);
  $('#stat-count').textContent = GAMES.length;
  $('#games-count').textContent = GAMES.length + ' jogos — use a busca para encontrar o seu.';
  observeCards();
}

/* ---------------- Render: os 5 links ---------------- */

function renderLinks() {
  const box = $('#links-grid');
  LINKS.forEach((l, i) => {
    const url = W_BASE + l.id;
    const card = document.createElement('div');
    card.className = 'link-card' + (l.ok ? '' : ' off');

    const top = document.createElement('div');
    top.className = 'link-top';
    const nm = document.createElement('span');
    nm.className = 'link-name';
    nm.textContent = 'Link ' + (i + 1);
    const pill = document.createElement('span');
    pill.className = 'pill ' + (l.ok ? 'pill-ok' : 'pill-off');
    pill.innerHTML = '<span class="dot"></span>' + (l.ok ? 'ativo' : 'offline');
    top.append(nm, pill);

    const u = document.createElement('code');
    u.className = 'link-url';
    u.textContent = url;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost';
    btn.dataset.cursor = '';
    btn.textContent = l.ok ? 'Abrir (about:blank)' : 'Tentar abrir';
    btn.addEventListener('click', () => {
      if (!l.ok) toast('Este link respondeu “arquivo não encontrado” — os outros 4 estão ativos. 🔧');
      openInBlank(url);
    });

    card.append(top, u, btn);
    box.appendChild(card);
  });
}

/* ---------------- Busca ---------------- */

let searchTimer = null;
function applySearch(q) {
  const n = norm(q.trim());
  let visible = 0;
  for (const c of grid.children) {
    const show = !n || c.dataset.search.includes(n);
    c.style.display = show ? '' : 'none';
    if (show) visible++;
  }
  emptyMsg.hidden = visible !== 0;
  $('#games-count').textContent = visible + (n ? ' jogo(s) encontrado(s)' : ' jogos — use a busca para encontrar o seu.');
}

/* ---------------- Configurações: UI ---------------- */

const settings = $('#settings');
const btnSettings = $('#btn-settings');

function syncSettingsUI() {
  $('#set-particles').checked = S.particles;
  $('#set-cursor').checked = S.cursor;
  $('#set-reduce').checked = S.reduce;
  document.querySelectorAll('.seg button').forEach(b => {
    b.classList.toggle('active', b.dataset.d === S.density);
  });
}

function openSettings(open) {
  settings.classList.toggle('open', open);
  settings.setAttribute('aria-hidden', String(!open));
  btnSettings.setAttribute('aria-expanded', String(open));
  if (open) $('#settings-close').focus();
}

/* ---------------- Palavra mágica 🤫 ---------------- */

let seq = '';
let lastMagic = 0;
addEventListener('keydown', e => {
  if (!e.key || e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
  seq = (seq + e.key.toLowerCase()).slice(-24);
  if (seq.endsWith('porfavor') || seq.endsWith('por favor')) {
    seq = '';
    const now = Date.now();
    if (now - lastMagic < 8000) return;
    lastMagic = now;
    const w = innerWidth, h = innerHeight;
    burst(w * .5, h * .35, 90);
    burst(w * .2, h * .5, 70);
    burst(w * .8, h * .5, 70);
    toast('✨ Palavra mágica! “Por favor!” — de nada. Divirta-se nos jogos! 🎮', 4200);
  }
});

/* ---------------- Inicialização ---------------- */

function init() {
  /* gradient para a estrela da marca */
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  defs.setAttribute('width', '0');
  defs.setAttribute('height', '0');
  defs.style.position = 'absolute';
  defs.innerHTML = '<defs><linearGradient id="bg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b7cf7"/><stop offset="1" stop-color="#5eead4"/></linearGradient></defs>';
  document.body.appendChild(defs);

  renderGames();
  renderLinks();

  syncSettingsUI();
  document.documentElement.classList.toggle('reduce', S.reduce);
  cursorApply();
  resizeCanvas();
  particlesApply();

  addEventListener('resize', () => { resizeCanvas(); if (S.particles && S.reduce) drawStatic(); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ensureLoop(); });

  /* busca */
  const search = $('#search');
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => applySearch(search.value), 120);
  });

  /* configurações */
  btnSettings.addEventListener('click', () => openSettings(true));
  $('#settings-close').addEventListener('click', () => openSettings(false));
  settings.addEventListener('click', e => { if (e.target === settings) openSettings(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape') openSettings(false); });

  $('#set-particles').addEventListener('change', e => { S.particles = e.target.checked; saveSettings(); particlesApply(); });
  $('#set-cursor').addEventListener('change', e => { S.cursor = e.target.checked; saveSettings(); cursorApply(); });
  $('#set-reduce').addEventListener('change', e => {
    S.reduce = e.target.checked; saveSettings();
    document.documentElement.classList.toggle('reduce', S.reduce);
    particlesApply();
    observeCards();
  });
  document.querySelectorAll('.seg button').forEach(b => {
    b.addEventListener('click', () => {
      S.density = b.dataset.d; saveSettings(); syncSettingsUI(); particlesApply();
    });
  });
  $('#set-reset').addEventListener('click', () => {
    S = { ...DEF }; saveSettings(); syncSettingsUI();
    document.documentElement.classList.toggle('reduce', S.reduce);
    cursorApply(); particlesApply(); observeCards();
    toast('Configurações restauradas. ✨');
  });
}

document.addEventListener('DOMContentLoaded', init);
