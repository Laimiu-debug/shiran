function hashString(str) {
  let h = 2166136261 >>> 0;
  const text = String(str || "");
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createRng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function hexToRgb(hex) {
  const raw = String(hex || "#4f7cff").replace("#", "");
  const v = Number.parseInt(raw.length === 6 ? raw : "4f7cff", 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function cssRgb(rgb, alpha = 1) {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

const SCENE_COLORS = {
  "日常决策": "#ff8c42",
  "社会与群体": "#3aaed8",
  "市场与系统": "#f65d6d",
  "自然与物理": "#46c36f",
  "数学与计算": "#4f7cff",
  "文化与思想实验": "#c46ee8",
};

const TEMPLATE_BY_CATEGORY = {
  "涌现与自组织": "life",
  "生物与生态": "life",
  "物理模拟": "particles",
  "混沌与非线性": "pendulum",
  "博弈与策略": "game",
  "网络与传播": "network",
  "群体心理": "network",
  "概率与统计直觉": "probability",
  "认知偏差": "bias",
  "决策与风险": "bias",
  "经济与金融": "market",
  "优化与搜索": "search",
  "信息论与编码": "wave",
  "日常现象": "flow",
  "中华智慧": "flow",
  "数学趣题": "pattern",
  "艺术与数学": "pattern",
};

function pickTemplate(unit) {
  const mechanism = Array.isArray(unit?.mechanisms) ? unit.mechanisms[0] : "";
  if (mechanism === "博弈") return "game";
  if (mechanism === "随机性") return "probability";
  if (mechanism === "网络传播") return "network";
  if (mechanism === "优化") return "search";
  if (mechanism === "涌现") return "life";
  if (mechanism === "非线性") return "pendulum";
  if (mechanism === "认知偏差") return "bias";
  return TEMPLATE_BY_CATEGORY[unit?.category_legacy] || "flow";
}

function mountShell(ctx, labels) {
  const root = document.createElement("div");
  root.className = "module-sim";
  const canvas = ctx.canvas;
  canvas.className = "module-sim-canvas";
  const controls = document.createElement("div");
  controls.className = "module-sim-controls";
  controls.innerHTML = `
    <button type="button" data-sim-toggle>${labels.pause}</button>
    <button type="button" data-sim-reset>${labels.reset}</button>
    <label class="module-sim-slider">
      <span data-sim-slider-label>${labels.slider}</span>
      <input type="range" min="0" max="100" value="46" data-sim-slider />
    </label>
    <span class="module-sim-readout" data-sim-readout></span>
  `;
  const host = canvas.parentElement;
  host.appendChild(root);
  root.appendChild(canvas);
  root.appendChild(controls);
  return {
    root,
    toggleBtn: controls.querySelector("[data-sim-toggle]"),
    resetBtn: controls.querySelector("[data-sim-reset]"),
    slider: controls.querySelector("[data-sim-slider]"),
    sliderLabel: controls.querySelector("[data-sim-slider-label]"),
    readout: controls.querySelector("[data-sim-readout]"),
  };
}

function sizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(160, Math.floor(rect.width || 320));
  const height = Math.max(120, Math.floor(rect.height || 180));
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function drawBackdrop(g, width, height, rgb) {
  g.fillStyle = "#07111d";
  g.fillRect(0, 0, width, height);
  const glow = g.createRadialGradient(width * 0.5, height * 0.2, 12, width * 0.5, height * 0.55, width * 0.7);
  glow.addColorStop(0, cssRgb(rgb, 0.18));
  glow.addColorStop(1, "rgba(7,17,29,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, width, height);
}

function createLife(state) {
  const cols = 28;
  const rows = 16;
  const cells = new Uint8Array(cols * rows);
  const rng = createRng(state.seed);
  for (let i = 0; i < cells.length; i += 1) cells[i] = rng() > 0.72 ? 1 : 0;
  const at = (x, y) => cells[((y + rows) % rows) * cols + ((x + cols) % cols)];
  return {
    reset() {
      for (let i = 0; i < cells.length; i += 1) cells[i] = rng() > 0.72 ? 1 : 0;
    },
    click(nx, ny) {
      const x = Math.floor(nx * cols);
      const y = Math.floor(ny * rows);
      if (x < 0 || y < 0) return;
      cells[y * cols + x] = cells[y * cols + x] ? 0 : 1;
    },
    step() {
      const next = new Uint8Array(cells.length);
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          let n = 0;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (dx || dy) n += at(x + dx, y + dy);
            }
          }
          const alive = at(x, y);
          next[y * cols + x] = alive ? (n === 2 || n === 3 ? 1 : 0) : (n === 3 ? 1 : 0);
        }
      }
      cells.set(next);
    },
    draw(g, width, height) {
      const cw = width / cols;
      const ch = height / rows;
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          if (!cells[y * cols + x]) continue;
          g.fillStyle = cssRgb(state.rgb, 0.85);
          g.fillRect(x * cw + 0.5, y * ch + 0.5, cw - 1, ch - 1);
        }
      }
    },
  };
}

