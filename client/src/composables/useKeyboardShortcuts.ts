import { onMounted, onUnmounted } from 'vue'

export interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  meta?: boolean
  handler: (event: KeyboardEvent) => void
  description?: string
}

/**
 * 键盘快捷键 composable
 *
 * @example
 * useKeyboardShortcuts([
 *   { key: 's', ctrl: true, handler: handleSave, description: '保存' },
 *   { key: 'Escape', handler: handleClose, description: '关闭' }
 * ])
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = (event: KeyboardEvent) => {
    for (const shortcut of shortcuts) {
      const ctrlMatch = shortcut.ctrl === undefined || shortcut.ctrl === (event.ctrlKey || event.metaKey)
      const altMatch = shortcut.alt === undefined || shortcut.alt === event.altKey
      const shiftMatch = shortcut.shift === undefined || shortcut.shift === event.shiftKey
      const metaMatch = shortcut.meta === undefined || shortcut.meta === event.metaKey
      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()

      if (ctrlMatch && altMatch && shiftMatch && metaMatch && keyMatch) {
        // 检查是否在输入框中
        const target = event.target as HTMLElement
        const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
        const isContentEditable = target.isContentEditable

        // 如果是 Escape 键，总是允许
        if (shortcut.key.toLowerCase() === 'escape') {
          event.preventDefault()
          shortcut.handler(event)
          return
        }

        // 如果在输入框中且不是特殊快捷键（如 Ctrl+S），则跳过
        if (isInput || isContentEditable) {
          if (!shortcut.ctrl && !shortcut.alt && !shortcut.meta) {
            continue
          }
        }

        event.preventDefault()
        shortcut.handler(event)
        return
      }
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeyDown)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeyDown)
  })

  return {
    shortcuts,
  }
}

/**
 * 常用快捷键预设
 */
export const commonShortcuts = {
  save: (handler: () => void) => ({
    key: 's',
    ctrl: true,
    handler,
    description: 'Ctrl+S 保存',
  }),
  close: (handler: () => void) => ({
    key: 'Escape',
    handler,
    description: 'Esc 关闭',
  }),
  search: (handler: () => void) => ({
    key: 'f',
    ctrl: true,
    handler,
    description: 'Ctrl+F 搜索',
  }),
  refresh: (handler: () => void) => ({
    key: 'r',
    ctrl: true,
    handler,
    description: 'Ctrl+R 刷新',
  }),
  add: (handler: () => void) => ({
    key: 'n',
    ctrl: true,
    handler,
    description: 'Ctrl+N 新增',
  }),
  delete: (handler: () => void) => ({
    key: 'Delete',
    handler,
    description: 'Delete 删除',
  }),
}
