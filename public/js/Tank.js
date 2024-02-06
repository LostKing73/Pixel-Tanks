const PF = require('pathfinding');class Engine {
  constructor(levels) {
    if (!A.templates.Block) {
      A.createTemplate('Block', Block);
      A.createTemplate('Shot', Shot);
      A.createTemplate('Damage', Damage);
      A.createTemplate('AI', AI);
      A.createTemplate('arr', Array, a => (a.length = 0)); // batch size of 100, will inc upon higher demand. Startup value may vary depending on use case.
      A.createTemplate('set', Set, s => s.clear());
      //A.createTemplate('Tank', Tank); ...players aren't created or destroyed often enough for this to really matter
    }
    this.spawn = {x: 0, y: 0};
    this.spawns = [{x: 0, y: 0}, {x: 0, y: 0}];
    for (const property of ['ai', 's', 'pt', 'b', 'd', 'i', 'logs', 'cells']) this[property] = [];
    this.cells = [];
    for (let y = 0; y < 30; y++) {
      this.cells[y] = [];
      for (let x = 0; x < 30; x++) this.cells[y][x] = new Set();
    }
    this.map = new PF.Grid(30, 30);
    this.levelReader(levels[Math.floor(Math.random()*levels.length)]);
    this.i.push(setInterval(() => this.tick(), 1000/60));
  }

  add(data) {
    this.pt.push(new Tank(data, this));
  }

  useAbility(t, a) {
    if (a === 'dynamite') {
      for (let i = this.s.length-1; i >= 0; i--) {
        const s = this.s[i];
        if (Engine.getUsername(s.team) !== t.username || s.type !== 'dynamite') continue;
        this.d.push(new Damage(s.x-50, s.y-50, 100, 100, 100, s.team, this));
        s.destroy();
      }
    } else if (a === 'toolkit') {
      if (t.healTimeout !== undefined) {
        clearTimeout(t.healTimeout);
        t.healTimeout = undefined;
      } else {
        t.healTimeout = setTimeout(() => {
          t.hp = t.maxHp;
          t.healTimeout = undefined;
        }, 7500);
       }
    } else if (a === 'tape') {
      t.hp = Math.min(t.maxHp, t.hp+t.maxHp/4);
    } else if (a === 'glu') {
      clearInterval(t.gluInterval);
      clearTimeout(t.gluTimeout);
      t.gluInterval = setInterval(() => {
        t.hp = Math.min(t.maxHp, t.hp+.5);
      }, 15);
      t.gluTimeout = setTimeout(() => clearInterval(t.gluInterval), 5000);
    } else if (a.includes('block#')) {
      const coords = [{ r: [337.5, 360], dx: -10, dy: 80 }, { r: [0, 22.5], dx: -10, dy: 80 }, { r: [22.5, 67.5], dx: -100, dy: 80 }, { r: [67.5, 112.5], dx: -100, dy: -10 }, { r: [112.5, 157.5], dx: -100, dy: -100 }, { r: [157.5, 202.5], dx: -10, dy: -100 }, { r: [202.5, 247.5], dx: 80, dy: -100 }, { r: [247.5, 292.5], dx: 80, dy: -10 }, { r: [292.5, 337.5], dx: 80, dy: 80 }];
      const type = a.replace('block#', '');
      for (const coord of coords) {
        if (t.r >= coord.r[0] && t.r < coord.r[1]) {
          this.b.push(A.template('Block').init(t.x+coord.dx, t.y+coord.dy, {strong: 200, weak: 100, gold: 300, spike: 100}[type], type, t.team, this));
          break;
        }
      }
    } else if (a === 'flashbang') {
      for (const t of this.pt) {
        t.flashbanged = true;
        t.flashbangTimeout = setTimeout(() => {t.flashbanged = false}, 10);
      }
    } else if (a === 'break') {
      for (const cell of t.cells) {
        const c = cell.split('x'), cx = c[0], cy = c[1], breakable = ['gold', 'weak', 'strong', 'spike', 'barrier', 'void'];
        for (const entity of this.cells[cx][cy]) if (entity instanceof Block && Engine.collision(t.x, t.y, 80, 80, entity.x, entity.y, 100, 100) && breakable.includes(entity.type)) entity.destroy();
      }
    } else if (a === 'bomb') {
      if (t.grapple) {
        t.grapple.bullet.destroy();
        t.grapple = false;
      }
      const hx = Math.floor(t.x/100), hy = Math.floor(t.y/100);
      for (let i = Math.max(0, hx-1); i <= Math.min(29, hx+1); i++) for (let l = Math.max(0, hy-1); l <= Math.min(29, hy+1); l++) {
        for (const entity of this.cells[i][l]) {
          if (entity instanceof Block) {
            if (Engine.getTeam(entity.team) !== Engine.getTeam(t.team)) {
              entity.damage(150);
            }
          } else if (entity instanceof Shot) {
            if (Engine.getTeam(entity.team) !== Engine.getTeam(t.team) && (entity.type === 'dynamite' || entity.type === 'usb')) {
              entity.destroy();
            }
          }
        }
      }
      this.d.push(new Damage(t.x, t.y, 80, 80, 50, t.team, this));
    } else if (a === 'turret') {
      this.ai.push(new AI(Math.floor(t.x / 100) * 100 + 10, Math.floor(t.y / 100) * 100 + 10, 0, t.rank, t.team, this));
      for (let i = this.ai.length-1, turrets = 0; i >= 0; i--) if (this.ai[i].role === 0 && Engine.getUsername(this.ai[i].team) === t.username && ++turrets > 3) this.ai[i].destroy();
    } else if (a === 'bash') {
      t.buff = true; // name fix
      setTimeout(() => { t.buff = false }, 1000);
    } else if (a === 'shield') {
      t.shields = 100;
    } else if (a === 'reflector') {
      t.reflect = true;
      setTimeout(() => {
        t.reflect = false;
      }, 500);
    } else if (a.includes('airstrike')) {
      const h = a.replace('airstrike', '').split('x');
      this.b.push(A.template('Block').init(Number(h[0]), Number(h[1]), Infinity, 'airstrike', Engine.parseTeamExtras(t.team), this));
    } else if (a === 'healwave') {
      let allies = [];
      for (const tank of this.pt) if (Engine.getTeam(tank.team) === Engine.getTeam(t.team) && (tank.x-t.x)**2+(tank.y-t.y)**2 < 90000 && t.id !== tank.id) allies.push(tank);
      for (const ai of this.ai) if (Engine.getTeam(ai.team) === Engine.getTeam(t.team) && (ai.x-t.x)**2+(ai.y-t.y)**2 < 90000 && t.id !== ai.id) allies.push(ai);
      for (const fren of allies) fren.hp += (fren.maxHp-fren.hp)/(2*Math.max(1, allies.length));
    }
  }

  update(data) {
    const t = this.pt.find(t => t.username === data.username);
    if (!t) return;
    data = data.data;
    const {emote, r, baseFrame, use, x, y, fire} = data;
    t.baseRotation = data.baseRotation;
    t.immune = data.immune;
    t.animation = data.animation;
    t.emote = emote;
    if (t.canInvis) t.invis = data.invis;
    t.baseFrame = data.baseFrame;
    if (!t.grapple) {
      t.x = x;
      t.y = y;
      t.updateCell();
    }
    t.r = r;
    if (use.includes('respawn')) {
      t.socket.send({event: 'ded'});
      t.socket.send({event: 'override', data: [{key: 'x', value: this.spawn.x}, {key: 'y', value: this.spawn.y}]});
      t.x = this.spawn.x;
      t.y = this.spawn.y;
      t.ded = false;
      t.hp = t.maxHp;
    }
    if (t.ded) return;
    if (t.immune && t.class === 'fire') {
      for (const cell of t.cells) {
        const [cx, cy] = cell.split('x');
        let hasFire = false;
        for (const entity of this.cells[cx][cy]) if (entity instanceof Block && entity.type === 'fire' && Engine.getUsername(entity.team) === t.username && entity.x/100 === cx && entity.y/100 === cy) hasFire = true;
        if (!hasFire) this.b.push(A.template('Block').init(cx*100, cy*100, 100, 'fire', Engine.parseTeamExtras(t.team), this));
      }
    }
    for (const exe of use) this.useAbility(t, exe);
    if (fire.length) {
      t.canInvis = t.invis = false;
      setTimeout(() => {t.canInvis = true}, 100);
      t.pushback = -6;
      for (const s of fire) this.s.push(new Shot(t.x + 40, t.y + 40, s.x, s.y, s.type, s.r, Engine.parseTeamExtras(t.team), t.rank, this));
    }
  }

  tick() {
    this.ontick();
    for (const s of this.s) s.update();
    for (let i = this.ai.length-1; i >= 0; i--) this.ai[i].update();
    for (const t of this.pt) t.update();
  }

  levelReader(level) {
    for (let i = this.b.length-1; i >= 0; i--) this.b[i].destroy();
    const key = {'B5': ['void', Infinity], 'B4': ['barrier', Infinity], 'B3': ['gold', 300], 'B2': ['strong', 200], 'B1': ['weak', 100]};
    for (let l = 0; l < level.length; l++) {
      for (let q = 0; q < level[l].length; q++) {
        const e = level[l][q];
        if (e === 'S') {
          this.spawn = { x: q * 100, y: l * 100 };
        } else if (e === 'A') {
          this.spawns[0] = {x: q*100, y: l*100};
        } else if (e === 'B') {
          this.spawns[1] = {x: q*100, y: l*100};
        } else if (e.split('')[0] === 'A' && e.split('').length === 2) {
          this.ai.push(new AI(q*100+10, l*100+10, Number(e.split('')[1]), 0/*rank*/, 'squad', this));
        } else if (key[e]) {
          this.b.push(A.template('Block').init(q*100, l*100, key[e][1], key[e][0], ':', this));
        }
      }
    }
  }

  static getRandomColor() {
    let letters = '0123456789ABCDEF', color = '#';
    for (var i = 0; i < 6; i++) color += letters[Math.floor(Math.random() * 16)];
    return color;
  }

  static finder = new PF.AStarFinder({allowDiagonal: true, dontCrossCorners: true});

  static pathfind(sx, sy, tx, ty, map) {
    return Engine.finder.findPath(sx, sy, tx, ty, map);
  }

  static raycast(x1, y1, x2, y2, walls) {
    const dx = x1-x2, dy = y1-y2, adx = Math.abs(dx), ady = Math.abs(dy), minx = Math.min(x1, x2), miny = Math.min(y1, y2), maxx = Math.max(x1, x2), maxy = Math.max(y1, y2), px = [], py = [];
    walls = walls.filter(({x, y, type}) => {
      if (!['void', 'barrier', 'strong', 'weak', 'gold'].includes(type)) return;
      if (Engine.collision(x, y, 100, 100, minx, miny, adx, ady)) {
        if (Engine.collision(x, y, 100, 100, x1-1, y1-1, 2, 2) || Engine.collision(x, y, 100, 100, x2-1, y2-1, 2, 2)) return false;
        const xw = x + 100, yw = y + 100;
        if (x >= minx && x <= maxx) px.push(x);
        if (xw >= minx && xw <= maxx) px.push(xw);
        if (y >= miny && y <= maxy) py.push(y);
        if (xw >= miny && yw <= maxy) py.push(yw);
        return true;
      }
      return false;
    });
    if (dx === 0) {
      for (const p of py) for (const {x, y} of walls) if (Engine.collision(x, y, 100, 100, x1-.5, p-.5, 1, 1)) return false;
    } else {
      const s = dy/dx, o = y1-s*x1;
      for (const {x, y} of walls) {
        for (const p of py) if (Engine.collision(x, y, 100, 100, (p-o)/s-1, p-1, 2, 2)) return false;
        for (const p of px) if (Engine.collision(x, y, 100, 100, p-1, s*p+o-1, 2, 2)) return false;
      }
    }
    return true;
  }
  
  static parseTeamExtras = s => s.replace('@leader', '').split('@requestor#')[0];
  static getUsername = s => Engine.parseTeamExtras(s).split(':')[0];
  static getTeam = s => Engine.parseTeamExtras(s).split(':')[1];
  static collision = (x, y, w, h, x2, y2, w2, h2) => (x + w > x2 && x < x2 + w2 && y + h > y2 && y < y2 + h2);
  static toAngle = (x, y) => (-Math.atan2(x, y)*180/Math.PI+360)%360;
  static toPoint = angle => {
    const theta = (-angle) * Math.PI / 180, y = Math.cos(theta), x = Math.sin(theta);
    return x === 0 ? {x, y: y/Math.abs(y)} : {x: x/Math.abs(x), y: y/Math.abs(x)}
  }
}
if (module) module.exports = Engine;
class Tank {
  constructor(data, host) {
    this.raw = {};
    this.render = {release: () => {}, b: new Set(), pt: new Set(), ai: new Set(), s: new Set(), d: new Set()};
    ['rank', 'username', 'cosmetic', 'cosmetic_hat', 'cosmetic_body', 'color', 'damage', 'maxHp', 'hp', 'shields', 'team', 'x', 'y', 'r', 'ded', 'reflect', 'pushback', 'baseRotation', 'baseFrame', 'fire', 'damage', 'animation', 'buff', 'invis', 'id', 'class', 'flashbanged', 'dedEffect'].forEach(p => {
      Object.defineProperty(this, p, {
        get() {
          return this.raw[p];
        },
        set(v) {
          this.setValue(p, v);
        },
        configurable: true,
      });
    });
    this.id = Math.random();
    if (data.socket) this.socket = data.socket;
    this.username = data.username;
    this.rank = data.rank;
    this.class = data.class;
    this.cosmetic = data.cosmetic;
    this.cosmetic_hat = data.cosmetic_hat;
    this.cosmetic_body = data.cosmetic_body;
    this.deathEffect = data.deathEffect;
    this.color = data.color;
    this.fire = this.damage = false;
    this.hp = this.maxHp = this.rank*10+300;
    this.canBashed = this.canInvis = true;
    this.team = data.username+':'+Math.random();
    this.x = host.spawn.x;
    this.y = host.spawn.y;
    this.shields = this.r = this.pushback = this.baseRotation = this.baseFrame = this.lastUpdate = 0;
    this.host = host;
    this.privateLogs = [];
    this.cells = new Set();
    for (let dx = this.x/100, dy = this.y/100, i = 0; i < 4; i++) {
      const cx = Math.max(0, Math.min(29, Math.floor(i < 2 ? dx : dx + .79))), cy = Math.max(0, Math.min(29, Math.floor(i % 2 ? dy : dy + .79)));
      host.cells[cx][cy].add(this);
      this.cells.add(cx+'x'+cy);
    }
    host.override(this);
  }

