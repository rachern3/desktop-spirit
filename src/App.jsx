import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bot,
  Coffee,
  DoorOpen,
  Eye,
  EyeOff,
  GripHorizontal,
  Hand,
  MessageCircle,
  Pin,
  Send,
  Settings2,
  Sparkles,
  Target,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import Spirit3D from "./Spirit3D.jsx";

const DEFAULT_SETTINGS = {
  alwaysOnTop: true,
  clickThrough: false,
  idleMotion: true,
  idleMessages: true,
  voice: false,
  codexEnabled: true,
  codexNotifications: true,
};

const REACTIONS = [
  { text: "我在。需要我陪你梳理一下现在的事情吗？", mood: "attentive" },
  { text: "能量状态稳定。今天也一起把事情做完吧。", mood: "happy" },
  { text: "你已经专注一阵了，记得放松肩颈。", mood: "gentle" },
  { text: "刚才的触碰，我感受到了。", mood: "curious" },
];

const ACTIONS = [
  { id: "wave", poseIndex: 0, label: "挥手", icon: Hand, text: "你好。我在这里，随时可以开始。", mood: "happy" },
  { id: "focus", poseIndex: 1, label: "专注", icon: Target, text: "进入专注模式。先完成眼前最小的一步。", mood: "attentive" },
  { id: "rest", poseIndex: 2, label: "伸展", icon: Coffee, text: "伸展一下吧。放松肩颈，再继续。", mood: "gentle" },
  { id: "charge", poseIndex: 3, label: "充能", icon: Zap, text: "能量正在汇聚。我们继续。", mood: "curious" },
];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了，我会把声音放轻。";
  if (hour < 11) return "早上好。我已经准备好陪你开始今天。";
  if (hour < 14) return "中午好。先确认一下，你有好好吃饭吗？";
  if (hour < 19) return "下午好。我们继续保持节奏。";
  return "晚上好。剩下的事情，我们一件件来。";
}

function localReply(message) {
  const text = message.trim();
  if (/累|困|休息|疲惫/.test(text)) {
    return { text: "那就先停两分钟。看远处、喝口水，我会在这里等你。", mood: "gentle", action: "rest" };
  }
  if (/你好|早安|晚安|在吗/.test(text)) {
    return { text: "我在，而且状态很好。你现在最想先完成什么？", mood: "happy", action: "wave" };
  }
  if (/计划|安排|待办|今天/.test(text)) {
    return { text: "先写下最重要的一件事，再把它拆成一个十分钟内能开始的动作。", mood: "attentive", action: "focus" };
  }
  return { text: `我记下了：“${text.slice(0, 28)}${text.length > 28 ? "…" : ""}”。`, mood: "curious", action: "listen" };
}

function createBrowserBridge() {
  return {
    getSettings: async () => {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("desktop-spirit-settings") || "{}") };
      } catch {
        return DEFAULT_SETTINGS;
      }
    },
    updateSettings: async (patch) => {
      const current = await createBrowserBridge().getSettings();
      const next = { ...current, ...patch };
      localStorage.setItem("desktop-spirit-settings", JSON.stringify(next));
      return next;
    },
    chat: async (message) => {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      return localReply(message);
    },
    getCodexStatus: async () => ({
      task: "桌面精灵新版验证",
      status: "running",
      message: "正在检查转身、动作和任务提醒",
      progress: 68,
      updatedAt: new Date().toISOString(),
      available: true,
      progressFile: "~/.codex/desktop-spirit-progress.json",
    }),
    moveWindowBy: async () => undefined,
    setClickThrough: async () => false,
    hide: async () => undefined,
    openTrayMenu: async () => false,
    quit: async () => undefined,
  };
}

const bridge = window.desktopSpirit || createBrowserBridge();

function Toggle({ checked, label, note, onChange, icon: Icon }) {
  return (
    <button className="setting-row" type="button" aria-pressed={checked} onClick={() => onChange(!checked)}>
      <span className="setting-icon"><Icon size={16} strokeWidth={1.7} /></span>
      <span className="setting-copy">
        <strong>{label}</strong>
        <small>{note}</small>
      </span>
      <span className={`switch ${checked ? "is-on" : ""}`} aria-hidden="true"><i></i></span>
    </button>
  );
}

