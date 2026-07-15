'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_WINDOW_STATE = Object.freeze({
  width: 420,
  height: 720,
  margin: 24,
  clickThrough: false,
  alwaysOnTop: true,
  idleMotion: true,
  idleMessages: true,
  voice: false,
  codexEnabled: true,
  codexNotifications: true
});

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function loadWindowState(filePath, defaults = DEFAULT_WINDOW_STATE) {
  let parsed = {};

  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT' && error.name !== 'SyntaxError') {
      throw error;
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    parsed = {};
  }

  const state = { ...defaults };

  if (isFiniteNumber(parsed.x)) state.x = Math.round(parsed.x);
  if (isFiniteNumber(parsed.y)) state.y = Math.round(parsed.y);
  if (typeof parsed.clickThrough === 'boolean') state.clickThrough = parsed.clickThrough;
  if (typeof parsed.alwaysOnTop === 'boolean') state.alwaysOnTop = parsed.alwaysOnTop;
  if (typeof parsed.idleMotion === 'boolean') state.idleMotion = parsed.idleMotion;
  if (typeof parsed.idleMessages === 'boolean') state.idleMessages = parsed.idleMessages;
  if (typeof parsed.voice === 'boolean') state.voice = parsed.voice;
  if (typeof parsed.codexEnabled === 'boolean') state.codexEnabled = parsed.codexEnabled;
  if (typeof parsed.codexNotifications === 'boolean') state.codexNotifications = parsed.codexNotifications;

  return state;
}

function saveWindowState(filePath, state) {
  const directory = path.dirname(filePath);
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const serializable = {
    x: Math.round(state.x),
    y: Math.round(state.y),
    clickThrough: Boolean(state.clickThrough),
    alwaysOnTop: Boolean(state.alwaysOnTop),
    idleMotion: Boolean(state.idleMotion),
    idleMessages: Boolean(state.idleMessages),
    voice: Boolean(state.voice),
    codexEnabled: Boolean(state.codexEnabled),
    codexNotifications: Boolean(state.codexNotifications)
  };

  fs.mkdirSync(directory, { recursive: true });

  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(serializable, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    });
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // The temporary file might not have been created.
    }
    throw error;
  }
}

function intersectionArea(first, second) {
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);

  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function clamp(value, minimum, maximum) {
  if (maximum < minimum) return minimum;
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizeWindowState(
  savedState,
  displays,
  defaults = DEFAULT_WINDOW_STATE
) {
  const width = defaults.width;
  const height = defaults.height;
  const margin = defaults.margin ?? 24;
  const usableDisplays = displays.filter(
    (display) => display && display.workArea && isFiniteNumber(display.workArea.x)
  );

  if (usableDisplays.length === 0) {
    return {
      ...savedState,
      width,
      height,
      x: isFiniteNumber(savedState.x) ? savedState.x : 0,
      y: isFiniteNumber(savedState.y) ? savedState.y : 0
    };
  }

  const hasSavedPosition = isFiniteNumber(savedState.x) && isFiniteNumber(savedState.y);
  const requestedBounds = {
    x: hasSavedPosition ? Math.round(savedState.x) : 0,
    y: hasSavedPosition ? Math.round(savedState.y) : 0,
    width,
    height
  };

  let targetDisplay = usableDisplays[0];

  if (hasSavedPosition) {
    let largestIntersection = 0;

    for (const display of usableDisplays) {
      const area = intersectionArea(requestedBounds, display.workArea);
      if (area > largestIntersection) {
        largestIntersection = area;
        targetDisplay = display;
      }
    }

    if (largestIntersection > 0) {
      const workArea = targetDisplay.workArea;
      return {
        ...savedState,
        width,
        height,
        x: clamp(requestedBounds.x, workArea.x, workArea.x + workArea.width - width),
        y: clamp(requestedBounds.y, workArea.y, workArea.y + workArea.height - height)
      };
    }
  }

  const workArea = targetDisplay.workArea;

  return {
    ...savedState,
    width,
    height,
    x: Math.max(workArea.x, workArea.x + workArea.width - width - margin),
    y: Math.max(workArea.y, workArea.y + workArea.height - height - margin)
  };
}

module.exports = {
  DEFAULT_WINDOW_STATE,
  intersectionArea,
  loadWindowState,
  normalizeWindowState,
  saveWindowState
};