  setValue(p, v) {
    this.updatedLast = Date.now();
    this.raw[p] = v;
  }

  updateCell() {
    const cells = new Set();
    for (let dx = this.x/100, dy = this.y/100, i = 0; i < 4; i++) {
      const cx = Math.max(0, Math.min(29, Math.floor(i < 2 ? dx : dx + .79))), cy = Math.max(0, Math.min(29, Math.floor(i % 2 ? dy : dy + .79)));
      this.host.cells[cx][cy].add(this);
      cells.add(`${cx}x${cy}`);
    }
    for (const cell of [...this.cells].filter(c => !cells.has(c))) {
      const [x, y] = cell.split('x');
      this.host.cells[x][y].delete(this);
    }
    this.cells = cells;
  }

  update() {
    const team = Engine.getTeam(this.team);
    if (this.dedEffect) {
      this.dedEffect.time = Date.now() - this.dedEffect.start;
      this.setValue('dedEffect', this.dedEffect); // REMOVE THIS TEMPORARY
    }
    if (this.pushback !== 0) this.pushback += 0.5;
    if (this.fire && Engine.getTeam(this.fire.team) !== Engine.getTeam(this.team)) this.damageCalc(this.x, this.y, .25, Engine.getUsername(this.fire.team));
    if (this.damage) this.damage.y--;
    if (this.grapple) this.grappleCalc();
    if (this.reflect) {
      const hx = Math.floor((this.x+40)/100), hy = Math.floor((this.y+40)/100);
      for (let i = Math.max(0, hx-2); i <= Math.min(29, hx+2); i++) for (let l = Math.max(0, hy-2); l <= Math.min(29, hy+2); l++) {
        for (const entity of this.host.cells[i][l]) {
          if (entity instanceof Shot) {
            if (entity.target) return;
            const xd = entity.x-(this.x+40), yd = entity.y-(this.y+40), td = Math.sqrt(xd**2+yd**2);
            const aspectRatio = 6/td;
            if (td > 150) continue;
            entity.e = Date.now();
            entity.sx = entity.x;
            entity.sy = entity.y;
            entity.xm = xd*aspectRatio;
            entity.ym = yd*aspectRatio;
            entity.r = Engine.toAngle(xd, yd);
            if (entity.type !== 'grapple') entity.team = this.team;
          }
        }
      }
    }
    let spikeLimiter = true;
    for (const cell of this.cells) {
      const [x, y] = cell.split('x');
      for (const entity of this.host.cells[x][y]) {
        const teamMatch = team === Engine.getTeam(entity.team);
        if (entity instanceof Block) {
          if (!this.ded && !this.immune && Engine.collision(this.x, this.y, 80, 80, entity.x, entity.y, 100, 100)) {
            if (entity.type === 'fire') {
              if (this.fire) {
                clearTimeout(this.fireTimeout);
                this.fire = {team: entity.team, frame: this.fire.frame};
              } else {
                this.fire = {team: entity.team, frame: 0};
                this.fireInterval ??= setInterval(() => this.fire.frame ^= 1, 50);
              }
              this.fireTimeout = setTimeout(() => {
                clearInterval(this.fireInterval);
                this.fire = false;
              }, 4000);
            } else if (entity.type === 'spike' && !teamMatch && spikeLimiter !== undefined) spikeLimiter = this.damageCalc(this.x, this.y, 1, Engine.getUsername(entity.team));
          }
        } else if (entity instanceof Tank || entity instanceof AI) {
          if (entity.buff && !this.ded && !this.immune && this.canBashed && Engine.getTeam(entity.team) !== Engine.getTeam(this.team) && Engine.collision(this.x, this.y, 80, 80, entity.x, entity.y, 80, 80)) {
            this.canBashed = false;
            setTimeout(() => {this.canBashed = true}, 1000);
            this.damageCalc(this.x, this.y, 100, Engine.getUsername(entity.team));
          }
        }
      }
    }
  }