function createParticles(state) {
  const rng = createRng(state.seed);
  const dots = Array.from({ length: 36 }, () => ({
    x: rng(),
    y: rng(),
    vx: (rng() - 0.5) * 0.004,
    vy: (rng() - 0.5) * 0.004,
  }));
  return {
    reset() {
      dots.forEach((d) => {
        d.x = rng();
        d.y = rng();
        d.vx = (rng() - 0.5) * 0.004;
        d.vy = (rng() - 0.5) * 0.004;
      });
    },
    click(nx, ny) {
      dots.push({ x: nx, y: ny, vx: (rng() - 0.5) * 0.01, vy: (rng() - 0.5) * 0.01 });
      if (dots.length > 80) dots.shift();
    },
    step(param) {
      const pull = 0.0008 + param * 0.004;
      for (const d of dots) {
        d.vx += (0.5 - d.x) * pull;
        d.vy += (0.5 - d.y) * pull;
        d.x += d.vx;
        d.y += d.vy;
        d.vx *= 0.992;
        d.vy *= 0.992;
        if (d.x < 0 || d.x > 1) d.vx *= -1;
        if (d.y < 0 || d.y > 1) d.vy *= -1;
        d.x = clamp(d.x, 0, 1);
        d.y = clamp(d.y, 0, 1);
      }
    },
    draw(g, width, height) {
      g.strokeStyle = cssRgb(state.rgb, 0.18);
      g.beginPath();
      for (let i = 0; i < dots.length - 1; i += 1) {
        g.moveTo(dots[i].x * width, dots[i].y * height);
        g.lineTo(dots[i + 1].x * width, dots[i + 1].y * height);
      }
      g.stroke();
      g.fillStyle = cssRgb(state.rgb, 0.9);
      for (const d of dots) {
        g.beginPath();
        g.arc(d.x * width, d.y * height, 2.4, 0, Math.PI * 2);
        g.fill();
      }
    },
  };
}

function createPendulum(state) {
  let a1 = 1.2;
  let a2 = 2.1;
  let v1 = 0;
  let v2 = 0;
  return {
    reset() {
      a1 = 1.2;
      a2 = 2.1;
      v1 = 0;
      v2 = 0;
    },
    click(nx, ny) {
      a1 = (nx - 0.5) * Math.PI;
      a2 = (ny - 0.5) * Math.PI;
    },
    step(param) {
      const g = 0.8 + param * 1.6;
      const acc1 = -g * 0.04 * Math.sin(a1) + 0.012 * Math.sin(a1 - a2);
      const acc2 = -g * 0.05 * Math.sin(a2) - 0.016 * Math.sin(a1 - a2);
      v1 = (v1 + acc1) * 0.995;
      v2 = (v2 + acc2) * 0.995;
      a1 += v1;
      a2 += v2;
    },
    draw(g, width, height) {
      const cx = width / 2;
      const cy = height * 0.22;
      const l = Math.min(width, height) * 0.28;
      const x1 = cx + Math.sin(a1) * l;
      const y1 = cy + Math.cos(a1) * l;
      const x2 = x1 + Math.sin(a2) * l;
      const y2 = y1 + Math.cos(a2) * l;
      g.strokeStyle = cssRgb(state.rgb, 0.85);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(x1, y1, 4, 0, Math.PI * 2);
      g.arc(x2, y2, 5, 0, Math.PI * 2);
      g.fill();
    },
  };
}

