import Phaser from 'phaser';
import {
  PAD_BUTTON,
  buttonEdge,
  menuStep,
  pressedEdges,
  stickVector,
  wrapIndex,
  type DirectionState,
  type PadButton,
  type MenuInputState,
} from '../core/input';
import { isConfirmKey } from '../core/resultModel';
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

export interface MenuInputOptions {
  /**
   * Arrow keys move the selection and Enter confirms it too (#121). An arrow
   * wakes the highlight like a pad does, and so does Enter with nothing
   * highlighted — unless the menu names an `enterDefault`.
   */
  keyboard?: boolean;
  /**
   * The item Enter confirms while nothing is highlighted, for a menu whose
   * first item is a safe default (Intro's Start, a lone Back). Left out where
   * the first item changes something, so a reflex Enter only shows the
   * highlight.
   */
  enterDefault?: number;
  /** The item highlighted from the start, for a screen that returns to the row that opened it (#383). */
  initial?: number;
}

/** The direction each arrow key presses. */
const ARROW_DIRECTION: Readonly<Record<string, keyof DirectionState>> = {
  ArrowUp: 'up',
  ArrowLeft: 'left',
  ArrowDown: 'down',
  ArrowRight: 'right',
};

/** Where a press came from: pad A and Enter wake and confirm a little differently. */
export type NavSource = 'pad' | 'keyboard';

/**
 * Fresh presses from the first pad and, with `keyboard`, the arrow keys and
 * Enter, as one `MenuInputState` of edges per press. `attachMenuInput` steps a
 * list with it; the pause screen (CO-179) walks its own layout.
 *
 * Polls on the scene's update event, so scenes need no `update` of their own,
 * and unhooks itself on shutdown.
 */
export function attachNavInput(
  scene: Phaser.Scene,
  onPress: (pressed: MenuInputState, source: NavSource) => void,
  options: { keyboard?: boolean } = {},
): void {
  // Previous poll, for edge detection. Null until a pad is seen: the first poll
  // after a connect only takes a baseline, so a button already held down when
  // the pad appears is not read as a fresh press.
  let prev: MenuInputState | null = null;

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
    if (pressed.up || pressed.down || pressed.left || pressed.right || pressed.confirm) {
      onPress(pressed, 'pad');
    }
  };

  // The scene's keyboard plugin drops its listeners on shutdown, as every
  // other menu's `keydown` handler relies on. It also re-walks the frame's
  // whole event queue on every DOM event and again on the frame update, and
  // its duplicate check only looks one event back, so a key pressed and
  // released inside one frame reaches this handler more than once. The other
  // menus' handlers are idempotent; a selection step is not, so each event is
  // handled once.
  if (options.keyboard) {
    const handled = new WeakSet<KeyboardEvent>();
    scene.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (handled.has(event)) return;
      handled.add(event);
      const dir = Object.hasOwn(ARROW_DIRECTION, event.key)
        ? ARROW_DIRECTION[event.key]
        : undefined;
      const confirm = dir === undefined && isConfirmKey(event.key);
      if (dir === undefined && !confirm) return;
      const pressed = { up: false, down: false, left: false, right: false, confirm };
      if (dir) pressed[dir] = true;
      onPress(pressed, 'keyboard');
    });
  }

  scene.events.on(Phaser.Scenes.Events.UPDATE, poll);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, poll);
  });
}

/**
 * Gamepad navigation for menus and overlays (spec §5): D-pad or left stick
 * changes the selection, A confirms it. With `keyboard`, the arrow keys and
 * Enter drive the same selection.
 *
 * Mouse and keyboard stay primary — nothing is highlighted until a pad is
 * actually used, and the press that first wakes the pad only reveals the
 * highlight rather than confirming, so a controller can never fire a menu item
 * the player has not seen selected.
 */