  damageCalc(x, y, a, u) {
    if ((this.immune && a > 0) || this.ded || this.reflect) return;
    const hx = Math.floor((this.x+40)/100), hy = Math.floor((this.y+40)/100);
    for (let i = Math.max(0, hx-1); i <= Math.min(29, hx+1); i++) for (let l = Math.max(0, hy-1); l <= Math.min(29, hy+1); l++) for (const entity of this.host.cells[i][l]) {
      if (entity instanceof Shot) if (entity.target) if (entity.target.id === this.id && entity.type === 'usb') a = Math.max(0, a+Math.min(Math.abs(a)/4, 5)*(Engine.getTeam(entity.team) === Engine.getTeam(this.team) ? -1 : 1));
    }
    if (this.shields > 0 && a > 0) return this.shields -= a;
    this.hp = Math.max(Math.min(this.maxHp, this.hp-a), 0);
    clearTimeout(this.damageTimeout);
    this.damageTimeout = setTimeout(() => {this.damage = false}, 1000);
    this.damage = {d: (this.damage ? this.damage.d : 0)+a, x, y};
    if (this.hp <= 0 && this.host.ondeath) this.host.ondeath(this, this.host.pt.concat(this.host.ai).find(t => t.username === u));
  }

  grappleCalc() {
    const dx = this.grapple.target.x - this.x, dy = this.grapple.target.y - this.y;
    if (dx ** 2 + dy ** 2 > 400) {
      const angle = Math.atan2(dy, dx);
      const mx = Math.round(Math.cos(angle) * 5)*4;
      const my = Math.round(Math.sin(angle) * 5)*4;
      if (this.collision(this.x+mx, this.y)) this.x += mx;
      if (this.collision(this.x, this.y+my)) this.y += my;
      this.grapple.bullet.sx = this.x+40;
      this.grapple.bullet.sy = this.y+40;
      this.host.override(this, [{ key: 'x', value: this.x }, { key: 'y', value: this.y }]);
      if ((!this.collision(this.x+mx, this.y) || Math.abs(mx) < 2) && (!this.collision(this.x, this.y+my) || Math.abs(my) < 2)) {
        this.grapple.bullet.destroy();
        this.grapple = false;
        this.x = Math.floor(this.x/4)*4;
        this.y = Math.floor(this.y/4)*4
      }
    } else {
      this.grapple.bullet.destroy();
      this.grapple = false;
      this.x = Math.floor(this.x/4)*4;
      this.y = Math.floor(this.y/4)*4
    }
    this.updateCell();
  }

