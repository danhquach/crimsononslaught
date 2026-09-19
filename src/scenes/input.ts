import Phaser from 'phaser';
import { menuStep, pressedEdges, stickVector, wrapIndex, type MenuInputState } from '../core/input';
import { audioOf } from '../render/audio';

/**
 * Shared Phaser-side input helper. The math lives in `core/input.ts`; this file
 * only reads Phaser's gamepad state and drives menu selection with it.
 */

/**
 * The first connected gamepad, or `undefined` with none.
 *
 * Read fresh every frame rather than cached at create time, so a pad plugged in
 * mid-run starts working without a reload. The list is scanned rather than
 * taking `getPad(0)`, which looks a pad up by the index the browser gave it and
 * so misses the only pad when that index is not 0. Disconnected pads are
 * skipped defensively: Phaser keeps an unplugged pad in the list holding the
 * axis values it had at the time, which would otherwise drive the player after
 * a controller is pulled out mid-push.
 *
 * Requires `input: { gamepad: true }` in the game config.
 */
export function firstPad(scene: Phaser.Scene): Phaser.Input.Gamepad.Gamepad | undefined {
  return scene.input.gamepad?.getAll().find((pad) => pad.connected);
}

/** One selectable thing in a menu: a spell card, a perk card, a button. */
export interface MenuItem {
  /** Draw this item as selected or not. */
  setSelected(selected: boolean): void;
  /** Act on it, exactly as a click would. */
  confirm(): void;
}

/**
 * Gamepad navigation for menus and overlays (spec §5): D-pad or left stick
 * changes the selection, A confirms it.
 *
 * Mouse and keyboard stay primary — nothing is highlighted until a pad is
 * actually used, and the press that first wakes the pad only reveals the
 * highlight rather than confirming, so a controller can never fire a menu item
 * the player has not seen selected.
 *
 * Polls on the scene's update event, so scenes need no `update` of their own,
 * and unhooks itself on shutdown.
 */
export function attachMenuInput(scene: Phaser.Scene, items: readonly MenuItem[]): void {
  if (items.length === 0) return;

  let selected = -1;
  // Previous poll, for edge detection. Null until a pad is seen: the first poll
  // after a connect only takes a baseline, so a button already held down when
  // the pad appears is not read as a fresh press.
  let prev: MenuInputState | null = null;

  // The move cue plays here (CO-102) and the confirm cue in the action each
  // item runs, so a click, a key and a pad press through the same action all
  // sound once.
  const audio = audioOf(scene);
  const select = (index: number): void => {
    if (index !== selected) audio.play('ui.move');
    selected = index;
    items.forEach((item, i) => item.setSelected(i === selected));
  };

  const poll = (): void => {
    const pad = firstPad(scene);
    if (!pad) {
      prev = null;
      return;
    }
    const curr = readMenuState(pad);
    if (prev === null) {
      prev = curr;
      return;
    }
    const pressed = pressedEdges(prev, curr);
    prev = curr;

    const step = menuStep(pressed);
    if (step !== 0) {
      select(selected < 0 ? 0 : wrapIndex(selected, step, items.length));
      return;
    }
    if (pressed.confirm) {
      if (selected < 0) select(0);
      else items[selected]?.confirm();
    }
  };

  scene.events.on(Phaser.Scenes.Events.UPDATE, poll);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, poll);
  });
}

function readMenuState(pad: Phaser.Input.Gamepad.Gamepad): MenuInputState {
  const stick = stickVector(pad.leftStick.x, pad.leftStick.y);
  return {
    up: pad.up || stick.y < 0,
    down: pad.down || stick.y > 0,
    left: pad.left || stick.x < 0,
    right: pad.right || stick.x > 0,
    confirm: pad.A,
  };
}
