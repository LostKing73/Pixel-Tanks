class Block {
  init(x, y, health, type, team, host) {
    this.x = x;
    this.y = y;
    this.maxHp = this.hp = health;
    this.type = type;
    this.host = host;
    this.team = team;
    this.raw = {};
    this.id = Math.random();
    this.s = false;
    this.c = !['fire', 'airstrike'].includes(type);
    if (type === 'fire' || type === 'airstrike') this.sd = setTimeout(() => this.destroy(), type === 'fire' ? 2500 : 6000);
    if (type === 'airstrike') {
      for (let i = 0; i < 80; i++) setTimeout(() => {
        if (this.host.b.includes(this)) this.host.d.push(new Damage(this.x + Math.floor(Math.random()*250)-50, this.y + Math.floor(Math.random()*250)-50, 100, 100, 50, this.team, this.host));
      }, 5000+Math.random()*500);
    }
    this.cells = new Set();
    let dx = this.x/100, dy = this.y/100;
    for (let i = 0; i < 4; i++) {
      const cx = Math.max(0, Math.min(29, Math.floor(i < 2 ? dx : dx + .99))), cy = Math.max(0, Math.min(29, Math.floor(i % 2 === 0 ? dy : dy + .99)));
      host.cells[cx][cy].add(this);
      this.cells.add(cx+'x'+cy);
    }
    if (this.x % 100 === 0 && this.y % 100 === 0 && this.x >= 0 && this.x <= 2900 && this.y >= 0 && this.y <= 2900) host.map.setWalkableAt(Math.floor(dx), Math.floor(dy), false);
    this.u();
    return this;
  }

  u() {
    this.updatedLast = Date.now();
    for (const property of ['x', 'y', 'maxHp', 'hp', 'type', 's', 'team', 'id']) this.raw[property] = this[property];
  }

  damage(d) {
    if (this.hp === Infinity) return;
    this.hp = Math.min(this.maxHp, Math.max(this.hp-d, 0));
    this.s = true;
    clearTimeout(this.bar);
    this.bar = setTimeout(() => {
      this.s = false;
      this.u();
    }, 3000);
    this.u();
    if (this.hp === 0) this.destroy();
  }

  reset() {
    for (const property of ['x', 'y', 'maxHp', 'hp', 'type', 'host', 'team', 'raw', 'id', 's' ,'c', 'cells', 'updatedLast']) this[property] = undefined;
  }

  destroy() {
    clearTimeout(this.sd);
    clearTimeout(this.bar);
    this.host.b.splice(this.host.b.indexOf(this), 1);
    for (const cell of this.cells) {
      const [x, y] = cell.split('x');
      this.host.cells[x][y].delete(this);
      let deletePathfindGrid = this.x % 100 === 0 && this.y % 100 === 0;
      for (const e of this.host.cells[x][y]) if (e instanceof Block && e.x % 100 === 0 && e.y % 100 === 0) deletePathfindGrid = false;
      if (deletePathfindGrid) this.host.map.setWalkableAt(x, y, true);
    }
    this.release();
  }
}
