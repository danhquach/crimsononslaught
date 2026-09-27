import { Projectile } from './Projectile';

/**
 * A ranged enemy's shot in flight (#126): a `Projectile` that also carries the
 * damage it deals the player, set as it is fired, since that is scaled by the
 * wave that spawned the shooter. Pooled by `systems/EnemyShotPool.ts`.
 */
export class EnemyShot extends Projectile {
  damage = 0;
}
