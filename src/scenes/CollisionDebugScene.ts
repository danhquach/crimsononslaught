import Phaser from 'phaser';
import { SCENE } from '../core/scenePayloads';
import { Enemy } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { CollisionSystem, type SpellHitbox } from '../systems/CollisionSystem';
import { EnemyPool } from '../systems/EnemyPool';
import { GemPool } from '../systems/GemPool';

/** Small enough that everything is on screen at once; no camera follow, no scroll. */
const WORLD_WIDTH = 960;
const WORLD_HEIGHT = 540;

/** Where the stand-in spell fires from, and how often and how fast it does. */
const MUZZLE_X = 120;
const SPELL_INTERVAL_MS = 500;
const SPELL_SPEED = 400;

/** Gem drop offset on both axes: ~34 px away, inside the 60 px pickup radius. */
const GEM_DROP_OFFSET = 24;

/** Every pair `CollisionSystem` registers, in the order they are listed on screen. */
const PAIRS = ['enemy-player', 'gem-player', 'spell-enemy'] as const;

type Pair = (typeof PAIRS)[number];

const PAIR_LABEL: Readonly<Record<Pair, string>> = {
  'enemy-player': 'enemy <-> player',
  'gem-player': 'gem <-> player',
  'spell-enemy': 'spell <-> enemy',
};

/**
 * Dev-only check for CO-032: every pair `CollisionSystem` registers, firing
 * without a hand on the keyboard. A tank walks into the player, gems lie where
 * the player will be pulled into them, and a stand-in spell hitbox is fired at
 * the enemy on a timer — all three counters tick up and turn green.
 *
 * Reached via `?debug=collisions`; never part of the normal scene flow. It is
 * the only other place that builds a `CollisionSystem`, so it exercises the
 * same wiring the run does.
 */
export class CollisionDebugScene extends Phaser.Scene {
  private player!: Player;
  private enemies!: EnemyPool;
  private gems!: GemPool;
  private spells!: Phaser.Physics.Arcade.Group;
  private readonly hits = new Map<Pair, number>();
  private statusText!: Phaser.GameObjects.Text;
  private sinceShotMs = 0;

  constructor() {
    super(SCENE.collisionDebug);
  }

  create(): void {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.hits.clear();

    this.player = new Player(this, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.enemies = new EnemyPool(this);
    this.gems = new GemPool(this);
    this.spells = this.physics.add.group();

    const collisions = new CollisionSystem(this, this.player, this.enemies, this.gems, {
      onEnemyContact: (enemy) => this.count('enemy-player', enemy.active),
      // Collecting the gem is what proves the pickup path, not just the touch:
      // a gem that stays put would keep re-firing the same overlap.
      onGemPickup: (gem) => this.count('gem-player', this.gems.collect(gem, this.player) > 0),
    });
    collisions.addSpellGroup(this.spells, (enemy, hitbox) => this.onSpellHit(enemy, hitbox));

    // A tank: slow enough to watch, and it survives the contact it makes.
    this.enemies.spawn('tank', WORLD_WIDTH * 0.75, WORLD_HEIGHT / 2);

    this.add
      .text(WORLD_WIDTH / 2, 32, 'Collision pairs (CO-032)', {
        fontFamily: 'monospace',
        fontSize: '24px',
      })
      .setOrigin(0.5);
    this.statusText = this.add
      .text(WORLD_WIDTH / 2, 72, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        align: 'center',
      })
      .setOrigin(0.5, 0);
    this.updateStatus();
  }

  update(_time: number, delta: number): void {
    this.enemies.update(delta, this.player);
    // Gems are dropped inside the pickup radius so they drift in without anyone
    // steering; one at a time, so the counter climbs steadily.
    if (this.gems.liveCount === 0) {
      this.gems.spawn(this.player.x + GEM_DROP_OFFSET, this.player.y + GEM_DROP_OFFSET);
    }
    this.gems.update(delta, this.player);
    this.fireSpell(delta);
    this.cullSpells();
  }

  /** Lob a stand-in hitbox at the enemy on a timer; Epic D will fire real ones. */
  private fireSpell(deltaMs: number): void {
    this.sinceShotMs += deltaMs;
    if (this.sinceShotMs < SPELL_INTERVAL_MS) return;
    this.sinceShotMs = 0;
    const target = this.firstEnemy();
    if (!target) return;
    const shot = this.spells.create(
      MUZZLE_X,
      target.y,
      'proj_fire',
    ) as Phaser.Physics.Arcade.Sprite;
    this.physics.moveTo(shot, target.x, target.y, SPELL_SPEED);
  }

  /** A hitbox that missed would fly forever; Arcade bodies do not expire on their own. */
  private cullSpells(): void {
    for (const child of this.spells.getChildren()) {
      const shot = child as Phaser.Physics.Arcade.Sprite;
      if (shot.active && shot.x > WORLD_WIDTH) shot.destroy();
    }
  }

  private onSpellHit(enemy: Enemy, hitbox: SpellHitbox): void {
    if (!enemy.active) return;
    // The hitbox is spent on the hit, so one shot counts once however many
    // frames it spends inside the enemy.
    hitbox.destroy();
    this.count('spell-enemy', true);
  }

  private firstEnemy(): Enemy | null {
    for (const child of this.enemies.group.getChildren()) {
      if (child instanceof Enemy && child.active) return child;
    }
    return null;
  }

  private count(pair: Pair, happened: boolean): void {
    if (!happened) return;
    this.hits.set(pair, (this.hits.get(pair) ?? 0) + 1);
    this.updateStatus();
  }

  private updateStatus(): void {
    const lines = PAIRS.map((pair) => {
      const count = this.hits.get(pair) ?? 0;
      return `${count > 0 ? 'OK  ' : '... '}${PAIR_LABEL[pair].padEnd(18)} ${count}`;
    });
    this.statusText.setText(lines.join('\n'));
    this.statusText.setColor(this.hits.size === PAIRS.length ? '#8bc34a' : '#cccccc');
  }
}
