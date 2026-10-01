import type Phaser from 'phaser';
import { readControls, writeControls, type Controls } from '../core/controls';
import { SAVE_REGISTRY_KEY } from '../core/scenePayloads';
import { emptySave, isSave, serializeSave, type Save } from '../core/save';
import { storeSaveJson } from '../storage/localSave';

/**
 * The Phaser side of the rebindable controls (CO-226): the bindings as the
 * saved settings hold them, the flag that tells every other listener a rebind
 * is waiting for a key, and the set of keys held right now. The rules live in
 * `core/controls.ts`.
 */

/** Registry flag Settings sets while it waits for a key or button, so no other listener acts on that press. */
export const CONTROLS_CAPTURE_REGISTRY_KEY = 'controlsCapture';

/** The bindings in the registry's save; scenes read them once in `create` and again on a resume. */
export function controlsOf(scene: Phaser.Scene): Controls {
  const stored: unknown = scene.registry.get(SAVE_REGISTRY_KEY);
  return readControls(isSave(stored) ? stored.settings : {});
}

/** The registry's save and storage both take the bindings, so they hold now and next launch. */
export function storeControls(scene: Phaser.Scene, controls: Controls): void {
  const stored: unknown = scene.registry.get(SAVE_REGISTRY_KEY);
  const base: Save = isSave(stored) ? stored : emptySave();
  const updated: Save = { ...base, settings: writeControls(base.settings, controls) };
  scene.registry.set(SAVE_REGISTRY_KEY, updated);
  if (!storeSaveJson(serializeSave(updated))) console.warn('[save] could not store settings');
}

export function isCapturing(registry: Phaser.Data.DataManager): boolean {
  return registry.get(CONTROLS_CAPTURE_REGISTRY_KEY) === true;
}

export function setCapturing(scene: Phaser.Scene, on: boolean): void {
  scene.registry.set(CONTROLS_CAPTURE_REGISTRY_KEY, on);
}

const held = new Set<string>();
let tracking = false;

/**
 * Start listening for held keys. Phaser's polled keys are matched by the
 * deprecated keyCode, which a rebinding to any physical key cannot use, so the
 * player's held directions read this set instead. Called once from Boot; the
 * listeners go on the document, and the set is cleared when the page loses
 * focus so a key released elsewhere is never left held.
 */
export function trackHeldKeys(): void {
  if (tracking || typeof document === 'undefined') return;
  tracking = true;
  document.addEventListener('keydown', (event) => held.add(event.code));
  document.addEventListener('keyup', (event) => held.delete(event.code));
  const clear = (): void => held.clear();
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', clear);
}

/** Whether the key with this `KeyboardEvent.code` is down now. */
export function isKeyHeld(code: string): boolean {
  trackHeldKeys();
  return held.has(code);
}
