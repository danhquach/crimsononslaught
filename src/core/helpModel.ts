import type { TextureKey } from '../config/colors';
import type { EnemyType } from '../config/enemies';
import { GEM_XP_VALUE } from '../config/gems';
import { CURRENCY_NAME } from '../config/meta';
import {
  BOMB_DAMAGE,
  BOSS_EMBERS,
  CHEST_EMBERS,
  CONSUMABLE_TEXTURES,
  ELITE_CHEST_CHANCE,
  EMBER_DROPS,
  HEAL_AMOUNT,
  MAGNET_DURATION_MS,
  PICKUP_TEXTURES,
  RELIC_COUNT,
} from '../config/pickups';
import { MAX_OFFER_SIZE } from './levelUp';

/**
 * View-model behind the Help screen's Pickups tab (#226): one row per thing on
 * the floor, in the order the ticket lists them. Every number is read from the
 * config the pickups themselves use, so a retune changes the Help text too.
 * Pure TS, unit-tested; the scene only lays the strings out.
 */

export interface PickupHelpRow {
  /** Idle clip the row's icon plays (`config/animations.ts`). */
  clip: string;
  /** Placeholder texture the icon shows when the atlas did not load. */
  texture: TextureKey;
  name: string;
  /** Where it comes from. */
  source: string;
  /** What it does. */
  effect: string;
}

const RARE_DROP = 'rare drop from a regular kill';

/** `a`, `a and b`, `a, b and c`. */
function listOf(words: readonly string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** "some swarm and fast kills; every tank kill (worth 3); 100 from the boss", from `EMBER_DROPS`. */
function emberSource(): string {
  const types = Object.keys(EMBER_DROPS) as EnemyType[];
  const worth = (type: EnemyType): string => {
    const { value } = EMBER_DROPS[type];
    return value > 1 ? ` (worth ${value})` : '';
  };
  const parts: string[] = [];
  const some = types.filter((type) => EMBER_DROPS[type].chance < 1);
  if (some.length > 0) parts.push(`some ${listOf(some)} kills`);
  for (const type of types.filter((t) => EMBER_DROPS[t].chance >= 1)) {
    parts.push(`every ${type} kill${worth(type)}`);
  }
  parts.push(`${BOSS_EMBERS} from the boss`);
  return parts.join('; ');
}

export function pickupHelpRows(): PickupHelpRow[] {
  const embers = CURRENCY_NAME;
  return [
    {
      clip: 'gem.idle',
      texture: 'gem',
      name: 'XP gem',
      source: 'every kill',
      effect: `${GEM_XP_VALUE} XP; drifts to you once it is inside your pickup range`,
    },
    {
      clip: 'pickupEmber.idle',
      texture: PICKUP_TEXTURES.ember,
      name: 'Ember',
      source: emberSource(),
      effect: `${embers} are kept when the run ends, win or lose, and spent on upgrades`,
    },
    {
      clip: 'pickupHealth.idle',
      texture: CONSUMABLE_TEXTURES.health,
      name: 'Health',
      source: RARE_DROP,
      effect: `restores ${HEAL_AMOUNT} HP, up to your max HP`,
    },
    {
      clip: 'pickupMagnet.idle',
      texture: CONSUMABLE_TEXTURES.magnet,
      name: 'Magnet',
      source: RARE_DROP,
      effect: `pulls every XP gem on the map to you for ${MAGNET_DURATION_MS / 1000} s (not the Magnet passive)`,
    },
    {
      clip: 'pickupBomb.idle',
      texture: CONSUMABLE_TEXTURES.bomb,
      name: 'Bomb',
      source: RARE_DROP,
      effect: `hits every enemy on screen for ${BOMB_DAMAGE} damage; the boss is spared`,
    },
    {
      clip: 'pickupChest.idle',
      texture: CONSUMABLE_TEXTURES.chest,
      name: 'Chest',
      source: ELITE_CHEST_CHANCE >= 1 ? 'every elite kill' : 'some elite kills',
      effect: `pays ${CHEST_EMBERS} ${embers}`,
    },
    {
      clip: 'pickupRelic.idle',
      texture: PICKUP_TEXTURES.relic,
      name: 'Relic',
      source: `${RELIC_COUNT} placed round the arena at run start`,
      effect: `pick 1 of ${MAX_OFFER_SIZE}: a buff for the rest of the run (buffs stack), or more Rerolls or Bans`,
    },
  ];
}
