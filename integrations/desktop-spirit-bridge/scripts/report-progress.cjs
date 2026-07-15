#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const outputPath = path.join(os.homedir(), '.codex', 'desktop-spirit-progress.json');

function readInput() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function readPrevious() {
  try {
    return JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  } catch {
    return {};
  }
}

function excerpt(value, length = 120) {
  if (typeof value !== 'string') return '';
  const clean = value.replace(/\s+/g, ' ').trim();
  return `${clean.slice(0, length)}${clean.length > length ? '…' : ''}`;
}

const input = readInput();
const previous = readPrevious();
const event = input.hook_event_name || 'Unknown';
const next = {
  task: previous.task || 'Codex 任务',
  status: previous.status || 'running',
  message: previous.message || '',
  progress: Number.isFinite(previous.progress) ? previous.progress : 0,
  updatedAt: new Date().toISOString(),
  sessionId: input.session_id || previous.sessionId || null
};

if (event === 'SessionStart') {
  next.task = 'Codex 已连接';
  next.status = 'idle';
  next.message = `工作目录：${input.cwd || '未知'}`;
  next.progress = 0;
} else if (event === 'UserPromptSubmit') {
  next.task = excerpt(input.prompt, 100) || '新的 Codex 任务';
  next.status = 'running';
  next.message = '任务已开始';
  next.progress = 12;
} else if (event === 'PreToolUse') {
  next.status = 'running';
  next.message = `正在使用：${input.tool_name || '工具'}`;
  next.progress = Math.min(84, Math.max(32, next.progress + 5));
} else if (event === 'PostToolUse') {
  next.status = 'running';
  next.message = `${input.tool_name || '工具'} 已完成，继续处理中`;
  next.progress = Math.min(90, Math.max(46, next.progress + 4));
} else if (event === 'PermissionRequest') {
  next.status = 'waiting';
  next.message = `Codex 正在等待你确认：${input.tool_name || '操作'}`;
  next.progress = Math.max(55, next.progress);
} else if (event === 'Stop') {
  next.status = 'completed';
  next.message = excerpt(input.last_assistant_message, 180) || '任务已完成';
  next.progress = 100;
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
fs.renameSync(temporaryPath, outputPath);

if (event === 'Stop') process.stdout.write('{}');