  collision(x, y) {
    if (x < 0 || y < 0 || x + 80 > 3000 || y + 80 > 3000) return false;
    for (const b of this.host.b) if (Engine.collision(x, y, 80, 80, b.x, b.y, 100, 100) && b.c) return false;
    return true;
  }
}
class Block {
  static args = ['x', 'y', 'hp', 'type', 'team', 'host'];
  static raw = ['x', 'y', 'maxHp', 'hp', 'type', 's', 'team', 'id'];
  constructor() {
    this.cells = new Set();
    this.t = [];
    for (const p of Block.raw) Object.defineProperty(this, p, {get: () => this.raw[p], set: v => this.setValue(p, v), configurable: true});
  }
  init(x, y, hp, type, team, host) {
    this.raw = {};
    this.id = Math.random();
    for (const i in Block.args) this[Block.args[i]] = arguments[i];
    this.maxHp = hp;
    if (!(this.c = type !== 'fire' && type !== 'airstrike')) this.sd = setTimeout(() => this.destroy(), type === 'fire' ? 2500 : 6000);
    if (type === 'airstrike') for (let i = 0; i < 80; i++) this.t.push(setTimeout(() => this.host.d.push(new Damage(this.x+Math.floor(Math.random()*250)-50, this.y+Math.floor(Math.random()*250)-50, 100, 100, 50, this.team, this.host)), 5000+Math.random()*500));
    let dxmin = Math.max(0, Math.min(29, Math.floor(this.x/100))), dymin = Math.max(0, Math.min(29, Math.floor(this.y/100))), dxmax = Math.max(0, Math.min(29, Math.floor((this.x+99)/100))), dymax = Math.max(0, Math.min(29, Math.floor((this.y+99)/100)));
    for (let x = dxmin; x <= dxmax; x++) for (let y = dymin; y <= dymax; y++) {
      host.cells[x][y].add(this);
      this.cells.add(x+'x'+y);
    }
    if (this.c && this.x % 100 === 0 && this.y % 100 === 0 && this.x >= 0 && this.x <= 2900 && this.y >= 0 && this.y <= 2900) host.map.setWalkableAt(dxmin, dymin, false);
    return this;
  }
  setValue(p, v) {
    this.updatedLast = Date.now();
    this.raw[p] = v;
  }
  damage(d) {
    if (this.hp === Infinity) return;
    this.s = Date.now();
    if ((this.hp = Math.min(this.maxHp, this.hp-d)) <= 0) this.destroy();
  }
  reset() {
    for (const property of ['x', 'y', 'maxHp', 'hp', 'type', 'host', 'team', 's' ,'c', 'updatedLast']) this[property] = undefined;
    this.cells.clear();
    this.t.length = 0;
  }
  destroy() {
    for (const t of this.t) clearTimeout(t);
    clearTimeout(this.sd);
    this.host.b.splice(this.host.b.indexOf(this), 1);
    cell: for (const cell of this.cells) {
      const [x, y] = cell.split('x');
      this.host.cells[x][y].delete(this);
      for (const e of this.host.cells[x][y]) if (e instanceof Block && e.x % 100 === 0 && e.y % 100 === 0) continue cell;
      this.host.map.setWalkableAt(x, y, true);
    }
    this.release();
  }
}
class Shot {
  constructor(x, y, xm, ym, type, rotation, team, rank, host) {
    this.team = team;
    this.r = rotation;
    this.type = type;
    this.host = host;
    this.e = Date.now();
    this.raw = {};
    this.id = Math.random();
    this.md = this.damage = Shot.settings.damage[type]*(rank*10+300)/500;
    const factor = 6/Math.sqrt(xm**2+ym**2);
    this.xm = xm*factor*Shot.settings.speed[type];
    this.ym = ym*factor*Shot.settings.speed[type];
    const data = Shot.calc(x, y, xm, ym);
    this.sx = this.x = data.x-5;
    this.sy = this.y = data.y-5;
    this.cells = new Set();
    for (let dx = this.x/100, dy = this.y/100, i = 0; i < 4; i++) {
      const cx = Math.max(0, Math.min(29, Math.floor(i < 2 ? dx : dx+.09))), cy = Math.max(0, Math.min(29, Math.floor(i % 2 ? dy : dy+.09)));
      host.cells[cx][cy].add(this);
      this.cells.add(cx+'x'+cy);
    }
    this.u();
  }

  static settings = {
    damage: {
      bullet: 20,
      shotgun: 20,
      grapple: 10,
      powermissle: 100,
      megamissle: 200,
      healmissle: -200,
      dynamite: 0,
      fire: 0,
      usb: 0,
    },
    speed: {
      bullet: 1,
      shotgun: .8,
      grapple: 2,
      powermissle: 1.5,
      megamissle: 1.5,
      healmissle: 1.5,
      dynamite: .8,
      fire: .9,
      usb: .8,
    },
    size: {
      healmissle: 99,
      powermissle: 50,
      megamissle: 100,
    }
  }

  static calc(x, y, xm, ym) {
    const r = 70;
    const a = xm === 0 ? 1000000 : ym / xm;
    const b = xm === 0 ? 0 : (a > 0 ? -1 : 1);
    const c = Math.sqrt(r**2+(r*a)**2);
    const d = r*c;
    const cx = -r*b*d/c**2;
    const cy = Math.abs(r*a)*d/c**2;
    return {x: x+cx*(ym >= 0 ? 1 : -1), y: y+cy*(ym >= 0 ? 1 : -1)};
  }

