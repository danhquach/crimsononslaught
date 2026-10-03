// The sweep's in-page bot (#407). Measurement only: it steers the Player by overriding
// `keyboardMove` (src/entities/Player.ts), which the player's update reads once per
// simulation step, and changes no game code.
//
// Everything it reads from the game goes through `need`, so a renamed or removed field
// stops the sweep with a message that names it instead of quietly steering on nothing.
// Both functions run inside the page (page.evaluate serialises them), so they close over
// nothing and every helper is defined inside.

/**
 * Installed in the page once the Game scene is up. `opts.dash` turns on the dash
 * (off by default: the #406 tables are no-dash runs).
 */
export function installSteer(opts) {
  return (async () => {
    const need = (obj, path) => {
      let v = obj;
      for (const k of path.split('.')) {
        v = v == null ? undefined : v[k];
        if (v === undefined) throw new Error(`sweep: game field missing: ${path}`);
      }
      return v;
    };
    const { game } = await import('/src/main.ts');
    need(game, 'scene.getScene');
    const scene = game.scene.getScene('Game');
    for (let i = 0; i < 100 && !(scene.player && scene.enemies && scene.gems && scene.pickups); i++)
      await new Promise((r) => setTimeout(r, 50));
    need(scene, 'player.x');
    need(scene, 'player.y');
    need(scene, 'player.hp');
    need(scene, 'player.maxHp');
    if (typeof need(scene, 'player.keyboardMove') !== 'function')
      throw new Error('sweep: game field missing: player.keyboardMove');
    need(scene, 'enemies.live');
    need(scene, 'enemies.liveCount');
    need(scene, 'enemies.group');
    need(scene, 'gems.group');
    need(scene, 'pickups.group');
    need(scene, 'enemyShots.group');
    need(scene, 'bossBolts.group');
    const bounds = need(scene, 'physics.world.bounds');
    need(bounds, 'x');
    need(bounds, 'y');
    need(bounds, 'width');
    need(bounds, 'height');
    const hudScene = game.scene.getScene('Hud');
    if (opts.dash) {
      need(scene, 'player.dashQueued');
      need(hudScene, 'view.dash.ready');
    }
    const player = scene.player;
    const L = bounds.x,
      T = bounds.y,
      R = bounds.x + bounds.width,
      B = bounds.y + bounds.height;
    const WALL = 450;
    const bot = (window.__bot = {
      hpLost: 0,
      lastHp: player.hp,
      side: 1,
      steps: 0,
      moved: 0,
      missing: null,
      dashes: 0,
    });
    const seen = new Set();
    // First time a kind of entity shows up, check the fields the policy reads off it.
    const check = (kind, obj, paths) => {
      if (seen.has(kind)) return;
      seen.add(kind);
      for (const p of paths) need(obj, p);
    };
    const norm = (x, y) => {
      const l = Math.hypot(x, y);
      return l < 1e-9 ? { x: 0, y: 0, l: 0 } : { x: x / l, y: y / l, l };
    };
    const rot = (v, deg) => {
      const a = (deg * Math.PI) / 180,
        c = Math.cos(a),
        s = Math.sin(a);
      return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
    };
    const step = () => {
      const px = player.x,
        py = player.y;
      const hp = player.hp,
        maxHp = player.maxHp;
      if (hp < bot.lastHp) bot.hpLost += bot.lastHp - hp;
      bot.lastHp = hp;
      bot.steps++;
      const frac = hp / maxHp;
      const enemies = scene.enemies.live;
      const boss = scene.enemies.boss;
      let rx = 0,
        ry = 0,
        nearest = Infinity,
        shotNear = Infinity;
      for (const e of enemies) {
        check('enemy', e, ['x', 'y', 'isElite']);
        const dx = px - e.x,
          dy = py - e.y,
          d = Math.hypot(dx, dy);
        if (d < nearest) nearest = d;
        if (d >= 320 || d < 1e-6) continue;
        const mult = e === boss ? 4 : e.isElite ? 2 : 1;
        const w = (1 - d / 320) * mult;
        rx += (dx / d) * w;
        ry += (dy / d) * w;
      }
      for (const pool of [scene.enemyShots, scene.bossBolts]) {
        for (const s of pool.group.getChildren()) {
          if (!s.active) continue;
          const dx = px - s.x,
            dy = py - s.y,
            d = Math.hypot(dx, dy);
          if (d < shotNear) shotNear = d;
          if (d >= 220 || d < 1e-6) continue;
          const w = (1 - d / 220) * 1.5;
          rx += (dx / d) * w;
          ry += (dy / d) * w;
        }
      }
      const Rv = norm(rx, ry);
      const pressed = nearest < 90 || Rv.l > 2.5;
      const retreat = pressed || frac < 0.4;

      // wall push (inward), within WALL px of an edge
      let wx = 0,
        wy = 0;
      if (px < L + WALL) wx += (L + WALL - px) / WALL;
      if (px > R - WALL) wx -= (px - (R - WALL)) / WALL;
      if (py < T + WALL) wy += (T + WALL - py) / WALL;
      if (py > B - WALL) wy -= (py - (B - WALL)) / WALL;
      const inWall = Math.hypot(wx, wy) > 0;

      // goal selection
      let goal = null;
      const pk = scene.pickups.group.getChildren();
      let best = Infinity;
      const consider = (x, y, maxD) => {
        const d = Math.hypot(x - px, y - py);
        if (d <= maxD && d < best) {
          best = d;
          goal = { x, y };
        }
      };
      for (const c of pk) if (c.active) check('pickup', c, ['kind', 'isCollected']);
      const live = (c) => c.active && !c.isCollected;
      // priority tiers: chest/relic 700, health 700 (<70% hp), other consumable 350, then gem
      for (const c of pk)
        if (live(c) && c.kind === 'consumable' && c.consumableKind === 'chest')
          consider(c.x, c.y, 700);
      if (!goal) for (const c of pk) if (live(c) && c.kind === 'relic') consider(c.x, c.y, 700);
      if (!goal && frac < 0.7)
        for (const c of pk)
          if (live(c) && c.kind === 'consumable' && c.consumableKind === 'health')
            consider(c.x, c.y, 700);
      if (!goal)
        for (const c of pk)
          if (live(c) && c.kind === 'consumable' && c.consumableKind !== 'chest')
            consider(c.x, c.y, 350);
      if (!goal) {
        best = Infinity;
        for (const g of scene.gems.group.getChildren()) {
          if (g.active) check('gem', g, ['isCollected']);
          if (!g.active || g.isCollected) continue;
          let blocked = false;
          for (const e of enemies)
            if (Math.hypot(e.x - g.x, e.y - g.y) < 45) {
              blocked = true;
              break;
            }
          if (blocked) continue;
          const d = Math.hypot(g.x - px, g.y - py);
          if (d < best) {
            best = d;
            goal = { x: g.x, y: g.y };
          }
        }
      }
      let bossVec = null;
      if (boss) {
        // Boss fields exist only while a boss is up, so they are never required: null-safe reads.
        const bx = px - boss.x,
          by = py - boss.y,
          bd = Math.hypot(bx, by) || 1;
        const away = { x: bx / bd, y: by / bd };
        const ph = boss.phase;
        if (boss.skill === 'slam') {
          const r = (scene.bossSlamFx && scene.bossSlamFx.warnRadiusPx) || 260;
          if (bd < r + 80) bossVec = { x: away.x * 3, y: away.y * 3 };
        } else if (ph === 'charge' || ph === 'telegraph') {
          const dir =
            ph === 'charge' && boss.chargeDir && (boss.chargeDir.x || boss.chargeDir.y)
              ? boss.chargeDir
              : { x: -away.x, y: -away.y };
          // sidestep perpendicular to the charge line, toward the side we are already on
          const perp = { x: -dir.y, y: dir.x };
          const sgn = bx * perp.x + by * perp.y >= 0 ? 1 : -1;
          bossVec = { x: perp.x * sgn * 3, y: perp.y * sgn * 3 };
        }
        // hold 200-330 px: approach if far (replaces gem goal)
        if (bd > 330) goal = { x: boss.x, y: boss.y };
        else if (bd >= 200) goal = null;
      }

      // build move. Repulsion is the raw weighted sum (not normalised), so one far enemy
      // is outweighed by the pull of a gem (weight 1) and the hero walks into spell reach;
      // a dense or close crowd (large sum) dominates and the hero backs off or sidesteps.
      let mx, my;
      const gdir = goal ? norm(goal.x - px, goal.y - py) : { x: 0, y: 0 };
      if (retreat) {
        mx = rx;
        my = ry;
      } else {
        let s = bot.side;
        let dir = rot({ x: rx, y: ry }, 65 * s);
        if (inWall && dir.x * wx + dir.y * wy < 0) {
          bot.side = -s;
          s = bot.side;
          dir = rot({ x: rx, y: ry }, 65 * s);
        }
        mx = dir.x + gdir.x;
        my = dir.y + gdir.y;
      }
      if (bossVec) {
        mx += bossVec.x;
        my += bossVec.y;
      }
      if (inWall) {
        mx += wx * 3;
        my += wy * 3;
      }
      const out = norm(mx, my);
      if (out.l > 0) bot.moved++;
      // Dash (off by default): when pressed hard or a shot is about to land, and the HUD says ready.
      if (opts.dash && out.l > 0 && (pressed || shotNear < 80) && hudScene.view.dash.ready) {
        player.dashQueued = true;
        bot.dashes++;
      }
      return { x: out.x, y: out.y };
    };
    player.keyboardMove = function () {
      try {
        return step();
      } catch (e) {
        // A throw inside the game loop would end the run in a way nobody reads; hold still
        // and let the next poll report the field instead.
        bot.missing = String(e && e.message ? e.message : e);
        return { x: 0, y: 0 };
      }
    };
    return { ok: true };
  })();
}

