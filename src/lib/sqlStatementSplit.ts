export interface SqlSelection { sql: string; from: number; to: number }

/** 只决定编辑器提交范围；语法、权限和多语句判断仍由服务端负责。 */
export function selectSqlStatement(text: string, anchor: number, head = anchor): SqlSelection | null {
    const start = Math.max(0, Math.min(text.length, Math.min(anchor, head)))
    const end = Math.max(0, Math.min(text.length, Math.max(anchor, head)))
    if (start !== end) return trimmed(text, start, end)
    let from = 0
    let quote: "'" | '"' | '`' | null = null
    let lineComment = false
    let blockComment = false
    const ranges: { from: number; to: number; hasCode: boolean }[] = []
    let hasCode = false
    for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        const next = text[i + 1]
        if (lineComment) {
            if (ch === '\n' || ch === '\r') lineComment = false
            continue
        }
        if (blockComment) {
            if (ch === '*' && next === '/') { blockComment = false; i++ }
            continue
        }
        if (quote) {
            if (ch === '\\' && quote !== '`') { i++; continue }
            if (ch === quote) {
                if (next === quote) i++
                else quote = null
            }
            continue
        }
        if (ch === '#' || (ch === '-' && next === '-' && (i + 2 === text.length || /\s/.test(text[i + 2])))) {
            lineComment = true
            continue
        }
        if (ch === '/' && next === '*') {
            blockComment = true
            // 可执行注释必须送到后端拒绝，不把它当作可忽略的空输入。
            if (text[i + 2] === '!' || text[i + 2] === '+') hasCode = true
            i++
            continue
        }
        if (ch === "'" || ch === '"' || ch === '`') { quote = ch; hasCode = true; continue }
        if (ch === ';') {
            ranges.push({ from, to: i + 1, hasCode })
            from = i + 1
            hasCode = false
        } else if (!/\s/.test(ch)) hasCode = true
    }
    ranges.push({ from, to: text.length, hasCode })
    let range = ranges.find((item, index) => start >= item.from
        && (start < item.to || index === ranges.length - 1 && start === item.to))
    // 输入完成后光标通常停在末尾分号之后，此时使用最后一条完整语句。
    if (!range?.hasCode && start === text.length && range && !text.slice(range.from).trim()) {
        range = ranges.slice(0, -1).reverse().find((item) => item.hasCode)
    }
    if (!range?.hasCode) return null
    return trimmed(text, range.from, range.to)
}

function trimmed(text: string, from: number, to: number): SqlSelection | null {
    const raw = text.slice(from, to)
    const sql = raw.trim()
    if (!sql) return null
    const offset = raw.length - raw.trimStart().length
    return { sql, from: from + offset, to: from + offset + sql.length }
}