  collision() {
    const { host, x, y, type, cells} = this;
    if (x < 0 || x > 3000 || y < 0 || y > 3000) {
      if (type === 'grapple') {
        const t = host.pt.find(t => t.username === Engine.getUsername(this.team));
        if (t.grapple) t.grapple.bullet.destroy();
        t.grapple = { target: { x: x, y: y }, bullet: this };
        this.update = () => {};
        return false;
      } else if (type === 'dynamite') {
        this.update = () => {}
        return false;
      } else {
        if (Shot.settings.size[type]) host.d.push(new Damage(x - Shot.settings.size[type] / 2 + 10, y - Shot.settings.size[type] / 2 + 10, Shot.settings.size[type], Shot.settings.size[type], this.damage, this.team, host));
        return true;
      }
    }
    for (const cell of cells) { 
      const [cx, cy] = cell.split('x');
      for (const e of host.cells[cx][cy]) {
        if (e instanceof Tank) {
          if (e.ded || !Engine.collision(x, y, 10, 10, e.x, e.y, 80, 80)) continue;
          if (type === 'grapple') {
            if (e.grapple) e.grapple.bullet.destroy();
            e.grapple = {target: host.pt.find(tank => tank.username === Engine.getUsername(this.team)), bullet: this};
            this.target = e;
            this.offset = [e.x-x, e.y-y];
            this.update = this.dynaUpdate;
            return false;
          } else if (type === 'dynamite' || type === 'usb') {
            this.target = e;
            this.offset = [e.x-x, e.y-y];
            this.update = this.dynaUpdate;
            if (type === 'usb') setTimeout(() => this.destroy(), 20000);
            return false;
          } else if (type === 'fire') {
            if (e.immune) return true;
            if (e.fire) clearTimeout(e.fireTimeout);
            e.fire = { team: this.team, frame: e.fire?.frame || 0 };
            e.fireInterval ??= setInterval(() => e.fire.frame ^= 1, 50); // OPTIMIZE make gui effects render by date time not by server interval
            e.fireTimeout = setTimeout(() => {
              clearInterval(e.fireInterval);
              e.fire = false;
            }, 4000);
            return true;
          } else {
            if (Shot.settings.size[type]) {
              host.d.push(new Damage(x - Shot.settings.size[type] / 2 + 10, y - Shot.settings.size[type] / 2 + 10, Shot.settings.size[type], Shot.settings.size[type], this.damage, this.team, host));
            } else if (Engine.getTeam(e.team) !== Engine.getTeam(this.team)) {
              e.damageCalc(x, y, this.damage, Engine.getUsername(this.team));
            }
            return true;
          }
        } else if (e instanceof Block) {
          if (!e.c || !Engine.collision(e.x, e.y, 100, 100, x, y, 10, 10)) continue;
          if (type === 'grapple' || type === 'dynamite') {
            if (type === 'grapple') {
              const t = this.host.pt.find(t => t.username === Engine.getUsername(this.team));
              if (t.grapple) t.grapple.bullet.destroy();
              t.grapple = {target: e, bullet: this}
            }
            this.update = () => {};
            return false;
          } else {
            if (type === 'fire') host.b.push(A.template('Block').init(e.x, e.y, Infinity, 'fire', this.team, host));
            if (Shot.settings.size[type]) {
              host.d.push(new Damage(x - Shot.settings.size[type] / 2 + 10, y - Shot.settings.size[type] / 2 + 10, Shot.settings.size[type], Shot.settings.size[type], this.damage, this.team, host));
            } else if (type !== 'fire') {
              e.damage(this.damage);
            }
            return true;
          }
        } else if (e instanceof AI) {
          if (!Engine.collision(x, y, 10, 10, e.x, e.y, 80, 80)) continue;
          if (type === 'dynamite' || type === 'usb') {
            this.target = e;
            this.offset = [e.x-x, e.y-y];
            this.update = this.dynaUpdate;
            if (type === 'usb') setTimeout(() => this.destroy(), 15000);
            return false;
          } else if (type === 'fire') {
            if (e.fire) clearTimeout(e.fireTimeout);
            e.fire = {team: this.team, frame: e.fire?.frame || 0};
            e.fireInterval ??= setInterval(() => e.fire.frame ^= 1, 50);
            e.fireTimeout = setTimeout(() => {
              clearInterval(e.fireInterval);
              e.fire = false;
            }, 4000);
            return true;
          } else {
            if (Shot.settings.size[type]) {
              host.d.push(new Damage(x - Shot.settings.size[type] / 2 + 10, y - Shot.settings.size[type] / 2 + 10, Shot.settings.size[type], Shot.settings.size[type], this.damage, this.team, host));
            } else if (Engine.getTeam(e.team) !== Engine.getTeam(this.team)) {
              e.damageCalc(x, y, this.damage, Engine.getUsername(this.team));
            }
            return true;
          }
        }
      }
    }
    return false;
  }

  dynaUpdate() {
    this.oldx = this.x;
    this.oldy = this.y;
    this.x = this.target.x - this.offset[0];
    this.y = this.target.y - this.offset[1];
    this.cellUpdate();
    this.u();
    if (this.target.ded) this.destroy();
    if (this.host.pt.find(t => t.username === Engine.getUsername(this.team))?.ded) this.destroy();
  }

  cellUpdate() {
    if (Math.floor(this.oldx/100) !== Math.floor(this.x/100) || Math.floor(this.oldy/100) !== Math.floor(this.y/100) || Math.floor((this.oldx+10)/100) !== Math.floor((this.x+10)/100) || Math.floor((this.oldy+10)/100) !== Math.floor((this.y+10)/100)) { 
      const cells = new Set();
      for (let dx = this.x/100, dy = this.y/100, i = 0; i < 4; i++) {
        const cx = Math.max(0, Math.min(29, Math.floor(i < 2 ? dx : dx + .09))), cy = Math.max(0, Math.min(29, Math.floor(i % 2 ? dy : dy + .09)));
        this.host.cells[cx][cy].add(this);
        cells.add(cx+'x'+cy);
      }
      for (const cell of [...this.cells].filter(c => !cells.has(c))) {
        const [x, y] = cell.split('x');
        this.host.cells[x][y].delete(this);
      }
      this.cells = cells;
    }
  }

  update() {
    const time = Math.floor((Date.now()-this.e)/5);
    this.oldx = this.x;
    this.oldy = this.y;
    this.x = time*this.xm+this.sx;
    this.y = time*this.ym+this.sy;
    this.cellUpdate();
    if (this.collision()) this.destroy();
    if (this.type === 'shotgun') {
      this.d = Math.sqrt((this.x - this.sx) ** 2 + (this.y - this.sy) ** 2);
      this.damage = this.md - (this.d / 300) * this.md;  
      if (this.d >= 300) this.destroy();
    } else if (this.type === 'dynamite') this.r += 5;
    this.u();
  }

  u() {
    this.updatedLast = Date.now();
    for (const property of ['team', 'r', 'type', 'x', 'y', 'sx', 'sy', 'id']) this.raw[property] = this[property];
  }

  destroy() {
    const index = this.host.s.indexOf(this);
    if (index !== -1) this.host.s.splice(index, 1);
    for (const cell of this.cells) {
      const [x, y] = cell.split('x');
      this.host.cells[x][y].delete(this);
    }
  }
}
class AI {
  constructor(x, y, role, rank, team, host) {
    this.raw = {};
    ['role', 'rank', 'username', 'cosmetic', 'cosmetic_hat', 'cosmetic_body', 'color', 'damage', 'maxHp', 'hp', 'shields', 'team', 'x', 'y', 'r', 'ded', 'reflect', 'pushback', 'baseRotation', 'baseFrame', 'fire', 'damage', 'animation', 'buff', 'invis', 'id', 'class', 'flashbanged', 'dedEffect'].forEach(p => {
      Object.defineProperty(this, p, {
        get: () => this.raw[p],
        set: v => this.setValue(p, v),
        configurable: true,
      });
    });
    this.id = Math.random();
    this.username = 'Bot'+this.id;
    this.role = role;
    this.x = x;
    this.y = y;
    this.r = this.tr = this.baseRotation = this.baseFrame = this.mode = this.pushback = this.immune = this.shields = 0;
    this.barrelSpeed = Math.random()*3+2;
    this.rank = rank;
    this.team = team.includes(':') ? team : this.username+':'+team;
    this.host = host;
    this.hp = rank * 10 + 300;
    this.maxHp = this.hp;
    this.seeUser = this.target = this.fire = this.obstruction = this.bond = this.path = this.damage = false;
    this.canFire = this.canPowermissle = this.canItem0 = this.canItem1 = this.canItem2 = this.canItem3 = this.canClass = this.canBoost = this.canBashed = true;
    this.items = [];
    if (this.role !== 0) this.giveAbilities();
    this.invis = this.class === 'stealth';
    this.color = Engine.getRandomColor();
    const summoner = host.pt.find(t => t.username === Engine.getUsername(this.team));
    if (summoner) {
      this.cosmetic_hat = summoner.cosmetic_hat;
      this.cosmetic = summoner.cosmetic;
      this.cosmetic_body = summoner.cosmetic_body;
    }
    this.cells = new Set();
    for (let dx = this.x/100, dy = this.y/100, i = 0; i < 4; i++) {
      const cx = Math.max(0, Math.min(29, Math.floor(i < 2 ? dx : dx + (role === 0 ? .99 : .79)))), cy = Math.max(0, Math.min(29, Math.floor(i % 2 ? dy : dy + (role === 0 ? .99 : .79))));
      host.cells[cx][cy].add(this);
      this.cells.add(cx+'x'+cy);
    }
    this.lookInterval = setInterval(() => this.identify(), 500);
  }

