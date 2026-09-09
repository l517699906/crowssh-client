import type { Conversation } from '../types'

/** 审批 SQL/票据只留当前内存；历史不恢复数据库执行身份。 */
export function conversationForHistory(conversation: Conversation): Conversation {
    if (conversation.resourceKind !== 'DB') return conversation
    return {
        ...conversation, serverSessionId: undefined, terminalSessionId: undefined, dbSessionId: undefined,
        turns: conversation.turns.map((turn) => ({ ...turn, items: turn.items.map((item) => item.type !== 'tool' ? item : {
            ...item, command: '', approvalId: undefined, databaseApproval: undefined,
        }) })),
    }
}
