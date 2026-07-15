'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  DEFAULT_WINDOW_STATE,
  loadWindowState,
  normalizeWindowState,
  saveWindowState
} = require('../electron/window-state.cjs');

const primary = {
  id: 1,
  workArea: { x: 0, y: 25, width: 1440, height: 875 }
};
const leftDisplay = {
  id: 2,
  workArea: { x: -1280, y: 0, width: 1280, height: 800 }
};

test('places a new companion at the bottom-right of the primary work area', () => {
  const state = normalizeWindowState(DEFAULT_WINDOW_STATE, [primary, leftDisplay]);

  assert.deepEqual(
    { x: state.x, y: state.y, width: state.width, height: state.height },
    { x: 996, y: 156, width: 420, height: 720 }
  );
});

test('restores and clamps a saved position on a secondary display', () => {
  const state = normalizeWindowState(
    { ...DEFAULT_WINDOW_STATE, x: -1100, y: 400 },
    [primary, leftDisplay]
  );

  assert.equal(state.x, -1100);
  assert.equal(state.y, 80);
});

test('moves an off-screen saved window back to the primary display', () => {
  const state = normalizeWindowState(
    { ...DEFAULT_WINDOW_STATE, x: 9000, y: 9000 },
    [primary, leftDisplay]
  );

  assert.equal(state.x, 996);
  assert.equal(state.y, 156);
});

test('atomically persists position and shell preferences', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-spirit-state-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const statePath = path.join(directory, 'window-state.json');

  saveWindowState(statePath, {
    x: 123.6,
    y: 77.2,
    clickThrough: true,
    alwaysOnTop: false,
    idleMotion: false,
    idleMessages: false,
    voice: true
  });

  const restored = loadWindowState(statePath, DEFAULT_WINDOW_STATE);
  assert.equal(restored.x, 124);
  assert.equal(restored.y, 77);
  assert.equal(restored.clickThrough, true);
  assert.equal(restored.alwaysOnTop, false);
  assert.equal(restored.idleMotion, false);
  assert.equal(restored.idleMessages, false);
  assert.equal(restored.voice, true);
  assert.deepEqual(fs.readdirSync(directory), ['window-state.json']);
});

test('uses defaults when the state file contains invalid JSON', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-spirit-invalid-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const statePath = path.join(directory, 'window-state.json');
  fs.writeFileSync(statePath, '{not-json', 'utf8');

  assert.deepEqual(loadWindowState(statePath, DEFAULT_WINDOW_STATE), DEFAULT_WINDOW_STATE);
});

test('uses defaults when valid JSON is not an object', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-spirit-null-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const statePath = path.join(directory, 'window-state.json');
  fs.writeFileSync(statePath, 'null', 'utf8');

  assert.deepEqual(loadWindowState(statePath, DEFAULT_WINDOW_STATE), DEFAULT_WINDOW_STATE);
});
