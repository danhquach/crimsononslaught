import { describe, expect, it } from 'vitest';
import { ANIMATIONS, FACINGS } from '../config/animations';
import { BOSS } from '../config/boss';
import { ENEMY_ARCHETYPES, ENEMY_TYPES } from '../config/enemies';
import { FRAMES, FRAME_NAMES, type FrameName } from '../config/frames';
import { CONSUMABLE_KINDS, PICKUP_KINDS } from '../config/pickups';
import {
  DEFAULT_FACING,
  animationDurationMs,
  bodyCentre,
  bodyOffset,
  bossAnimation,
  enemyAnimation,
  facingFromVector,
  frameOrigin,
  gemAnimation,
  headingRotation,
  pickupAnimation,
  heroAnimation,
  type EnemyPhase,
} from './animation';

const NAMES = new Set(ANIMATIONS.map((anim) => anim.name));
const expectClip = (name: string): void => {
  expect(NAMES.has(name), `${name} is an atlas animation`).toBe(true);
};

describe('facingFromVector', () => {
  it('starts facing down', () => {
    expect(DEFAULT_FACING).toBe('down');
  });

  it('keeps the last facing when there is no movement', () => {
    for (const facing of FACINGS) {
      expect(facingFromVector({ x: 0, y: 0 }, facing)).toBe(facing);
    }
  });

  it('follows the dominant axis, y down', () => {
    expect(facingFromVector({ x: 0, y: 1 }, 'up')).toBe('down');
    expect(facingFromVector({ x: 0, y: -1 }, 'down')).toBe('up');
    expect(facingFromVector({ x: 1, y: 0 }, 'down')).toBe('right');
    expect(facingFromVector({ x: -1, y: 0 }, 'down')).toBe('left');
    expect(facingFromVector({ x: 0.2, y: -0.9 }, 'down')).toBe('up');
    expect(facingFromVector({ x: -0.9, y: 0.2 }, 'down')).toBe('left');
  });

  it('treats an exact diagonal as horizontal', () => {
    expect(facingFromVector({ x: 1, y: 1 }, 'down')).toBe('right');
    expect(facingFromVector({ x: -1, y: -1 }, 'down')).toBe('left');
  });
});

describe('headingRotation', () => {
  it('turns art drawn facing up along the velocity', () => {
    expect(headingRotation({ x: 0, y: -1 }, 0)).toBeCloseTo(0);
    expect(headingRotation({ x: 1, y: 0 }, 0)).toBeCloseTo(Math.PI / 2);
    expect(headingRotation({ x: 0, y: 1 }, 0)).toBeCloseTo(Math.PI);
    expect(headingRotation({ x: -1, y: 0 }, 0)).toBeCloseTo(1.5 * Math.PI);
  });

  it('holds the heading when stopped', () => {
    expect(headingRotation({ x: 0, y: 0 }, 1.25)).toBe(1.25);
  });
});

describe('heroAnimation', () => {
  it('idles and walks per facing', () => {
    for (const facing of FACINGS) {
      const idle = heroAnimation({ facing, moving: false, hurt: false, dead: false });
      const walk = heroAnimation({ facing, moving: true, hurt: false, dead: false });
      expect(idle).toBe(`hero.idle.${facing}`);
      expect(walk).toBe(`hero.walk.${facing}`);
      expectClip(idle);
      expectClip(walk);
    }
  });

  it('shows the hurt frame over walking and death over everything', () => {
    const hurt = heroAnimation({ facing: 'left', moving: true, hurt: true, dead: false });
    expect(hurt).toBe('hero.hurt.left');
    expectClip(hurt);
    const dead = heroAnimation({ facing: 'left', moving: true, hurt: true, dead: true });
    expect(dead).toBe('hero.death');
    expectClip(dead);
  });
});

describe('enemyAnimation', () => {
  const PHASES: EnemyPhase[] = ['spawn', 'move', 'hurt', 'death'];

  it('names an atlas clip for every type, phase and facing', () => {
    for (const kind of ENEMY_TYPES) {
      for (const phase of PHASES) {
        for (const facing of FACINGS) {
          expectClip(enemyAnimation({ kind, phase, facing, velocityX: 1 }).name);
        }
      }
    }
  });

  it('walks and flinches the tank per facing, spawns and dies without one', () => {
    expect(enemyAnimation({ kind: 'tank', phase: 'move', facing: 'up', velocityX: 0 })).toEqual({
      name: 'tank.walk.up',
      flipX: false,
    });
    expect(
      enemyAnimation({ kind: 'tank', phase: 'hurt', facing: 'right', velocityX: 0 }).name,
    ).toBe('tank.hurt.right');
    expect(
      enemyAnimation({ kind: 'tank', phase: 'death', facing: 'left', velocityX: 0 }).name,
    ).toBe('tank.death');
    expect(
      enemyAnimation({ kind: 'tank', phase: 'spawn', facing: 'left', velocityX: 0 }).name,
    ).toBe('tank.spawn');
  });

  it('flips only the swarm, and only when it moves left', () => {
    const swarm = (velocityX: number) =>
      enemyAnimation({ kind: 'swarm', phase: 'move', facing: 'down', velocityX });
    expect(swarm(-30)).toEqual({ name: 'swarm.move', flipX: true });
    expect(swarm(30)).toEqual({ name: 'swarm.move', flipX: false });
    expect(swarm(0).flipX).toBe(false);
    expect(enemyAnimation({ kind: 'fast', phase: 'move', facing: 'down', velocityX: -30 })).toEqual(
      {
        name: 'fast.move',
        flipX: false,
      },
    );
  });
});

