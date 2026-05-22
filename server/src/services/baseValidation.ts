// 基础设置通用校验和工具函数

type SqlParam = string | number

export function buildWhereClause(conditions: string[]) {
  if (conditions.length === 0) {
    return ''
  }

  return ` WHERE ${conditions.join(' AND ')}`
}

export function normalizePunctuation(value: string) {
  const punctuationMap: Record<string, string> = {
    '，': ',',
    '。': '.',
    '；': ';',
    '：': ':',
    '（': '(',
    '）': ')',
    '【': '[',
    '】': ']',
    '｛': '{',
    '｝': '}',
    '\u201C': '"',
    '\u201D': '"',
    '\u2018': "'",
    '\u2019': "'",
    '《': '<',
    '》': '>',
    '？': '?',
    '！': '!',
    '、': ',',
    '——': '-',
    '—': '-',
    '－': '-',
    '～': '~',
  }

  return value.replace(
    /——|[，。；：（）【】｛｝""''《》？！、—－～]/g,
    match => punctuationMap[match] ?? match
  )
}

export function normalizeDuplicateKey(value: string) {
  return normalizePunctuation(value)
    .replace(/[\s,.;:()\[\]{}"'<>?!~\-]/g, '')
    .toLowerCase()
}

export type { SqlParam }
