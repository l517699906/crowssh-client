import type { ChatTarget, Conversation } from '../types'
import type { DbResourceSnapshot } from '../types/database'

export function describeChatTarget(target?: ChatTarget) {
    if (!target) return null
    if (target.kind === 'terminal') return {
        id: target.terminal.id, connectionId: target.terminal.serverId,
        backendSessionId: target.terminal.backendSessionId, resourceKind: 'SSH' as const,
        label: target.server?.name || target.terminal.title,
        ready: target.terminal.status === 'connected' && Boolean(target.terminal.backendSessionId),
    }
    return {
        id: target.dbSession.dbSessionId, connectionId: target.dbSession.connectionId,
        backendSessionId: target.dbSession.dbSessionId, resourceKind: 'DB' as const,
        label: target.dbConnection?.connectionName || '数据库工作台',
        ready: target.dbSession.lifecycleStatus === 'READY' && target.dbSession.aiLaneStatus !== 'BROKEN'
            && target.dbSession.aiLaneStatus !== 'CLOSED',
    }
}

export function conversationMatchesTarget(conversation: Conversation, target?: ChatTarget) {
    const resource = describeChatTarget(target)
    if (!resource || (conversation.resourceKind ?? 'SSH') !== resource.resourceKind) return false
    return resource.resourceKind === 'DB' ? conversation.dbConnectionId === resource.connectionId
        : conversation.serverId === resource.connectionId
}

export function snapshotMatchesDatabaseTarget(snapshot: DbResourceSnapshot, target: Extract<ChatTarget, { kind: 'sql' }>) {
    const session = target.dbSession
    return snapshot.dbConnectionId === session.connectionId && snapshot.dbSessionId === session.dbSessionId
        && snapshot.sessionGeneration === session.sessionGeneration && snapshot.configVersion === session.configVersion
        && snapshot.targetContextVersion === session.targetContextVersion && snapshot.targetDatabase === session.currentDatabase
}