  giveAbilities() {
    const available = ['airstrike', 'super_glu', 'duck_tape', 'shield', 'flashbang', 'bomb', 'dynamite', 'usb', 'weak', 'strong', 'spike', 'reflector'];
    const classes = ['tactical', 'stealth', 'warrior', 'builder', 'fire', 'medic'];
    for (let i = 0; i < 4; i++) this.items.push(available[Math.floor(Math.random()*available.length)]);
    this.class = classes[Math.floor(Math.random()*classes.length)];
  }

  think() {
    if (this.role !== 0) this.move();
    if (this.obstruction && !this.seeTarget) {
      this.tr = Engine.toAngle(this.obstruction.x-(this.x+40), this.obstruction.y-(this.y+40));
      if (this.canPowermissle && this.role !== 0 && Math.random() <= 1/600) this.fireCalc(this.obstruction.x, this.obstruction.y, 'powermissle');
      if (this.canFire) this.fireCalc(this.obstruction.x, this.obstruction.y);
    } else if (this.mode !== 0) {
      this.tr = Engine.toAngle(this.target.x - this.x, this.target.y - this.y);
      if (this.canPowermissle && this.role !== 0 && Math.random() <= 1/600) this.fireCalc(this.target.x, this.target.y, 'powermissle');
      if (this.canFire) this.fireCalc(this.target.x, this.target.y);
    }
    if (this.canClass && this.mode !== 0 && Math.random() < 1/300) {
      let cooldown = 0;
      if (this.class === 'tactical') {
        this.fireCalc(this.target.x, this.target.y, 'megamissle');
        cooldown = 25000;
      } else if (this.class === 'builder') {
        this.host.useAbility(this, 'turret');
        cooldown = 20000;
      } else if (this.class === 'warrior') {
        this.host.useAbility(this, 'buff');
        cooldown = 40000;
      } else if (this.class === 'medic') {
        this.host.useAbility(this, 'healwave'); // greedy self-heal :D
        cooldown = 30000;
      } else if (this.class === 'fire') {
        for (let i = -30, len = 30; i < len; i += 5) {
          const r = this.r+i;
          const {x, y} = Engine.toPoint(r);
          this.host.s.push(new Shot(this.x+40, this.y+40, x, y, 'fire', r, this.team, this.rank, this.host));
        }
        cooldown = 10000;
      }
      this.canClass = false;
      setTimeout(() => {
        this.canClass = true;
      }, cooldown);
    }
    for (let i = 0; i < 4; i++) {
      if (this['canItem'+i] && Math.random() < 1/300) {
        const item = this.items[i];
        let cooldown = 0;
        if (item === 'airstrike') {
          if (this.mode !== 0) {
            this.host.useAbility(this, 'airstrike'+this.target.x+'x'+this.target.y);
            cooldown = 20000;
          }
        } else if (item === 'super_glu') {
          if (this.hp < this.maxHp*.75) {
            this.host.useAbility(this, 'glu');
            cooldown = 30000;
          }
        } else if (item === 'duck_tape') {
          if (this.hp < this.maxHp*.75) {
            this.host.useAbility(this, 'tape');
            cooldown = 30000;
          }
        } else if (item === 'shield') {
          if (this.shields === 0) {
            this.host.useAbility(this, 'shield');
            cooldown = 30000;
          }
        } else if (item === 'flashbang') {
          this.host.useAbility(this, 'flashbang');
          cooldown = 20000;
        } else if (item === 'bomb') {
          if (this.obstruction) {
            this.host.useAbility(this, 'bomb');
            cooldown = 5000;
          }
        } else if (item === 'dynamite') {
          // lol no :)
        } else if (item === 'usb') {
          // idk
        } else if (item === 'weak') {
          if (this.mode !== 0 && ((this.target.x-this.x)**2+(this.target.y-this.y)**2)**.5 < 180) {
            this.host.useAbility(this, 'block#weak');
            cooldown = 4000;
          }
        } else if (item === 'strong') {
          if (this.mode !== 0 && ((this.target.x-this.x)**2+(this.target.y-this.y)**2)**.5 < 180) {
            this.host.useAbility(this, 'block#strong');
            cooldown = 8000;
          }
        } else if (item === 'spike') {
          if (this.mode !== 0 && ((this.target.x-this.x)**2+(this.target.y-this.y)**2)**.5 < 180) {
            this.host.useAbility(this, 'block#spike');
            cooldown = 10000;
          }
        } else if (item === 'reflector') {
          if (this.mode !== 0) {
            this.host.useAbility(this, 'reflector');
            cooldown = 10000;
          }
        }
        if (cooldown !== 0) {
          this['canItem'+i] = false;
          setTimeout(() => {
            this['canItem'+i] = true;
          }, cooldown);
        }
      }
    }
  }

  setValue(p, v) {
    if (this.raw[p] === v) return;
    this.updatedLast = Date.now();
    this.raw[p] = v;
  }

  update() {
    this.think();
    if (!this.target && this.role === 0) this.r++;
    if (!(this.role === 0 && this.mode === 0)) {
      const diff = (this.tr-this.r+360)%360, dir = diff < 180 ? 1 : -1;
      this.r = diff > this.barrelSpeed ? (this.r+dir*this.barrelSpeed+360)%360 : this.tr;
      if (this.role === 0) this.r = this.tr; // builder aimbot temp
    }
    const team = Engine.getTeam(this.team);
    /*if (this.dedEffect) {
      this.dedEffect.time = Date.now() - this.dedEffect.start;
      this.setValue('dedEffect', this.dedEffect); // REMOVE THIS TEMPORARY
    } No death effects for AI yet...*/
    if (this.pushback !== 0) this.pushback += 0.5;
    if (this.fire && Engine.getTeam(this.fire.team) !== Engine.getTeam(this.team)) this.damageCalc(this.x, this.y, .25, Engine.getUsername(this.fire.team));
    if (this.damage) this.damage.y--;
    // if (this.grapple) this.grappleCalc(); No grapple for AI yet...
    if (this.reflect) {
      const hx = Math.floor((this.x+40)/100), hy = Math.floor((this.y+40)/100);
      for (let i = Math.max(0, hx-2); i <= Math.min(29, hx+2); i++) for (let l = Math.max(0, hy-2); l <= Math.min(29, hy+2); l++) {
        for (const entity of this.host.cells[i][l]) {
          if (entity instanceof Shot) {
            const xd = entity.x-(this.x+40), yd = entity.y-(this.y+40), td = Math.sqrt(xd**2+yd**2);
            const aspectRatio = 6/td;
            if (td > 150) continue;
            entity.e = Date.now();
            entity.sx = entity.x;
            entity.sy = entity.y;
            entity.xm = xd*aspectRatio;
            entity.ym = yd*aspectRatio;
            entity.r = Engine.toAngle(xd, yd);
            if (entity.type !== 'grapple') entity.team = this.team;
          }
        }
      }
    }
    for (const cell of this.cells) {
      const [x, y] = cell.split('x');
      for (const entity of this.host.cells[x][y]) {
        const teamMatch = team === Engine.getTeam(entity.team);
        if (entity instanceof Block) {
          if (!this.ded && this.immune+500 < Date.now() && Engine.collision(this.x, this.y, 80, 80, entity.x, entity.y, 100, 100)) {
            if (entity.type === 'fire') {
              if (this.fire) {
                clearTimeout(this.fireTimeout);
                this.fire = {team: entity.team, frame: this.fire.frame};
              } else {
                this.fire = {team: entity.team, frame: 0};
                this.fireInterval ??= setInterval(() => this.fire.frame ^= 1, 50);
              }
              this.fireTimeout = setTimeout(() => {
                clearInterval(this.fireInterval);
                this.fire = false;
              }, 4000);
            } else if (entity.type === 'spike' && !teamMatch) this.damageCalc(this.x, this.y, 1, Engine.getUsername(entity.team));
          }
        } else if (entity instanceof Tank || entity instanceof AI) {
          if (entity.buff && !this.ded && this.immune+500 < Date.now() && this.canBashed && Engine.getTeam(entity.team) !== Engine.getTeam(this.team) && Engine.collision(this.x, this.y, 80, 80, entity.x, entity.y, 80, 80)) {
            this.canBashed = false;
            setTimeout(() => {this.canBashed = true}, 1000);
            this.damageCalc(this.x, this.y, 100, Engine.getUsername(entity.team));
          }
        }
      }
    }
  }