function createGame(state) {
  const rng = createRng(state.seed);
  const n = 18;
  const grid = Array.from({ length: n * n }, () => (rng() > 0.5 ? 1 : 0));
  return {
    reset() {
      for (let i = 0; i < grid.length; i += 1) grid[i] = rng() > 0.5 ? 1 : 0;
    },
    click(nx, ny) {
      const x = Math.floor(nx * n);
      const y = Math.floor(ny * n);
      grid[y * n + x] = grid[y * n + x] ? 0 : 1;
    },
    step(param) {
      const tempt = 1.1 + param * 1.4;
      const next = grid.slice();
      for (let y = 0; y < n; y += 1) {
        for (let x = 0; x < n; x += 1) {
          const self = grid[y * n + x];
          let coop = 0;
          let count = 0;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const nx = (x + dx + n) % n;
              const ny = (y + dy + n) % n;
              coop += grid[ny * n + nx];
              count += 1;
            }
          }
          const payoffC = coop;
          const payoffD = coop * tempt;
          next[y * n + x] = self ? (payoffC >= payoffD * 0.72 ? 1 : 0) : (payoffD > count * 0.55 ? 0 : 1);
        }
      }
      for (let i = 0; i < grid.length; i += 1) grid[i] = next[i];
    },
    draw(g, width, height) {
      const s = Math.min(width, height) / n;
      for (let y = 0; y < n; y += 1) {
        for (let x = 0; x < n; x += 1) {
          g.fillStyle = grid[y * n + x] ? cssRgb(state.rgb, 0.88) : "rgba(255,255,255,0.08)";
          g.fillRect(x * s + 1, y * s + 1, s - 2, s - 2);
        }
      }
    },
  };
}

function createNetwork(state) {
  const rng = createRng(state.seed);
  const nodes = Array.from({ length: 22 }, () => ({ x: rng(), y: rng(), inf: rng() > 0.86 ? 1 : 0 }));
  return {
    reset() {
      nodes.forEach((node) => {
        node.inf = rng() > 0.86 ? 1 : 0;
      });
    },
    click(nx, ny) {
      let best = 0;
      let dist = 99;
      nodes.forEach((node, i) => {
        const d = (node.x - nx) ** 2 + (node.y - ny) ** 2;
        if (d < dist) {
          dist = d;
          best = i;
        }
      });
      nodes[best].inf = nodes[best].inf ? 0 : 1;
    },
    step(param) {
      const rate = 0.04 + param * 0.2;
      const next = nodes.map((node) => node.inf);
      for (let i = 0; i < nodes.length; i += 1) {
        if (nodes[i].inf) continue;
        for (let j = 0; j < nodes.length; j += 1) {
          if (!nodes[j].inf) continue;
          const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
          if (d < 0.28 && rng() < rate) next[i] = 1;
        }
      }
      nodes.forEach((node, i) => {
        node.inf = next[i];
        if (rng() < 0.02) node.inf = 0;
      });
    },
    draw(g, width, height) {
      g.strokeStyle = "rgba(255,255,255,0.12)";
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
          if (d > 0.28) continue;
          g.beginPath();
          g.moveTo(nodes[i].x * width, nodes[i].y * height);
          g.lineTo(nodes[j].x * width, nodes[j].y * height);
          g.stroke();
        }
      }
      for (const node of nodes) {
        g.fillStyle = node.inf ? cssRgb(state.rgb, 0.95) : "rgba(214,235,255,0.45)";
        g.beginPath();
        g.arc(node.x * width, node.y * height, node.inf ? 5 : 3.5, 0, Math.PI * 2);
        g.fill();
      }
    },
  };
}

function createProbability(state) {
  const rng = createRng(state.seed);
  const bins = new Array(12).fill(0);
  let samples = 0;
  const sample = (p) => {
    let v = 0;
    for (let i = 0; i < 11; i += 1) v += rng() < p ? 1 : 0;
    bins[v] += 1;
    samples += 1;
  };
  return {
    reset() {
      bins.fill(0);
      samples = 0;
    },
    click() {
      sample(0.5);
    },
    step(param) {
      sample(0.25 + param * 0.5);
    },
    draw(g, width, height) {
      const max = Math.max(1, ...bins);
      const bw = width / bins.length;
      bins.forEach((count, i) => {
        const h = (count / max) * (height * 0.78);
        g.fillStyle = cssRgb(state.rgb, 0.8);
        g.fillRect(i * bw + 3, height - h - 8, bw - 6, h);
      });
      g.fillStyle = "rgba(214,235,255,0.8)";
      g.font = "12px sans-serif";
      g.fillText(`n=${samples}`, 8, 16);
    },
  };
}