export function attachMenuInput(
  scene: Phaser.Scene,
  items: readonly MenuItem[],
  options: MenuInputOptions = {},
): void {
  if (items.length === 0) return;

  let selected = options.initial ?? -1;
  items[selected]?.setSelected(true);

  // The move cue plays here (CO-102) and the confirm cue in the action each
  // item runs, so a click, a key and a pad press through the same action all
  // sound once.
  const audio = audioOf(scene);
  const select = (index: number): void => {
    if (index !== selected) audio.play('ui.move');
    selected = index;
    items.forEach((item, i) => item.setSelected(i === selected));
  };

  attachNavInput(
    scene,
    (pressed, source) => {
      const step = menuStep(pressed);
      if (step !== 0) {
        select(selected < 0 ? 0 : wrapIndex(selected, step, items.length));
        return;
      }
      if (!pressed.confirm) return;
      const target =
        selected >= 0 ? selected : source === 'keyboard' ? options.enterDefault : undefined;
      if (target === undefined) select(0);
      else items[target]?.confirm();
    },
    { keyboard: options.keyboard },
  );
}

export interface StartButtonWatch {
  /** True on the poll where the button goes down; call once a step. */
  pressed(): boolean;
  /** Take a fresh baseline, as after a stretch of not polling. */
  reset(): void;
}

/**
 * A pad button as a press edge, polled by its scene (#252 Start, #384 A). Like
 * `attachMenuInput`, the first poll after a connect only takes a baseline, so
 * a button still held from the press that opened a screen does not fire again.
 *
 * After a `reset` the first poll is skipped as well (CO-179). Phaser refreshes
 * a scene's pads after the scenes update, so a scene's first update after a
 * resume still reads the pad as it was before it paused. Taken as the
 * baseline, that stale state made the Start that resumed a pause opened with
 * Esc read as a fresh press one frame later, and the pause opened again. The
 * same holds for the A that confirmed a level-up card and would dash.
 *
 * The skip alone was not enough on a slow machine (#384, CI): several Game
 * steps can run before Phaser refreshes the pad, so a held A read up and then
 * down, and dashed. The button is therefore read from the browser's live pad.
 */
export function watchPadButton(scene: Phaser.Scene, button: PadButton): StartButtonWatch {
  const edge = buttonEdge();
  let stale = false;
  return {
    pressed: () => {
      const pad = firstPad(scene);
      if (!pad || stale) {
        edge.reset();
        stale = false;
        return false;
      }
      return edge.step(livePressed(pad, PAD_BUTTON[button]));
    },
    reset: () => {
      edge.reset();
      stale = true;
    },
  };
}

/** Whether `index` is down on `pad` now, per the browser; Phaser's copy as a fallback. */
function livePressed(pad: Phaser.Input.Gamepad.Gamepad, index: number): boolean {
  const live = typeof navigator === 'undefined' ? null : navigator.getGamepads?.()[pad.index];
  return (live ?? pad).buttons[index]?.pressed ?? false;
}

/** Pad Start as a press edge (#252: it toggles the pause screen). */
export function watchStartButton(scene: Phaser.Scene): StartButtonWatch {
  return watchPadButton(scene, 'START');
}

/**
 * Pad face and shoulder buttons as press edges (#377): B goes back, LB and RB
 * flip tabs, X and Y act on the level-up row. One tracker per bound button,
 * polled on the scene's update event and unhooked on shutdown. A fresh scene
 * baselines on its first poll, so a B still held from the screen before does
 * not fire again here. `reset` re-baselines, for a scene that resumes.
 */
export function attachPadButtons(
  scene: Phaser.Scene,
  handlers: Partial<Record<PadButton, () => void>>,
): { reset(): void } {
  const bound = (Object.keys(handlers) as PadButton[]).map((name) => ({
    index: PAD_BUTTON[name],
    handler: handlers[name],
    edge: buttonEdge(),
  }));

  const poll = (): void => {
    const pad = firstPad(scene);
    for (const { index, handler, edge } of bound) {
      const down = pad ? (pad.buttons[index]?.pressed ?? false) : undefined;
      if (edge.step(down)) handler?.();
    }
  };

  scene.events.on(Phaser.Scenes.Events.UPDATE, poll);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, poll);
  });
  return { reset: () => bound.forEach(({ edge }) => edge.reset()) };
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
