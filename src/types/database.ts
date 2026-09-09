export type DbSslMode = 'DISABLED' | 'PREFERRED' | 'REQUIRED' | 'VERIFY_CA' | 'VERIFY_IDENTITY'
export type DbSecretAction = 'KEEP' | 'REPLACE' | 'CLEAR'
export interface DbAllowedColumn { database: string; table: string; column: string }
export interface DbConnectionConfig {
    connectionId: string
    connectionName: string
    dbType: 'MYSQL'
    host: string
    port: number
    username: string
    defaultDatabase: string | null
    sslMode: DbSslMode
    tlsServerName: string | null
    tunnelSshConnectionId: string | null
    connectTimeout: number
    queryTimeout: number
    maxRows: number
    configVersion: number
    aiDataMode: 'METADATA_ONLY' | 'ALLOWLIST'
    aiAllowedColumns: DbAllowedColumn[]
    hasPassword: boolean
    hasCaCertificate: boolean
    status: number
    createdAt: string | null
    updatedAt: string | null
}
/** 凭据仅存在于表单提交对象中，不写入 store 或浏览器存储。 */
export type DbConnectionPayload = Partial<Omit<DbConnectionConfig,
    'hasPassword' | 'hasCaCertificate' | 'configVersion' | 'status' | 'createdAt' | 'updatedAt'>> & {
    expectedConfigVersion?: number
    passwordAction: DbSecretAction
    password?: string
    caCertificateAction: DbSecretAction
    caCertificatePem?: string
}
export interface DbTestResult {
    serverVersion: string
    capabilities: string[]
    capabilityStates?: Record<string, string>
    tlsEncrypted: boolean
    tlsIdentityVerified: boolean
    sessionTimeZone: string
}
export type DbLaneStatus = 'NOT_OPEN' | 'READY' | 'BUSY' | 'BROKEN' | 'CLOSED'
export interface DbSession {
    dbSessionId: string
    sessionGeneration: number
    connectionId: string
    configVersion: number
    currentDatabase: string | null
    targetContextVersion: number
    lifecycleStatus: 'OPENING' | 'READY' | 'CLOSING' | 'CLOSED' | 'BROKEN'
    consoleLaneStatus: DbLaneStatus
    aiLaneStatus: DbLaneStatus
    autoCommit: boolean
    transactionState: 'IDLE' | 'ACTIVE' | 'UNKNOWN'
    sessionTimeZone: string
    capabilityStates?: Record<string, string>
    serverVersion?: string
    tlsEncrypted?: boolean
    tlsIdentityVerified?: boolean
}
export type DbExecutionState = 'PREPARED' | 'WAITING_APPROVAL' | 'RUNNING' | 'FINISHED'
export type DbOutcome = 'SUCCEEDED' | 'FAILED' | 'REJECTED' | 'EXPIRED' | 'CONTEXT_CHANGED'
    | 'CANCELLED' | 'TIMED_OUT' | 'OUTCOME_UNKNOWN'
export interface DbPreparedExecution {
    executionId: string
    state: DbExecutionState
    outcome: DbOutcome | null
    kind: string
    riskLevel: string
    reasons: string[]
    sqlHash: string
    targetDatabase: string | null
    configVersion: number
    targetContextVersion: number
    expiresAt: string
}
export interface DbResultColumn {
    ordinal: number; label: string; typeName: string; jdbcType: number
    nullable: boolean; precision: number | null; scale: number | null
}
export interface DbQueryResult {
    columns: DbResultColumn[]
    rows: (string | null)[][]
    rowCount: number
    affectedRows: string | null
    affectedRowsSemantics: string | null
    truncated: boolean
    truncationReasons: string[]
    resultBytes: number
    warnings: string[]
    sqlState: string | null
    vendorCode: number | null
    safeError: string | null
    queueMillis: number
    executionMillis: number
    totalMillis: number
    autoCommit: boolean
    transactionState: DbSession['transactionState']
    currentDatabase: string | null
    sessionTimeZone: string | null
    sessionReusable: boolean
    capabilityState: 'AVAILABLE' | 'UNSUPPORTED' | 'PERMISSION_DENIED' | 'DISABLED' | 'TEMPORARILY_UNAVAILABLE' | null
}
export interface DbExecution {
    executionId: string
    source: 'CONSOLE' | 'AI'
    operationKind: 'SQL' | 'METADATA'
    kind: string
    state: DbExecutionState
    outcome: DbOutcome | null
    success: boolean
    cancelRequested: boolean
    resultAvailable: boolean
    targetDatabase: string | null
    configVersion: number
    riskLevel: string | null
    policyReason: string | null
    startedAt: string | null
    finishedAt: string | null
    result: DbQueryResult | null
}
export interface DbCancelResult {
    executionId: string; cancelRequested: boolean; state: DbExecutionState; outcome: DbOutcome | null
}
export interface DbSchema {
    database: string; name: string; kind: string; engine: string | null
    estimatedRows: number | null; sizeBytes: number | null
    columns: { ordinal: number; name: string; typeName: string; nullable: boolean; keyType: string | null; indexName: string | null; indexes?: { name: string; position: number; unique: boolean; type: string }[] }[]
}

export interface DbResourceSnapshot {
    dbConnectionId: string
    dbSessionId: string
    sessionGeneration: number
    configVersion: number
    targetDatabase: string | null
    targetContextVersion: number
}
export interface DbApprovalDetails {
    executionId: string
    sql: string
    riskReasons: string
    expiresAt: string
    impactNotice: string
    connectionNotice: string
    resourceSnapshot: DbResourceSnapshot
    target: { connectionName: string; host: string; port: number; username: string; tunnelSshConnectionId: string | null; configVersion: number }
}
export interface DbToolResult {
    executionId: string
    turnId: string
    targetDatabase: string | null
    state: DbExecutionState
    outcome: DbOutcome | null
    resultAvailable: boolean
    reason?: string
    result?: (Omit<DbQueryResult, 'affectedRows'> & { affectedRows: number | string | null; previewTruncated?: boolean }) | null
}