/** One poll of everything the driver needs, in one evaluate (no cross-evaluate races). */
export function pollState() {
  return (async () => {
    const need = (obj, path) => {
      let v = obj;
      for (const k of path.split('.')) {
        v = v == null ? undefined : v[k];
        if (v === undefined) throw new Error(`sweep: game field missing: ${path}`);
      }
      return v;
    };
    const { game } = await import('/src/main.ts');
    const sm = game.scene;
    const out = { levelUp: sm.isActive('LevelUp'), result: sm.isActive('Result'), missing: null };
    try {
      const hudScene = sm.getScene('Hud');
      if (hudScene && hudScene.view) {
        const hud = hudScene.view;
        for (const f of ['elapsedMs', 'hp', 'maxHp', 'level', 'phase', 'bossHp']) need(hud, f);
        out.elapsedMs = hud.elapsedMs;
        out.hp = hud.hp;
        out.maxHp = hud.maxHp;
        out.level = hud.level;
        out.phase = hud.phase;
        out.bossHp = hud.bossHp;
      }
      out.fps = game.loop.actualFps;
      const g = out.result ? null : sm.getScene('Game');
      let torn = false;
      try {
        if (g && g.enemies) {
          out.alive = need(g, 'enemies.liveCount');
          out.shotHpLost = need(g, 'enemyShotReport.hpLost');
          const br = g.bossReport; // null until a boss is up
          if (br && br.slam && br.volley)
            out.boss = { slam: br.slam.hpLost, volley: br.volley.hpLost };
        } else out.alive = 0;
      } catch (e) {
        // The Game scene is torn down as a run ends; a missing field then is not a rename.
        if (!sm.isActive('Game') || sm.isActive('Result')) torn = true;
        else throw e;
      }
      out.torn = torn;
      if (window.__bot) {
        out.botHpLost = window.__bot.hpLost;
        out.botMoved = window.__bot.moved;
        out.botSteps = window.__bot.steps;
        out.botDashes = window.__bot.dashes;
        out.botDashes = window.__bot.dashes;
        if (window.__bot.missing) out.missing = window.__bot.missing;
      }
      if (out.levelUp) {
        const lu = sm.getScene('LevelUp');
        out.cards = need(lu, 'view.cards').map((c) => ({ kind: c.kind, id: c.id }));
      }
      if (out.result) {
        const rs = sm.getScene('Result').summary;
        if (rs) out.summary = rs;
      }
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      if (!msg.startsWith('sweep: game field missing')) throw e;
      out.missing = msg;
    }
    return out;
  })();
}
