/**
 * Generate the README preview SVGs (sample data, not a live screenshot).
 * Run: node scripts/make-preview.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'docs')
const esc = (value) => String(value).replace(/[<>&"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[char]))
const font = "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Noto Sans CJK SC','Microsoft YaHei',sans-serif"

const text = (x, y, value, size = 13, color = '#1d2129', weight = 400, anchor = 'start') =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" text-anchor="${anchor}">${esc(value)}</text>`
const rect = (x, y, w, h, fill, stroke = 'none', rx = 8) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>`
const line = (x1, y1, x2, y2, color = '#eef0f3') =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1"/>`
const circle = (cx, cy, r, fill, stroke = 'none', width = 1) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`
const check = (cx, cy, color = '#00b42a') =>
  `${circle(cx, cy, 7, color)}<path d="M${cx - 3.5} ${cy} l2.4 2.4 l4.6 -5" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`

const copy = {
  zh: {
    title: 'dsh-todos', tagline: 'DeepSeek Harness · 持久工作区待办', caption: '界面预览（示例数据）',
    heading: '待办', subtitle: '持久保存的工作区待办（Plan / Backlog），按工作区与优先级组织。',
    refresh: '刷新', placeholder: '记一条待办…', target: 'dsh-todos', bucket: '计划', add: '添加',
    open: '未完成', completed: '已完成', plan: '计划', backlog: '待办池', current: '当前',
    meta: '5 项未完成 / 8 项', high: '高', medium: '中', low: '低',
    rows: [
      ['完成 Desktop 兼容性 smoke test', 'high', true],
      ['实现 SSE /api/todos/events', 'high', false],
      ['支持拖拽排序', 'medium', false],
    ],
    backlogRows: ['补充标题/描述编辑 UI', '研究 expectedUpdatedAt CAS'],
    move: '移到待办池', restore: '恢复', clear: '清理已完成（3）',
    noteOpen: 'Plan 默认 high；Backlog 无优先级；Inbox 只允许 Backlog。',
    noteDone: '完成只写状态；可恢复；清理按 workspace 永久删除。',
    doneRows: [
      ['修正 mutation 后的刷新竞态', '10月31日 23:52'],
      ['清理 session-plan 死代码', '10月31日 23:40'],
      ['补充 /todo 命令', '10月31日 23:20'],
    ],
  },
  en: {
    title: 'dsh-todos', tagline: 'DeepSeek Harness · durable workspace todos', caption: 'UI preview (sample data)',
    heading: 'Todos', subtitle: 'Durable workspace Plan / Backlog, grouped by workspace and priority.',
    refresh: 'Refresh', placeholder: 'Add a todo…', target: 'dsh-todos', bucket: 'Plan', add: 'Add',
    open: 'Open', completed: 'Completed', plan: 'Plan', backlog: 'Backlog', current: 'Current',
    meta: '5 open / 8 total', high: 'High', medium: 'Medium', low: 'Low',
    rows: [
      ['Finish Desktop compatibility smoke test', 'high', true],
      ['Implement SSE /api/todos/events', 'high', false],
      ['Add drag-and-drop ordering', 'medium', false],
    ],
    backlogRows: ['Add title/description editing UI', 'Explore expectedUpdatedAt CAS'],
    move: 'Move to backlog', restore: 'Restore', clear: 'Clear completed (3)',
    noteOpen: 'Plan defaults to high; Backlog has no priority; Inbox is backlog-only.',
    noteDone: 'Complete keeps history; restore is available; clear is permanent per workspace.',
    doneRows: [
      ['Fix refresh race after mutations', 'Oct 31, 23:52'],
      ['Remove dead session-plan code', 'Oct 31, 23:40'],
      ['Add /todo commands', 'Oct 31, 23:20'],
    ],
  },
}

const priorityColor = (priority) => priority === 'high'
  ? { fill: '#fff1f0', text: '#cb2634' }
  : priority === 'medium'
    ? { fill: '#fff7e8', text: '#d25f00' }
    : { fill: '#f2f3f5', text: '#4e5969' }

function card(lang, x, completed) {
  const c = copy[lang]
  const y = 104
  const w = 650
  const h = 770
  const inner = x + 28
  const right = x + w - 28
  const parts = []
  parts.push(`<g>`)
  parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="#ffffff" stroke="#e5e6eb"/>`)
  parts.push(text(inner, y + 46, c.heading, 24, '#1d2129', 650))
  parts.push(text(inner, y + 70, c.subtitle, 12, '#86909c'))
  parts.push(text(right, y + 46, c.refresh, 12, '#4e5969', 500, 'end'))
  parts.push(`<path d="M${right - 66} ${y + 38} a8 8 0 1 1 2 12" fill="none" stroke="#86909c" stroke-width="1.3" stroke-linecap="round"/>`)

  // composer
  const cy = y + 92
  parts.push(rect(inner, cy, 226, 38, '#fff', '#e5e6eb', 10))
  parts.push(text(inner + 13, cy + 24, c.placeholder, 12, '#a9aeb8'))
  parts.push(rect(inner + 234, cy, 128, 38, '#fff', '#e5e6eb', 10))
  parts.push(text(inner + 246, cy + 24, c.target, 12, '#4e5969'))
  parts.push(`<path d="M${inner + 346} ${cy + 17} l4 4 l4 -4" fill="none" stroke="#86909c" stroke-width="1.3" stroke-linecap="round"/>`)
  parts.push(rect(inner + 370, cy, 88, 38, '#fff', '#e5e6eb', 10))
  parts.push(text(inner + 382, cy + 24, c.bucket, 12, '#4e5969'))
  parts.push(`<path d="M${inner + 438} ${cy + 17} l4 4 l4 -4" fill="none" stroke="#86909c" stroke-width="1.3" stroke-linecap="round"/>`)
  parts.push(rect(inner + 466, cy, 100, 38, '#3370ff', 'none', 10))
  parts.push(text(inner + 516, cy + 24, c.add, 12, '#fff', 500, 'middle'))

  // tabs
  const tabY = y + 154
  parts.push(rect(inner, tabY, 104, 32, completed ? '#f2f3f5' : '#e8f0ff', 'none', 8))
  parts.push(text(inner + 52, tabY + 21, `${c.open} 5`, 12, completed ? '#4e5969' : '#3370ff', 600, 'middle'))
  parts.push(rect(inner + 112, tabY, 104, 32, completed ? '#e8f0ff' : '#f2f3f5', 'none', 8))
  parts.push(text(inner + 164, tabY + 21, `${c.completed} 3`, 12, completed ? '#3370ff' : '#4e5969', 600, 'middle'))

  // group header
  const groupY = y + 220
  parts.push(text(inner, groupY, 'dsh-todos', 15, '#1d2129', 600))
  parts.push(rect(inner + 105, groupY - 14, 38, 18, '#f2f3f5', 'none', 5))
  parts.push(text(inner + 124, groupY - 1, c.current, 10, '#4e5969', 500, 'middle'))
  parts.push(text(right, groupY, completed ? c.clear : c.meta, 11, completed ? '#cb2634' : '#86909c', 500, 'end'))
  parts.push(line(inner, groupY + 16, right, groupY + 16, '#eef0f3'))

  if (!completed) {
    let rowY = groupY + 46
    parts.push(text(inner, rowY, c.plan, 12, '#4e5969', 600))
    parts.push(text(inner + 34, rowY, '3', 11, '#a9aeb8'))
    rowY += 18
    c.rows.forEach(([title, priority, hover], index) => {
      if (hover) parts.push(rect(inner - 4, rowY - 2, right - inner + 8, 54, '#f7f8fa', 'none', 10))
      parts.push(circle(inner + 7, rowY + 18, 5.5, '#fff', '#c9cdd4', 1.4))
      parts.push(text(inner + 24, rowY + 23, title, 13, hover ? '#1d2129' : '#1d2129', 400))
      const chip = priorityColor(priority)
      parts.push(rect(inner + 356, rowY + 8, 42, 18, chip.fill, 'none', 5))
      parts.push(text(inner + 377, rowY + 21, c[priority], 10, chip.text, 500, 'middle'))
      if (hover) {
        parts.push(rect(right - 132, rowY + 6, 88, 20, '#eef0f3', 'none', 6))
        parts.push(text(right - 88, rowY + 20, c.move, 10, '#4e5969', 500, 'middle'))
        parts.push(text(right - 18, rowY + 21, '×', 13, '#86909c', 400, 'middle'))
      } else {
        parts.push(text(right - 8, rowY + 21, '×', 13, '#c9cdd4', 400, 'middle'))
      }
      rowY += 54
      if (index < c.rows.length - 1) parts.push(line(inner + 16, rowY - 8, right, rowY - 8, '#f2f3f5'))
    })

    rowY += 10
    parts.push(text(inner, rowY, c.backlog, 12, '#4e5969', 600))
    parts.push(text(inner + 58, rowY, '2', 11, '#a9aeb8'))
    rowY += 18
    c.backlogRows.forEach((title, index) => {
      parts.push(circle(inner + 7, rowY + 18, 5.5, '#fff', '#c9cdd4', 1.4))
      parts.push(text(inner + 24, rowY + 23, title, 13, '#1d2129'))
      parts.push(text(right - 8, rowY + 21, '×', 13, '#c9cdd4', 400, 'middle'))
      rowY += 54
      if (index < c.backlogRows.length - 1) parts.push(line(inner + 16, rowY - 8, right, rowY - 8, '#f2f3f5'))
    })
  } else {
    let rowY = groupY + 48
    c.doneRows.forEach(([title, when], index) => {
      parts.push(check(inner + 7, rowY + 18))
      parts.push(`<text x="${inner + 24}" y="${rowY + 19}" font-size="13" fill="#86909c" text-decoration="line-through">${esc(title)}</text>`)
      parts.push(text(inner + 24, rowY + 36, when, 10, '#a9aeb8'))
      parts.push(text(right - 62, rowY + 22, c.restore, 10, '#4e5969', 500, 'middle'))
      parts.push(text(right - 16, rowY + 23, '×', 13, '#86909c', 400, 'middle'))
      rowY += 62
      if (index < c.doneRows.length - 1) parts.push(line(inner + 16, rowY - 10, right, rowY - 10, '#f2f3f5'))
    })
  }
  parts.push(text(inner, y + h - 36, completed ? c.noteDone : c.noteOpen, 10, '#a9aeb8'))
  parts.push('</g>')
  return parts.join('')
}

function build(lang) {
  const c = copy[lang]
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="920" viewBox="0 0 1440 920" role="img" aria-label="${esc(c.title)} ${esc(c.caption)}">
  <style>text{font-family:${font};}</style>
  <rect width="1440" height="920" fill="#f2f4f8"/>
  ${text(40, 46, c.title, 28, '#1d2129', 700)}
  ${text(40, 72, c.tagline, 13, '#86909c')}
  ${text(1400, 46, c.caption, 11, '#a9aeb8', 400, 'end')}
  ${rect(40, 86, 1360, 0.5, '#e5e6eb', 'none', 0)}
  ${card(lang, 40, false)}
  ${card(lang, 750, true)}
</svg>
`
}

await mkdir(outDir, { recursive: true })
for (const lang of ['zh', 'en']) {
  await writeFile(resolve(outDir, `preview.${lang}.svg`), build(lang), 'utf8')
}
console.log('wrote docs/preview.zh.svg and docs/preview.en.svg')
