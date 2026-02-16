export class LifeEngine {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.size = width * height;

    this.currentAlive = new Uint8Array(this.size);
    this.nextAlive = new Uint8Array(this.size);
    this.currentOwner = new Int32Array(this.size);
    this.nextOwner = new Int32Array(this.size);

    this.currentOwner.fill(-1);
    this.nextOwner.fill(-1);
  }

  index(x, y) {
    return y * this.width + x;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  setCell(x, y, alive, ownerId = -1) {
    if (!this.inBounds(x, y)) return;
    const i = this.index(x, y);
    this.currentAlive[i] = alive ? 1 : 0;
    this.currentOwner[i] = alive ? ownerId : -1;
  }

  seedCluster(cells, ownerId) {
    for (const cell of cells) {
      this.setCell(cell.x, cell.y, true, ownerId);
    }
  }

  countNeighbors(x, y) {
    let aliveCount = 0;
    const ownerCounter = new Map();

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;

        const ni = this.index(nx, ny);
        if (this.currentAlive[ni] === 1) {
          aliveCount += 1;
          const owner = this.currentOwner[ni];
          if (owner >= 0) {
            ownerCounter.set(owner, (ownerCounter.get(owner) || 0) + 1);
          }
        }
      }
    }

    return { aliveCount, ownerCounter };
  }

  pickMajorityOwner(ownerCounter) {
    let bestOwner = -1;
    let bestCount = -1;

    for (const [owner, count] of ownerCounter.entries()) {
      if (count > bestCount) {
        bestCount = count;
        bestOwner = owner;
      }
    }

    return bestOwner;
  }

  computeNextGeneration() {
    this.nextOwner.fill(-1);

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const i = this.index(x, y);
        const isAlive = this.currentAlive[i] === 1;
        const { aliveCount, ownerCounter } = this.countNeighbors(x, y);

        let nextAlive = 0;
        let nextOwner = -1;

        if (isAlive) {
          if (aliveCount === 2 || aliveCount === 3) {
            nextAlive = 1;
            nextOwner = this.currentOwner[i];
          }
        } else if (aliveCount === 3) {
          nextAlive = 1;
          nextOwner = this.pickMajorityOwner(ownerCounter);
        }

        this.nextAlive[i] = nextAlive;
        this.nextOwner[i] = nextAlive ? nextOwner : -1;
      }
    }
  }

  commitNextGeneration() {
    this.currentAlive.set(this.nextAlive);
    this.currentOwner.set(this.nextOwner);
  }

  getVisibleCellOwner(x, y, progress) {
    if (!this.inBounds(x, y)) return -1;
    const i = this.index(x, y);

    const cur = this.currentAlive[i] === 1;
    const next = this.nextAlive[i] === 1;

    if (cur && next) return this.currentOwner[i];
    if (cur && !next) return progress < 0.5 ? this.currentOwner[i] : -1;
    if (!cur && next) return progress >= 0.5 ? this.nextOwner[i] : -1;

    return -1;
  }

  getVisibleCellAlpha(x, y, progress) {
    if (!this.inBounds(x, y)) return 0;
    const i = this.index(x, y);

    const cur = this.currentAlive[i] === 1;
    const next = this.nextAlive[i] === 1;

    if (cur && next) return 1;
    if (cur && !next) return 1 - progress;
    if (!cur && next) return progress;

    return 0;
  }

  computeOwnerCentroids(progress = 0.5) {
    const sums = new Map();

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const alpha = this.getVisibleCellAlpha(x, y, progress);
        if (alpha < 0.15) continue;

        const owner = this.getVisibleCellOwner(x, y, progress);
        if (owner < 0) continue;

        if (!sums.has(owner)) {
          sums.set(owner, { sx: 0, sy: 0, c: 0 });
        }

        const s = sums.get(owner);
        s.sx += x;
        s.sy += y;
        s.c += 1;
      }
    }

    const centroids = new Map();
    for (const [owner, s] of sums.entries()) {
      centroids.set(owner, {
        x: s.sx / s.c,
        y: s.sy / s.c,
        cells: s.c,
      });
    }

    return centroids;
  }
}