describe('bossAnimation', () => {
  it('walks, telegraphs and charges per facing', () => {
    for (const facing of FACINGS) {
      const walk = bossAnimation({ phase: 'chase', facing, hurt: false, dead: false });
      const telegraph = bossAnimation({ phase: 'telegraph', facing, hurt: false, dead: false });
      const charge = bossAnimation({ phase: 'charge', facing, hurt: false, dead: false });
      expect(walk).toBe(`boss.walk.${facing}`);
      expect(telegraph).toBe(`boss.telegraph.${facing}`);
      expect(charge).toBe(`boss.charge.${facing}`);
      expectClip(walk);
      expectClip(telegraph);
      expectClip(charge);
    }
  });

  it('flinches only while chasing: the telegraph must stay visible', () => {
    const hurt = bossAnimation({ phase: 'chase', facing: 'down', hurt: true, dead: false });
    expect(hurt).toBe('boss.hurt.down');
    expectClip(hurt);
    expect(bossAnimation({ phase: 'telegraph', facing: 'down', hurt: true, dead: false })).toBe(
      'boss.telegraph.down',
    );
    expect(bossAnimation({ phase: 'charge', facing: 'down', hurt: true, dead: false })).toBe(
      'boss.charge.down',
    );
  });

  it('dies over anything else', () => {
    expect(bossAnimation({ phase: 'telegraph', facing: 'up', hurt: true, dead: true })).toBe(
      'boss.death',
    );
    expectClip('boss.death');
  });
});

describe('gemAnimation', () => {
  it('idles, drifts in range, bursts when collected', () => {
    expect(gemAnimation({ drifting: false, collected: false })).toBe('gem.idle');
    expect(gemAnimation({ drifting: true, collected: false })).toBe('gem.drift');
    expect(gemAnimation({ drifting: true, collected: true })).toBe('gem.pickup');
    for (const name of ['gem.idle', 'gem.drift', 'gem.pickup']) expectClip(name);
  });
});

describe('pickupAnimation', () => {
  it('idles on the floor and bursts when collected, by kind', () => {
    expect(pickupAnimation({ kind: 'ember', consumable: 'health', collected: false })).toBe(
      'pickupEmber.idle',
    );
    expect(pickupAnimation({ kind: 'relic', consumable: 'health', collected: true })).toBe(
      'pickupRelic.pickup',
    );
  });

  it('draws a consumable as its own kind, never as another', () => {
    for (const consumable of CONSUMABLE_KINDS) {
      const idle = pickupAnimation({ kind: 'consumable', consumable, collected: false });
      expect(idle).toMatch(
        new RegExp(`^pickup${consumable[0]?.toUpperCase()}${consumable.slice(1)}\\.idle$`),
      );
    }
  });

  it('names only clips the atlas has, for every kind and state', () => {
    for (const kind of PICKUP_KINDS) {
      for (const consumable of CONSUMABLE_KINDS) {
        for (const collected of [false, true]) {
          expectClip(pickupAnimation({ kind, consumable, collected }));
        }
      }
    }
  });
});

describe('animationDurationMs', () => {
  it('is frames over frame rate', () => {
    // hero.death: 6 frames at 8 fps.
    expect(animationDurationMs('hero.death')).toBe(750);
    // boss.death: 8 frames at 8 fps.
    expect(animationDurationMs('boss.death')).toBe(1000);
    // swarm.hurt: 1 frame at 10 fps — the 0.1 s hurt flash.
    expect(animationDurationMs('swarm.hurt')).toBe(100);
  });

  it('is 0 for a clip the atlas does not have', () => {
    expect(animationDurationMs('hero.teleport')).toBe(0);
  });
});

describe('body placement (CO-081)', () => {
  const RADII = {
    player: 14,
    ...Object.fromEntries(ENEMY_TYPES.map((t) => [t, ENEMY_ARCHETYPES[t].radius])),
    boss: BOSS.radius,
    gem: 6,
  };

  it('puts the origin on the frame anchor', () => {
    const origin = frameOrigin({ w: 40, h: 20, anchorX: 10, anchorY: 15, page: 'props' });
    expect(origin).toEqual({ x: 0.25, y: 0.75 });
  });

  it('centres the circle body on the anchor', () => {
    expect(bodyOffset({ w: 40, h: 20, anchorX: 10, anchorY: 15, page: 'props' }, 4)).toEqual({
      x: 6,
      y: 11,
    });
  });

  it('keeps the body centre on the sprite position for every frame and entity radius', () => {
    const position = { x: 123.5, y: -42 };
    for (const name of FRAME_NAMES) {
      for (const [entity, radius] of Object.entries(RADII)) {
        const centre = bodyCentre(position, FRAMES[name], radius);
        expect(centre.x, `${name} ${entity} x`).toBeCloseTo(position.x, 9);
        expect(centre.y, `${name} ${entity} y`).toBeCloseTo(position.y, 9);
      }
    }
  });

  it('cuts every clip from frames of one size and anchor, so placing per clip is enough', () => {
    for (const anim of ANIMATIONS) {
      const first = FRAMES[anim.frames[0] as FrameName];
      for (const frame of anim.frames) {
        expect(FRAMES[frame], `${anim.name} ${frame}`).toEqual(first);
      }
    }
  });
});
