import { ElMessageBox } from 'element-plus'
import type { ElMessageBoxOptions } from 'element-plus'

const DRAG_OPTIONS: Pick<ElMessageBoxOptions, 'draggable' | 'overflow'> = {
  draggable: true,
  overflow: true,
}

type MessageBoxMethod = typeof ElMessageBox.alert

function patchMessageBoxMethod(method: MessageBoxMethod): MessageBoxMethod {
  return ((message: string, title?: string | ElMessageBoxOptions, options?: ElMessageBoxOptions) => {
    if (title && typeof title === 'object') {
      return method(message, { ...DRAG_OPTIONS, ...title })
    }
    return method(message, title as string | undefined, { ...DRAG_OPTIONS, ...options })
  }) as MessageBoxMethod
}

/** 为 ElMessageBox 统一启用可拖动（标题栏拖拽） */
export function setupMessageBoxDefaults() {
  ElMessageBox.alert = patchMessageBoxMethod(ElMessageBox.alert)
  ElMessageBox.confirm = patchMessageBoxMethod(ElMessageBox.confirm)
  ElMessageBox.prompt = patchMessageBoxMethod(ElMessageBox.prompt)
}
