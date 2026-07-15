'use strict';

const assert = require('node:assert/strict');

async function main() {
  const targets = await fetch('http://127.0.0.1:9224/json/list').then((response) => response.json());
  const target = targets.find((item) => item.type === 'page');
  if (!target) throw new Error('Electron renderer target was not found.');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 0;

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const handlers = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) handlers.reject(new Error(message.error.message));
    else handlers.resolve(message.result);
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };

  const dispatchDrag = async ({ button = 'left', modifiers = 0, startX, startY, endX, endY, screenX, screenY }) => {
    const buttonMask = button === 'right' ? 2 : 1;
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: startX, y: startY, screenX, screenY,
      button, buttons: buttonMask, clickCount: 1, modifiers
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: endX, y: endY,
      screenX: screenX + endX - startX, screenY: screenY + endY - startY,
      button, buttons: buttonMask, modifiers
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: endX, y: endY,
      screenX: screenX + endX - startX, screenY: screenY + endY - startY,
      button, buttons: 0, clickCount: 1, modifiers
    });
  };

  await send('Runtime.enable');
  await evaluate(`(() => {
    document.querySelector('.controls-panel button[aria-label="关闭动作面板"]')?.click();
    document.querySelector('.settings-panel button[aria-label="关闭设置"]')?.click();
  })()`);
  await evaluate(`new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const state = document.querySelector('.character-model')?.dataset.modelState;
      if (state === 'ready') { clearInterval(timer); resolve(true); }
      if (state === 'error' || Date.now() - started > 15000) {
        clearInterval(timer); reject(new Error('3D model did not become ready: ' + state));
      }
    }, 100);
  })`);

  const ready = await evaluate(`({
    modelState: document.querySelector('.character-model')?.dataset.modelState,
    canvasWidth: document.querySelector('.character-canvas')?.width,
    canvasHeight: document.querySelector('.character-canvas')?.height,
    x: window.screenX,
    y: window.screenY,
    rotation: Number(document.querySelector('.character-hitbox')?.dataset.rotationDegrees)
  })`);
  assert.equal(ready.modelState, 'ready');
  assert.ok(ready.canvasWidth > 0 && ready.canvasHeight > 0, 'WebGL canvas should be sized.');

  const startX = 180;
  const startY = 390;
  await dispatchDrag({
    startX, startY, endX: 280, endY: startY,
    screenX: ready.x + startX, screenY: ready.y + startY
  });
  await new Promise((resolve) => setTimeout(resolve, 180));
  const rotated = await evaluate(`({
    x: window.screenX,
    y: window.screenY,
    rotation: Number(document.querySelector('.character-hitbox')?.dataset.rotationDegrees)
  })`);
  const expectedRotation = (ready.rotation + 72) % 360;
  const rotationError = Math.abs(((rotated.rotation - expectedRotation + 540) % 360) - 180);
  assert.ok(rotationError <= 2, 'Left drag should rotate continuously by about 72 degrees.');
  assert.deepEqual({ x: rotated.x, y: rotated.y }, { x: ready.x, y: ready.y }, 'Rotation must not move the window.');

  await dispatchDrag({
    modifiers: 8,
    startX, startY, endX: startX + 20, endY: startY,
    screenX: rotated.x + startX, screenY: rotated.y + startY
  });
  await new Promise((resolve) => setTimeout(resolve, 180));
  const moved = await evaluate('({ x: window.screenX, y: window.screenY })');
  assert.equal(moved.x, rotated.x + 20, 'Shift + drag should move the native window.');

  const edgeBefore = await evaluate('({ x: window.screenX, y: window.screenY })');
  await evaluate('window.desktopSpirit.moveWindowBy(800, 0)');
  await new Promise((resolve) => setTimeout(resolve, 120));
  const edgeAfter = await evaluate('({ x: window.screenX, y: window.screenY })');
  assert.ok(edgeAfter.x > edgeBefore.x + 100, 'Window movement should continue beyond the screen edge clamp.');
  await evaluate('window.desktopSpirit.moveWindowBy(-800, 0)');

  const modelRectBefore = await evaluate(`(() => {
    const rect = document.querySelector('.character-model')?.getBoundingClientRect();
    return rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  })()`);
  await evaluate(`document.querySelector('button[aria-label="互动动作"]')?.click()`);
  await evaluate(`[...document.querySelectorAll('.action-grid button')].find((button) => button.textContent.includes('展示'))?.click()`);
  await new Promise((resolve) => setTimeout(resolve, 140));
  const action = await evaluate(`({
    action: document.querySelector('.character-model')?.dataset.action,
    panelClosed: !document.querySelector('.controls-panel'),
    rect: (() => {
      const rect = document.querySelector('.character-model')?.getBoundingClientRect();
      return rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })()
  })`);
  assert.equal(action.action, 'inspect');
  assert.equal(action.panelClosed, true);
  for (const key of ['x', 'y', 'width', 'height']) {
    assert.ok(
      Math.abs(action.rect[key] - modelRectBefore[key]) < 0.25,
      `3D action must keep ${key} anchored within subpixel tolerance.`
    );
  }

  await evaluate(`document.querySelector('button[aria-label="打开设置"]')?.click()`);
  const settings = await evaluate(`({
    hasTrayMenuFallback: [...document.querySelectorAll('.settings-panel button')].some((button) => button.textContent.includes('打开系统菜单')),
    hasQuit: [...document.querySelectorAll('.settings-panel button')].some((button) => button.textContent.includes('退出桌面精灵'))
  })`);
  assert.equal(settings.hasTrayMenuFallback, true);
  assert.equal(settings.hasQuit, true);
  await evaluate(`document.querySelector('.settings-panel button[aria-label="关闭设置"]')?.click()`);

  const codex = await evaluate('window.desktopSpirit.getCodexStatus()');
  assert.equal(typeof codex.available, 'boolean');
  assert.match(codex.progressFile, /desktop-spirit-progress\.json$/);

  socket.close();
  process.stdout.write(`${JSON.stringify({ ready, rotated, moved, edgeBefore, edgeAfter, action, settings, codexAvailable: codex.available }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