function createBias(state) {
  const rng = createRng(state.seed);
  let a = 0;
  let b = 0;
  return {
    reset() {
      a = 0;
      b = 0;
    },
    click(nx) {
      if (nx < 0.5) a += 1;
      else b += 1;
    },
    step(param) {
      const lossWeight = 1.2 + param * 2.2;
      if (rng() > 0.5) a += rng() < 0.55 ? 1 : 0;
      else b += rng() < (0.55 / lossWeight) ? 1 : 0;
    },
    draw(g, width, height) {
      const total = Math.max(1, a + b);
      const ha = (a / total) * (height * 0.7);
      const hb = (b / total) * (height * 0.7);
      g.fillStyle = cssRgb(state.rgb, 0.9);
      g.fillRect(width * 0.18, height - ha - 16, width * 0.24, ha);
      g.fillStyle = "rgba(255,255,255,0.28)";
      g.fillRect(width * 0.58, height - hb - 16, width * 0.24, hb);
      g.fillStyle = "#d6ebff";
      g.font = "12px sans-serif";
      g.fillText(`A ${a}`, width * 0.18, height - 4);
      g.fillText(`B ${b}`, width * 0.58, height - 4);
    },
  };
}

function createMarket(state) {
  const rng = createRng(state.seed);
  const prices = [1];
  return {
    reset() {
      prices.length = 0;
      prices.push(1);
    },
    click() {
      const last = prices[prices.length - 1];
      prices.push(Math.max(0.05, last * (1 + (rng() - 0.48) * 0.12)));
      if (prices.length > 80) prices.shift();
    },
    step(param) {
      const vol = 0.02 + param * 0.08;
      const last = prices[prices.length - 1];
      prices.push(Math.max(0.05, last * (1 + (rng() - 0.5) * vol)));
      if (prices.length > 80) prices.shift();
    },
    draw(g, width, height) {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const span = Math.max(0.01, max - min);
      g.strokeStyle = cssRgb(state.rgb, 0.95);
      g.beginPath();
      prices.forEach((price, i) => {
        const x = (i / Math.max(1, prices.length - 1)) * width;
        const y = height - ((price - min) / span) * (height * 0.8) - 10;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.stroke();
    },
  };
}

function createSearch(state) {
  const rng = createRng(state.seed);
  const agents = Array.from({ length: 14 }, () => ({ x: rng(), y: rng() }));
  const peak = { x: 0.35 + (state.seed % 40) / 100, y: 0.4 };
  return {
    reset() {
      agents.forEach((agent) => {
        agent.x = rng();
        agent.y = rng();
      });
    },
    click(nx, ny) {
      peak.x = nx;
      peak.y = ny;
    },
    step(param) {
      const step = 0.01 + param * 0.04;
      for (const agent of agents) {
        agent.x += (peak.x - agent.x) * step + (rng() - 0.5) * 0.02;
        agent.y += (peak.y - agent.y) * step + (rng() - 0.5) * 0.02;
        agent.x = clamp(agent.x, 0, 1);
        agent.y = clamp(agent.y, 0, 1);
      }
    },
    draw(g, width, height) {
      g.fillStyle = cssRgb(state.rgb, 0.18);
      g.beginPath();
      g.arc(peak.x * width, peak.y * height, 22, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = cssRgb(state.rgb, 0.95);
      for (const agent of agents) {
        g.fillRect(agent.x * width - 2, agent.y * height - 2, 4, 4);
      }
    },
  };
}

function createWave(state) {
  const rng = createRng(state.seed);
  let bits = Array.from({ length: 24 }, () => (rng() > 0.5 ? 1 : 0));
  return {
    reset() {
      bits = Array.from({ length: 24 }, () => (rng() > 0.5 ? 1 : 0));
    },
    click(nx) {
      const i = Math.floor(nx * bits.length);
      bits[i] = bits[i] ? 0 : 1;
    },
    step(param) {
      const noise = param * 0.35;
      bits = bits.map((bit) => (rng() < noise ? 1 - bit : bit));
    },
    draw(g, width, height) {
      const bw = width / bits.length;
      bits.forEach((bit, i) => {
        g.fillStyle = bit ? cssRgb(state.rgb, 0.9) : "rgba(255,255,255,0.08)";
        g.fillRect(i * bw + 2, height * 0.28, bw - 4, height * 0.44);
      });
    },
  };
}

function createFlow(state) {
  let level = 0.35;
  return {
    reset() {
      level = 0.35;
    },
    click(ny) {
      level = 1 - ny;
    },
    step(param) {
      const inflow = 0.01 + param * 0.03;
      const outflow = 0.018;
      level = clamp(level + inflow - outflow, 0.02, 0.98);
    },
    draw(g, width, height) {
      g.fillStyle = cssRgb(state.rgb, 0.8);
      const h = height * level;
      g.fillRect(width * 0.22, height - h, width * 0.56, h);
      g.strokeStyle = "rgba(214,235,255,0.35)";
      g.strokeRect(width * 0.22, height * 0.08, width * 0.56, height * 0.84);
    },
  };
}

function createPattern(state) {
  let k = 3 + (state.seed % 5);
  return {
    reset() {
      k = 3 + (state.seed % 5);
    },
    click(nx) {
      k = 2 + nx * 10;
    },
    step(param) {
      k = 2 + param * 10;
    },
    draw(g, width, height) {
      const cx = width / 2;
      const cy = height / 2;
      const r0 = Math.min(width, height) * 0.38;
      g.strokeStyle = cssRgb(state.rgb, 0.9);
      g.beginPath();
      for (let i = 0; i <= 360; i += 1) {
        const t = (i / 360) * Math.PI * 2;
        const r = r0 * Math.cos(k * t);
        const x = cx + r * Math.cos(t);
        const y = cy + r * Math.sin(t);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    },
  };
}

const FACTORIES = {
  life: createLife,
  particles: createParticles,
  pendulum: createPendulum,
  game: createGame,
  network: createNetwork,
  probability: createProbability,
  bias: createBias,
  market: createMarket,
  search: createSearch,
  wave: createWave,
  flow: createFlow,
  pattern: createPattern,
};

const SLIDER_LABELS = {
  life: "密度节奏",
  particles: "向心力",
  pendulum: "重力",
  game: "背叛诱惑",
  network: "传播率",
  probability: "成功概率",
  bias: "损失权重",
  market: "波动",
  search: "步长",
  wave: "噪声",
  flow: "流入",
  pattern: "花瓣数",
};

export function createUnitModule(ctx) {
  const unit = ctx.unit || {};
  const template = pickTemplate(unit);
  const rgb = hexToRgb(SCENE_COLORS[unit.scene] || "#4f7cff");
  const seed = hashString(unit.id || unit.title || template);
  const simState = { seed, rgb, template, unit };
  const model = (FACTORIES[template] || createFlow)(simState);
  const lang = ctx.lang === "en" ? "en" : "zh";
  const labels = {
    pause: lang === "en" ? "Pause" : "暂停",
    play: lang === "en" ? "Play" : "继续",
    reset: lang === "en" ? "Reset" : "重置",
    slider: SLIDER_LABELS[template] || "参数",
  };

  let running = true;
  let raf = 0;
  let acc = 0;
  let last = 0;
  let param = 0.46;
  let shell = null;
  let sized = { ctx: null, width: 0, height: 0 };

  const onPointer = (ev) => {
    const rect = ctx.canvas.getBoundingClientRect();
    const nx = (ev.clientX - rect.left) / Math.max(1, rect.width);
    const ny = (ev.clientY - rect.top) / Math.max(1, rect.height);
    model.click?.(clamp(nx, 0, 1), clamp(ny, 0, 1));
    ctx.emit?.("module_param_change", { template, nx, ny });
  };

  const loop = (ts) => {
    if (!sized.ctx) {
      raf = requestAnimationFrame(loop);
      return;
    }
    const dt = last ? ts - last : 16;
    last = ts;
    if (running) {
      acc += dt;
      const interval = 80 + (1 - param) * 140;
      while (acc >= interval) {
        model.step(param);
        acc -= interval;
        ctx.clock && ctx.emit?.("module_tick", { template });
      }
    }
    drawBackdrop(sized.ctx, sized.width, sized.height, rgb);
    model.draw(sized.ctx, sized.width, sized.height);
    raf = requestAnimationFrame(loop);
  };

  return {
    mount() {
      shell = mountShell(ctx, labels);
      sized = sizeCanvas(ctx.canvas);
      shell.slider.value = String(Math.round(param * 100));
      shell.sliderLabel.textContent = labels.slider;
      shell.readout.textContent = unit.title || "";
      shell.toggleBtn.addEventListener("click", () => {
        running = !running;
        shell.toggleBtn.textContent = running ? labels.pause : labels.play;
      });
      shell.resetBtn.addEventListener("click", () => {
        model.reset();
        ctx.emit?.("module_reset", { template });
      });
      shell.slider.addEventListener("input", () => {
        param = Number(shell.slider.value) / 100;
      });
      ctx.canvas.addEventListener("pointerdown", onPointer);
      raf = requestAnimationFrame(loop);
      ctx.emit?.("module_enter", { template, unit_id: unit.id });
    },
    tick() {},
    pause() {
      running = false;
    },
    resume() {
      running = true;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ctx.canvas.removeEventListener("pointerdown", onPointer);
      shell?.root?.remove();
    },
  };
}