  move() {
    const {x, y, path, baseRotation} = this;
    if ((x-10)%100 === 0 && (y-10)%100 === 0) this.onBlock();
    if (!path || !path.p.length) return;
    const now = Date.now();
    const len = path.p.length-1;
    let frames = Math.min(Math.floor((now-path.t)/15), len*25);
    if (this.immune+500 > path.t) frames = Math.min(frames+3*Math.floor(Math.min(now-Math.max(this.immune, path.t), this.immune+500-path.t)/15), len*25);
    const f = Math.floor(frames/25);
    const n = Math.min(f+1, len);
    const dx = path.p[n][0]-path.p[f][0], dy = path.p[n][1]-path.p[f][1];
    const offset = 4*(frames%25);
    const nx = 10+path.p[f][0]*100+offset*dx, ny = 10+path.p[f][1]*100+offset*dy;
    this.baseRotation = [[135, 180, 225], [90, baseRotation, 270], [45, 0, 315]][dy+1][dx+1];
    this.tr = this.baseRotation;
    this.obstruction = this.collision(nx, ny);
    if (!this.obstruction) {
      if (this.canBoost && Math.random() < 1/300) {
        this.canBoost = false;
        this.immune = Date.now();
        setTimeout(() => {this.canBoost = true}, 5000);
      }
      this.x = nx;
      this.y = ny;
    } else {
      this.path.t = this.path.o+Date.now()-this.obstruction.t;
    }
    const cells = new Set();
    for (let dx = this.x/100, dy = this.y/100, i = 0; i < 4; i++) {
      const cx = Math.max(0, Math.min(29, Math.floor(i < 2 ? dx : dx + (this.role === 0 ? .99 : .79)))), cy = Math.max(0, Math.min(29, Math.floor(i % 2 ? dy : dy + (this.role === 0 ? .99 : .79))));
      this.host.cells[cx][cy].add(this);
      cells.add(cx+'x'+cy);
    }
    for (const cell of [...this.cells].filter(c => !cells.has(c))) {
      const [x, y] = cell.split('x');
      this.host.cells[x][y].delete(this);
    }
    this.cells = cells;
  }

  collision(x, y) {
    for (const b of this.host.b) if (Engine.collision(x, y, 80, 80, b.x, b.y, 100, 100) && b.c) return {x: b.x+50, y: b.y+50, t: this.obstruction ? this.obstruction.t : Date.now()};
    return false;
  }

  onBlock() {
    if (!this.path) this.generatePath();
    if (!this.path.p || !this.path.p.length) this.generatePath();
    if (this.path.p && this.path.p.length > 0) {
      const final = this.path.p[this.path.p.length - 1];
      if ((this.x - 10) / 100 === final[0] && (this.y - 10) / 100 === final[1]) this.generatePath();
    }
  }

  generatePath() {
    const sx = (this.x-10)/100, sy = (this.y-10)/100;
    let cir, coords = [], limiter, tpx, tpy, epx, epy;
    let tx = Math.floor((this.target.x+40)/100), ty = Math.floor((this.target.y+40)/100), ranged = Math.max(sx-tx, sy-ty) > [1, 5, 5][this.role-1];
    if (this.role === 3 && this.bond) {
      epx = Math.floor((this.bond.x+40)/100);
      epy = Math.floor((this.bond.y+40)/100);
    } else if (this.mode === 0 || (this.mode === 1 && ranged) || this.mode === 2) {
      epx = sx;
      epy = sy;
    } else if (this.mode === 1) {
      epx = tx;
      epy = ty;
    } else {
      epx = sx;
      epy = sy;
    }
    if ((this.role === 3 && this.bond) || (this.role === 1 && this.mode === 1 && !ranged)) {
      cir = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
    } else cir = [[0, -3], [1, -3], [2, -2], [3, -1], [3, 0], [3, 1], [2, 2], [1, 3], [0, 3], [-1, 3], [-2, 2], [-3, 1], [-3, 0], [-3, -1], [-2, -2], [-1, -3]];
    if ((this.role === 3 && this.bond) || (this.mode === 1 && !ranged)) {
      tpx = sx;
      tpy = sy;
    } else if (this.mode === 0) {
      const d = Engine.toPoint(this.r);
      tpx = d.x+epx;
      tpy = d.y+epy;
    } else if (this.mode === 2 || (this.mode === 1 && ranged)) {
      tpx = tx;
      tpy = ty;
    }
    if (this.role === 3 && this.bond) {
      limiter = [2];
    } else if (this.role === 1 && !ranged) {
      limiter = [2, 3];
    } else {
      limiter = [2, 3, 4];
    }
    for (const c of cir) {
      const x = c[0]+epx, y = c[1]+epy, d = (x-tpx)**2+(y-tpy)**2;
      if (x >= 0 && y >= 0 && x <= 29 && y <= 29) coords.push({x, y, d});
    }
    if (!coords.length) return this.path = {p: [], m: this.mode, t: Date.now(), o: Date.now()};
    coords.sort((a, b) => this.mode !== 2 ? a.d - b.d : b.d - a.d);
    for (let i = 0; i <= this.mode === 0 ? coords.length : 5; i++) {
      const r = this.choosePath(coords.length);
      const {x, y} = coords[r];
      const p = Engine.pathfind(sx, sy, x, y, this.host.map.clone());
      if (limiter.includes(p.length) || true) return this.path = {p, m: this.mode, t: Date.now(), o: Date.now()};
      coords.splice(r, 1);
      if (!coords.length) return this.path = {p: [], m: this.mode, t: Date.now(), o: Date.now()}; 
    }
    if (this.mode !== 0) this.path = {p: Engine.pathfind(sx, sy, tx, ty, this.host.map.clone()).slice(0, 5), m: this.mode, t: Date.now(), o: Date.now()}; 
  }

  choosePath(p) {
    return Math.floor(Math.random()*p);
  }