function CodexStatusCard({ status }) {
  const labels = {
    idle: "待命",
    running: "执行中",
    waiting: "等待确认",
    completed: "已完成",
    failed: "执行失败",
  };
  return (
    <section className={`codex-card status-${status?.status || "idle"}`}>
      <header>
        <span><Bot size={14} /> 本地 Codex</span>
        <strong>{status?.available === false ? "未发现" : labels[status?.status] || "待命"}</strong>
      </header>
      <p>{status?.task || "等待 Codex 任务"}</p>
      <small>{status?.message || "任务进度会显示在这里。"}</small>
      <div className="codex-progress" aria-label={`任务进度 ${status?.progress || 0}%`}>
        <i style={{ width: `${status?.progress || 0}%` }}></i>
      </div>
    </section>
  );
}

export default function App() {
  const stageRef = useRef(null);
  const inputRef = useRef(null);
  const lastInteractionRef = useRef(Date.now());
  const actionTimerRef = useRef(null);
  const codexAnnouncementRef = useRef(null);
  const dragRef = useRef({
    active: false,
    dragging: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    suppressNextClick: false,
  });
  const rotationRef = useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startDegrees: 0,
  });
  const clickThroughTimerRef = useRef(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [bubble, setBubble] = useState({ text: getGreeting(), mood: "attentive" });
  const [composerOpen, setComposerOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [thinking, setThinking] = useState(false);
  const [burst, setBurst] = useState(0);
  const [reactionIndex, setReactionIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [clickThroughConfirm, setClickThroughConfirm] = useState(false);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [rotationDegrees, setRotationDegrees] = useState(() => {
    const previewRotation = Number(new URLSearchParams(window.location.search).get("rotation"));
    return Number.isFinite(previewRotation) ? previewRotation : 0;
  });
  const [lookTarget, setLookTarget] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const previewX = Number(params.get("lookX"));
    const previewY = Number(params.get("lookY"));
    return {
      x: Number.isFinite(previewX) ? Math.max(-1, Math.min(1, previewX)) : 0,
      y: Number.isFinite(previewY) ? Math.max(-1, Math.min(1, previewY)) : 0,
    };
  });
  const [activeAction, setActiveAction] = useState(() => (
    new URLSearchParams(window.location.search).get("action") || ""
  ));
  const [codexStatus, setCodexStatus] = useState(null);
  const runtime = Boolean(window.desktopSpirit);

  const moodLabel = useMemo(() => ({
    attentive: "专注",
    happy: "愉快",
    gentle: "轻柔",
    curious: "好奇",
    thinking: "思考中",
  }[bubble?.mood || "attentive"]), [bubble]);

  useEffect(() => {
    document.body.dataset.runtime = runtime ? "electron" : "browser";
    bridge.getSettings().then((value) => setSettings({ ...DEFAULT_SETTINGS, ...value }));
    if (!bridge.onSettingsChanged) return undefined;
    return bridge.onSettingsChanged((value) => {
      setSettings((current) => ({ ...current, ...value }));
    });
  }, [runtime]);

  useEffect(() => {
    bridge.getCodexStatus?.().then((value) => {
      codexAnnouncementRef.current = value?.updatedAt || null;
      setCodexStatus(value);
    });
    if (!bridge.onCodexProgress) return undefined;
    return bridge.onCodexProgress((value) => {
      const previousUpdate = codexAnnouncementRef.current;
      codexAnnouncementRef.current = value?.updatedAt || previousUpdate;
      setCodexStatus(value);
      if (!settings.codexNotifications || !previousUpdate || previousUpdate === value?.updatedAt) return;
      const messages = {
        waiting: `Codex 正在等你确认：${value.message || value.task}`,
        completed: `Codex 已完成：${value.task}`,
        failed: `Codex 执行失败：${value.message || value.task}`,
      };
      if (messages[value.status]) {
        setBubble({ text: messages[value.status], mood: value.status === "failed" ? "gentle" : "attentive" });
        setBurst((count) => count + 1);
      }
    });
  }, [settings.codexNotifications]);

  useEffect(() => {
    if (composerOpen) window.setTimeout(() => inputRef.current?.focus(), 80);
  }, [composerOpen]);

  useEffect(() => {
    if (!settings.idleMessages) return undefined;
    const timer = window.setInterval(() => {
      if (Date.now() - lastInteractionRef.current < 10 * 60 * 1000) return;
      setBubble({ text: "我还在。需要休息时，点一下我就好。", mood: "gentle" });
      lastInteractionRef.current = Date.now();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [settings.idleMessages]);

  useEffect(() => () => {
    window.clearTimeout(clickThroughTimerRef.current);
    window.clearTimeout(actionTimerRef.current);
  }, []);

  const closePanels = (except) => {
    if (except !== "composer") setComposerOpen(false);
    if (except !== "controls") setControlsOpen(false);
    if (except !== "settings") setSettingsOpen(false);
    setClickThroughConfirm(false);
    setExitConfirm(false);
  };

  const updateSettings = async (patch) => {
    const next = await bridge.updateSettings(patch);
    setSettings((current) => ({ ...current, ...next }));
  };

  const playAction = (actionId) => {
    const action = ACTIONS.find((item) => item.id === actionId);
    if (!action) return;
    window.clearTimeout(actionTimerRef.current);
    setActiveAction(action.id);
    setControlsOpen(false);
    setBubble({ text: action.text, mood: action.mood });
    setBurst((value) => value + 1);
    lastInteractionRef.current = Date.now();
    const duration = { wave: 2200, focus: 4200, rest: 2600, charge: 2800 }[action.id] || 2400;
    actionTimerRef.current = window.setTimeout(() => setActiveAction(""), duration);
  };

  const reactToTouch = () => {
    if (dragRef.current.suppressNextClick) {
      dragRef.current.suppressNextClick = false;
      return;
    }
    if (settingsOpen || composerOpen || controlsOpen) return;
    lastInteractionRef.current = Date.now();
    const next = REACTIONS[reactionIndex % REACTIONS.length];
    setReactionIndex((value) => value + 1);
    setBubble(next);
    setBurst((value) => value + 1);
  };

  const sendMessage = async (event) => {
    event?.preventDefault();
    const value = message.trim();
    if (!value || thinking) return;
    lastInteractionRef.current = Date.now();
    setMessage("");
    setThinking(true);
    setBubble({ text: settings.codexEnabled ? "正在连接本地 Codex…" : "让我想一想…", mood: "thinking" });
    try {
      const reply = await bridge.chat(value);
      const resolved = reply || localReply(value);
      setBubble(resolved);
      if (ACTIONS.some((item) => item.id === resolved.action)) playAction(resolved.action);
      setBurst((count) => count + 1);
      setComposerOpen(false);
    } catch {
      setBubble({ text: "连接暂时没有回应，但我仍然在这里。", mood: "gentle" });
    } finally {
      setThinking(false);
    }
  };

  const requestClickThrough = () => {
    closePanels();
    setClickThroughConfirm(true);
    setBubble({ text: "开启后鼠标会穿过精灵；可按 ⌘⇧E 恢复。请再次确认。", mood: "attentive" });
    window.clearTimeout(clickThroughTimerRef.current);
    clickThroughTimerRef.current = window.setTimeout(() => setClickThroughConfirm(false), 6000);
  };

  const confirmClickThrough = async () => {
    window.clearTimeout(clickThroughTimerRef.current);
    setClickThroughConfirm(false);
    await updateSettings({ clickThrough: true });
  };

  const pointerCoordinates = (event) => ({
    x: Number.isFinite(event.screenX) ? event.screenX : event.clientX,
    y: Number.isFinite(event.screenY) ? event.screenY : event.clientY,
  });

  const startCharacterDrag = (event) => {
    if (settingsOpen || composerOpen || controlsOpen || clickThroughConfirm) return;
    const wantsRotation = event.button === 2 || (event.button === 0 && event.shiftKey);
    if (wantsRotation) {
      event.preventDefault();
      rotationRef.current = {
        active: true,
        pointerId: event.pointerId,
        startX: event.clientX,
        startDegrees: rotationDegrees,
      };
      dragRef.current.suppressNextClick = true;
      setActiveAction("");
      setIsRotating(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    const point = pointerCoordinates(event);
    dragRef.current = {
      active: true,
      dragging: false,
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      suppressNextClick: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveCharacterDrag = (event) => {
    const rotation = rotationRef.current;
    if (rotation.active && rotation.pointerId === event.pointerId) {
      const degreeDelta = (event.clientX - rotation.startX) * 0.72;
      const nextDegrees = (rotation.startDegrees + degreeDelta + 3600) % 360;
      setRotationDegrees(nextDegrees);
      return;
    }
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    const point = pointerCoordinates(event);
    const totalX = point.x - drag.startX;
    const totalY = point.y - drag.startY;
    if (!drag.dragging && Math.hypot(totalX, totalY) >= 5) {
      drag.dragging = true;
      drag.suppressNextClick = true;
      setIsDragging(true);
      void bridge.moveWindowBy?.(totalX, totalY);
    } else if (drag.dragging) {
      void bridge.moveWindowBy?.(point.x - drag.lastX, point.y - drag.lastY);
    }
    drag.lastX = point.x;
    drag.lastY = point.y;
  };

  const finishCharacterDrag = (event) => {
    const rotation = rotationRef.current;
    if (rotation.active && rotation.pointerId === event.pointerId) {
      rotation.active = false;
      rotation.pointerId = null;
      setIsRotating(false);
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      window.setTimeout(() => { dragRef.current.suppressNextClick = false; }, 0);
      return;
    }
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    const wasDragging = drag.dragging;
    drag.active = false;
    drag.dragging = false;
    drag.pointerId = null;
    drag.suppressNextClick = wasDragging;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    window.setTimeout(() => { dragRef.current.suppressNextClick = false; }, 0);
  };

  const cancelCharacterDrag = () => {
    rotationRef.current.active = false;
    rotationRef.current.pointerId = null;
    dragRef.current.active = false;
    dragRef.current.dragging = false;
    dragRef.current.pointerId = null;
    dragRef.current.suppressNextClick = false;
    setIsDragging(false);
    setIsRotating(false);
  };

  const handlePointerMove = (event) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || isDragging || isRotating) return;
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    setLookTarget({
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y)),
    });
  };

  return (
    <main
      ref={stageRef}
      className={`spirit-stage mood-${bubble?.mood || "attentive"} ${settings.idleMotion ? "motion-on" : "motion-off"} ${isDragging ? "is-dragging" : ""} ${isRotating ? "is-rotating" : ""} ${activeAction ? "has-action" : ""}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => {
        setLookTarget({ x: 0, y: 0 });
      }}
      data-screen-label="桌面精灵主界面"
    >
      <div className="window-veil" aria-hidden="true"></div>

      {bubble && (
        <section className="speech-shell" aria-live="polite">
          <div className="speech-meta"><span className="energy-dot"></span><span>{moodLabel}</span></div>
          <p>{bubble.text}</p>
          <button className="dismiss" type="button" aria-label="收起对话" onClick={() => setBubble(null)}><X size={14} /></button>
        </section>
      )}

      <div className="aura aura-one" aria-hidden="true"></div>
      <div className="aura aura-two" aria-hidden="true"></div>
      <div className="energy-rune" aria-hidden="true"><i></i><i></i><i></i></div>

      <button
        className="character-hitbox"
        type="button"
        aria-label="左键拖动移动，右键拖动转身，轻触互动"
        onClick={reactToTouch}
        onPointerDown={startCharacterDrag}
        onPointerMove={moveCharacterDrag}
        onPointerUp={finishCharacterDrag}
        onPointerCancel={cancelCharacterDrag}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span className="spirit-figure">
          <Spirit3D
            activeAction={activeAction}
            idleMotion={settings.idleMotion}
            rotationDegrees={rotationDegrees}
            energyBurst={["focus", "rest", "charge"].includes(activeAction)}
            lookX={lookTarget.x}
            lookY={lookTarget.y}
          />
        </span>
      </button>

      <div className="particle-field" key={burst} aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => <i key={index} style={{ "--i": index }}></i>)}
      </div>

      <nav className="quick-actions" aria-label="桌面精灵快捷操作">
        <button type="button" className={composerOpen ? "is-active" : ""} aria-label="和精灵说话" title="对话" onClick={() => {
          const next = !composerOpen;
          closePanels(next ? "composer" : undefined);
          setComposerOpen(next);
        }}><MessageCircle size={18} strokeWidth={1.65} /></button>
        <button type="button" className={controlsOpen ? "is-active" : ""} aria-label="互动动作" title="互动动作" onClick={() => {
          const next = !controlsOpen;
          closePanels(next ? "controls" : undefined);
          setControlsOpen(next);
        }}><Sparkles size={18} strokeWidth={1.65} /></button>
        <button type="button" className={settingsOpen ? "is-active" : ""} aria-label="打开设置" title="设置" onClick={() => {
          const next = !settingsOpen;
          closePanels(next ? "settings" : undefined);
          setSettingsOpen(next);
        }}><Settings2 size={18} strokeWidth={1.65} /></button>
      </nav>

      {clickThroughConfirm && (
        <aside className="click-through-confirm" role="alertdialog" aria-label="确认开启点击穿透">
          <strong>开启点击穿透？</strong>
          <p>开启后请按 <kbd>⌘</kbd><kbd>⇧</kbd><kbd>E</kbd> 恢复控制。</p>
          <div>
            <button type="button" onClick={() => setClickThroughConfirm(false)}>取消</button>
            <button type="button" className="confirm-action" onClick={confirmClickThrough}>确认开启</button>
          </div>
        </aside>
      )}

      {composerOpen && (
        <form className="composer" onSubmit={sendMessage}>
          {settings.codexEnabled ? <Bot size={16} strokeWidth={1.7} /> : <Sparkles size={16} strokeWidth={1.7} />}
          <input ref={inputRef} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={settings.codexEnabled ? "通过本地 Codex 对话…" : "和精灵说句话…"} maxLength={200} aria-label="对话内容" />
          <button type="submit" disabled={!message.trim() || thinking} aria-label="发送"><Send size={16} strokeWidth={1.8} /></button>
        </form>
      )}

      {controlsOpen && (
        <aside className="controls-panel">
          <header>
            <div><span>SPIRIT MOTION</span><strong>互动动作</strong></div>
            <button type="button" aria-label="关闭动作面板" onClick={() => setControlsOpen(false)}><X size={15} /></button>
          </header>
          <p className="action-note">真实姿态素材 · 动作结束后恢复当前朝向</p>
          <section className="action-grid" aria-label="互动动作">
            {ACTIONS.map(({ id, label, icon: Icon }) => (
              <button type="button" key={id} className={activeAction === id ? "is-active" : ""} onClick={() => playAction(id)}>
                <Icon size={17} strokeWidth={1.65} /><span>{label}</span>
              </button>
            ))}
          </section>
          <CodexStatusCard status={codexStatus} />
        </aside>
      )}

      {settingsOpen && (
        <aside className="settings-panel">
          <header>
            <div><span>SPIRIT CORE</span><strong>陪伴设置</strong></div>
            <button type="button" aria-label="关闭设置" onClick={() => setSettingsOpen(false)}><X size={15} /></button>
          </header>
          <Toggle checked={settings.idleMotion} label="悬浮与呼吸" note="保持轻微待机动作" icon={Sparkles} onChange={(value) => updateSettings({ idleMotion: value })} />
          <Toggle checked={settings.alwaysOnTop} label="始终置顶" note="显示在其他窗口上方" icon={Pin} onChange={(value) => updateSettings({ alwaysOnTop: value })} />
          <Toggle checked={settings.codexEnabled} label="本地 Codex 对话" note="使用只读、临时会话回复" icon={Bot} onChange={(value) => updateSettings({ codexEnabled: value })} />
          <Toggle checked={settings.codexNotifications} label="Codex 进度提醒" note="等待确认或完成时提醒" icon={Activity} onChange={(value) => updateSettings({ codexNotifications: value })} />
          <Toggle checked={settings.voice} label="语音播报" note="为后续 TTS 接口预留" icon={settings.voice ? Volume2 : VolumeX} onChange={(value) => updateSettings({ voice: value })} />
          <Toggle checked={settings.idleMessages} label="主动陪伴" note="偶尔发出轻量提醒" icon={Eye} onChange={(value) => updateSettings({ idleMessages: value })} />
          <Toggle checked={settings.clickThrough} label="鼠标点击穿透" note="快捷键 ⌘⇧E 可恢复" icon={settings.clickThrough ? Eye : EyeOff} onChange={(value) => value ? requestClickThrough() : updateSettings({ clickThrough: false })} />
          <div className="settings-footer">
            <button type="button" className="tray-menu-button" onClick={() => bridge.openTrayMenu?.()}><GripHorizontal size={15} />打开系统菜单</button>
            {!exitConfirm ? (
              <button type="button" className="quit-button" onClick={() => setExitConfirm(true)}><DoorOpen size={15} />退出桌面精灵</button>
            ) : (
              <div className="exit-confirm">
                <span>确认退出？</span>
                <button type="button" onClick={() => setExitConfirm(false)}>取消</button>
                <button type="button" className="danger" onClick={() => bridge.quit?.()}>退出</button>
              </div>
            )}
          </div>
        </aside>
      )}

      <div className="interaction-hint" aria-hidden="true">{
        isRotating
          ? `左右拖动转身 · ${Math.round(rotationDegrees)}°`
          : isDragging
            ? "可继续拖入屏幕边缘"
            : "左键拖动移动 · 右键拖动转身"
      }</div>
      <div className="drag-handle" title="拖动桌面精灵"><GripHorizontal size={22} strokeWidth={1.45} /></div>
    </main>
  );
}