  identify() {
    let previousTargetExists = false;
    const tanks = this.host.pt.concat(this.host.ai).sort((a, b) => {
      if ((a.id === this.target.id && !a.ded) || (b.id === this.target.id && !b.ded)) previousTargetExists = true;
      return (a.x-this.x)**2+(a.y-this.y)**2 > (b.x-this.x)**2+(b.y-this.y)**2;
    });
    let target = false, bond = false;
    for (const t of tanks) {
      if (t.ded || t.invis || !Engine.raycast(this.x+40, this.y+40, t.x+40, t.y+40, this.host.b) || t.id === this.id || ((t.x-this.x)**2+(t.y-this.y)**2)**.5 > 800) continue;
      if (Engine.getTeam(t.team) === Engine.getTeam(this.team)) {
        if (!bond && t.role !== 3 && t.role !== 0) bond = t;
      } else {
        if (!target) target = t;
      }
      if (target && (bond || this.role !== 3)) break;
    }
    if (bond) this.bond = bond; 
    if (!target) {
      if (this.target) {
        this.seeTarget = false;
        if (!this.seeTimeout) this.seeTimeout = setTimeout(() => {
          this.mode = 0;
          this.target = false;
        }, previousTargetExists ? 10000 : 0);
      }
    } else {
      if (this.target) this.seeTimeout = clearTimeout(this.seeTimeout);
      this.seeTarget = true;
      this.target = {x: target.x, y: target.y, id: target.id};
      this.mode = (this.hp < .3 * this.maxHp && this.role !== 1) ? 2 : 1;
    }
  }

  fireCalc(tx, ty, type) {
    this.pushback = -3;
    if (type === undefined) type = this.role !== 0 && Math.sqrt((tx - this.x) ** 2 + (ty - this.y) ** 2) < 150 ? 'shotgun' : 'bullet';
    for (let [i, len] = type === 'shotgun' ? [-10, 15] : [0, 1]; i < len; i += 5) {
      const r = this.r+i;
      const {x, y} = Engine.toPoint(r);
      this.host.s.push(new Shot(this.x+40, this.y+40, x, y, type, r, this.team, this.rank*(this.buff ? (1.5*this.rank+15)/Math.max(this.rank, 1/2000) : 1), this.host));
    }
    if (type === 'powermissle') {
      this.canPowermissle = false;
      setTimeout(() => {this.canPowermissle = true}, 10000);
    } else if (type !== 'megamissle') {
      this.canFire = false;
      setTimeout(() => {this.canFire = true}, type === 'shotgun' ? 600 : 200);
    }
  }

  damageCalc(x, y, a, u) {
    if (this.immune+500 > Date.now() || this.reflect) return;
    const hx = Math.floor((this.x+40)/100), hy = Math.floor((this.y+40)/100);
    for (let i = Math.max(0, hx-1); i <= Math.min(29, hx+1); i++) for (let l = Math.max(0, hy-1); l <= Math.min(29, hy+1); l++) for (const entity of this.host.cells[i][l]) {
      if (entity instanceof Shot) if (entity.target) if (entity.target.id === this.id && entity.type === 'usb') a *= Engine.getTeam(entity.team) === Engine.getTeam(this.team) ? .9 : 1.1;
    }
    if (this.shields > 0 && a > 0) return this.shields -= a;
    clearTimeout(this.damageTimeout);
    this.damageTimeout = setTimeout(() => {this.damage = false}, 1000);
    this.damage = {d: (this.damage ? this.damage.d : 0)+a, x, y};
    this.hp -= a;
    clearInterval(this.healInterval);
    clearTimeout(this.healTimeout);
    if (this.hp <= 0) {
      if (this.host.ondeath && this.role !== 0) this.host.ondeath(this, this.host.pt.concat(this.host.ai).find(t => t.username === u));
      return this.destroy();
    }
    this.healTimeout = setTimeout(() => {
      this.healInterval = setInterval(() => {
        this.hp = Math.min(this.hp+.4, this.maxHp);
      }, 15);
    }, 10000);
  }

  destroy() {
    clearInterval(this.lookInterval);
    const index = this.host.ai.indexOf(this);
    if (index !== -1) this.host.ai.splice(index, 1);
    for (const cell of this.cells) {
      const [x, y] = cell.split('x');
      this.host.cells[x][y].delete(this);
    }
  }
}
class Damage {
  static args = ['x', 'y', 'w', 'h', 'a', 'team', 'host'];
  constructor(x, y, w, h, a, team, host) {
    for (const i in arguments) this[Damage.args[i]] = arguments[i];
    this.raw = {};
    this.f = 0;
    this.id = Math.random();
    this.cells = new Set();
    for (let dx = this.x/100, dy = this.y/100, i = 0; i < 4; i++) {
      const cx = Math.max(0, Math.min(29, Math.floor(i < 2 ? dx : dx+w/100-.01))), cy = Math.max(0, Math.min(29, Math.floor(i % 2 ? dy : dy+h/100-.01)));
      host.cells[cx][cy].add(this);
      this.cells.add(cx+'x'+cy);
    }
    const cache = new Set();
    for (const cell of this.cells) {
      const [cx, cy] = cell.split('x');
      for (const e of host.cells[cx][cy]) {
        if (cache.has(e.id)) continue;
        cache.add(e.id);
        const teamMatch = Engine.getTeam(team) === Engine.getTeam(e.team);
        if (e instanceof Tank) {
          if (((!teamMatch && a > 0) || (teamMatch && a < 0)) && Engine.collision(x, y, w, h, e.x, e.y, 80, 80)) e.damageCalc(x, y, a, Engine.getUsername(team));
        } else if (e instanceof Block) {
          if (Engine.collision(x, y, w, h, e.x, e.y, 100, 100)) e.damage(a);
        } else if (e instanceof AI) {
          if (((!teamMatch && a > 0) || (teamMatch && a < 0)) && Engine.collision(x, y, w, h, e.x, e.y, e.role === 0 ? 100 : 80, e.role === 0 ? 100 : 80)) e.damageCalc(e.x, e.y, a, Engine.getUsername(team));
        }
      }
    }
    this.i = setInterval(() => {
      this.f++;
      this.u();
    }, 18);
    setTimeout(() => this.destroy(), 200);
  }
  
  u() {
    this.updatedLast = Date.now();
    for (const property of ['x', 'y', 'w', 'h', 'f', 'id']) this.raw[property] = this[property];
  }

  destroy() {
    clearInterval(this.i);
    const index = this.host.d.indexOf(this);
    if (index !== -1) this.host.d.splice(index, 1);
    for (const cell of this.cells) {
      const [x, y] = cell.split('x');
      this.host.cells[x][y].delete(this);
    }
  }
}
class A {
  static templates = {};
  static createTemplate(n, v, r, p=0) {
    A.templates[n] = [v, r];
    A[n] = [];
    for (let i = 0; i < p; i++) A.template(n);
  }
  static template(n) {
    if (!A[n].length) {
      let e = new A.templates[n][0]();
      e.release = () => {
        if (A.templates[n][1]) A.templates[n][1](e); else e.reset();
        A[n].push(e);
      };
      return e;
    } else return A[n].shift();
  }
}
module.exports = {Engine, Tank, Block, Shot, AI, Damage, A}
