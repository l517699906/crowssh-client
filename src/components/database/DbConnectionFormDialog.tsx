import { useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Database, Eye, EyeOff, LoaderCircle, PlugZap, SlidersHorizontal, X } from 'lucide-react'
import type { ServerConfig } from '../../types'
import type { DbAllowedColumn, DbConnectionConfig, DbConnectionPayload, DbSecretAction, DbSslMode, DbTestResult } from '../../types/database'
import { testConnection } from '../../api/dbConnection'

const capabilityNames: Record<string, string> = { INSTANCE: '实例指标', PROCESSES: '进程诊断', LOCKS: '锁等待诊断' }
const capabilityStates: Record<string, string> = {
    AVAILABLE: '可用', PERMISSION_DENIED: '权限不足', DISABLED: '采集已关闭',
    UNSUPPORTED: '版本不支持', TEMPORARILY_UNAVAILABLE: '暂时不可用',
}

interface NumberFieldProps {
    label: string
    value: number
    min: number
    max: number
    onChange: (value: number) => void
}

function NumberField({ label, value, min, max, onChange }: NumberFieldProps) {
    const input = useRef<HTMLInputElement>(null)
    const step = (direction: number) => {
        const field = input.current
        if (!field) return
        if (direction > 0) field.stepUp()
        else field.stepDown()
        onChange(field.valueAsNumber)
    }
    return <label>{label}<span className="db-number-input">
        <input ref={input} type="number" required min={min} max={max} step={1} value={Number.isNaN(value) ? '' : value} onChange={(event) => onChange(event.target.valueAsNumber)} />
        <span className="db-number-buttons">
            <button type="button" aria-label={`增加${label}`} disabled={value >= max} onClick={() => step(1)}><ChevronUp size={12} /></button>
            <button type="button" aria-label={`减少${label}`} disabled={value <= min} onClick={() => step(-1)}><ChevronDown size={12} /></button>
        </span>
    </span></label>
}

interface Props {
    initial?: DbConnectionConfig
    servers: ServerConfig[]
    onSave: (payload: DbConnectionPayload) => Promise<string | null>
    onClose: () => void
}

export function DbConnectionFormDialog({ initial, servers, onSave, onClose }: Props) {
    const [activeSection, setActiveSection] = useState<'basic' | 'advanced'>('basic')
    const [passwordVisible, setPasswordVisible] = useState(false)
    const form = useRef<HTMLFormElement>(null)
    const [value, setValue] = useState({
        connectionName: initial?.connectionName ?? '', host: initial?.host ?? '', port: initial?.port ?? 3306,
        username: initial?.username ?? '', defaultDatabase: initial?.defaultDatabase ?? '',
        sslMode: initial?.sslMode ?? 'VERIFY_IDENTITY' as DbSslMode, tlsServerName: initial?.tlsServerName ?? '',
        tunnelSshConnectionId: initial?.tunnelSshConnectionId ?? '', connectTimeout: initial?.connectTimeout ?? 10,
        queryTimeout: initial?.queryTimeout ?? 60, maxRows: initial?.maxRows ?? 1000,
        aiDataMode: initial?.aiDataMode ?? 'METADATA_ONLY',
    })
    const [passwordAction, setPasswordAction] = useState<DbSecretAction>(initial ? 'KEEP' : 'REPLACE')
    const [password, setPassword] = useState('')
    const [caAction, setCaAction] = useState<DbSecretAction>(initial ? 'KEEP' : 'CLEAR')
    const [ca, setCa] = useState('')
    const [columns, setColumns] = useState<DbAllowedColumn[]>(initial?.aiAllowedColumns ?? [])
    const [error, setError] = useState<string | null>(null)
    const [test, setTest] = useState<DbTestResult | null>(null)
    const [operation, setOperation] = useState<'test' | 'save' | null>(null)
    const busy = operation !== null
    const running = useRef(false)
    const patch = (change: Partial<typeof value>) => { setValue((old) => ({ ...old, ...change })); setTest(null) }
    const submit = async (testing: boolean) => {
        if (running.current) return
        const invalid = form.current?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:invalid, select:invalid, textarea:invalid')
        if (invalid) {
            setActiveSection(invalid.closest('[data-section]')?.getAttribute('data-section') === 'advanced' ? 'advanced' : 'basic')
            setError('请检查必填项与数值范围')
            setTest(null)
            requestAnimationFrame(() => { invalid.focus(); invalid.reportValidity() })
            return
        }
        if (!value.connectionName.trim() || !value.host.trim() || !value.username.trim()) { setActiveSection('basic'); setError('请填写连接名称、主机和账号'); return }
        if (passwordAction === 'REPLACE' && !password) { setError('请输入新密码，空密码请选择“清空”'); return }
        if (value.aiDataMode === 'ALLOWLIST' && (!columns.length || columns.some((item) => !item.database || !item.table || !item.column))) { setActiveSection('advanced'); setError('请填写完整的库、表、列允许规则'); return }
        running.current = true; setOperation(testing ? 'test' : 'save'); setError(null); setTest(null)
        const payload: DbConnectionPayload = {
            ...value, username: value.username.trim(), dbType: 'MYSQL', host: value.host.trim(), connectionName: value.connectionName.trim(),
            connectionId: initial?.connectionId, expectedConfigVersion: initial?.configVersion,
            defaultDatabase: value.defaultDatabase || null, tlsServerName: value.tlsServerName || null,
            tunnelSshConnectionId: value.tunnelSshConnectionId || null,
            passwordAction, password: passwordAction === 'REPLACE' ? password : undefined,
            caCertificateAction: caAction, caCertificatePem: caAction === 'REPLACE' ? ca : undefined,
            aiAllowedColumns: value.aiDataMode === 'ALLOWLIST' ? columns : [],
        }
        try {
            if (testing) {
                const response = await testConnection(payload)
                if (response.code === '0000' && response.data) setTest(response.data)
                else setError(response.info || `连接测试失败（${response.code}）`)
            } else {
                const problem = await onSave(payload)
                if (problem) setError(problem)
                else onClose()
            }
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : '连接操作失败，请重试')
        } finally { running.current = false; setOperation(null) }
    }
    return <div className="modal-overlay"><form ref={form} noValidate className="modal-card db-form" role="dialog" aria-modal="true" aria-labelledby="db-form-title" onSubmit={(event) => { event.preventDefault(); void submit(false) }}>
        <div className="modal-header"><strong className="modal-title" id="db-form-title">{initial ? '编辑 MySQL 连接' : '新建 MySQL 连接'}</strong><button type="button" className="icon-btn" disabled={busy} onClick={onClose} aria-label="关闭"><X size={16} /></button></div>
        <div className="server-form-tabs" role="tablist" aria-label="MySQL 连接设置">
            {(['basic', 'advanced'] as const).map((section) => <button type="button" role="tab" key={section} id={`db-tab-${section}`} aria-controls={`db-panel-${section}`} aria-selected={activeSection === section} tabIndex={activeSection === section ? 0 : -1} onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                event.preventDefault()
                const next = event.key === 'Home' ? 'basic' : event.key === 'End' ? 'advanced' : section === 'basic' ? 'advanced' : 'basic'
                setActiveSection(next)
                document.getElementById(`db-tab-${next}`)?.focus()
            }} className={activeSection === section ? 'active' : ''} onClick={() => setActiveSection(section)}>{section === 'basic' ? <Database size={14} /> : <SlidersHorizontal size={14} />}{section === 'basic' ? '基础设置' : '高级设置'}</button>)}
        </div>
        <fieldset disabled={busy} className="modal-body db-form-fields" onChange={() => setError(null)}>
          <div className="db-form-section" data-section="basic" role="tabpanel" id="db-panel-basic" aria-labelledby="db-tab-basic" hidden={activeSection !== 'basic'}>
            <p className="db-form-hint">设置 MySQL 地址与登录凭据，连接由 CrowSSH 服务端发起。</p>
            <label className="db-field-wide">连接名称<input placeholder="例如：开发数据库" required maxLength={128} value={value.connectionName} onChange={(event) => patch({ connectionName: event.target.value })} /></label>
            <label>主机<input placeholder="数据库域名或 IP" required maxLength={255} value={value.host} onChange={(event) => patch({ host: event.target.value })} /></label>
            <NumberField label="端口" min={1} max={65535} value={value.port} onChange={(port) => patch({ port })} />
            <label>账号<input required maxLength={128} autoComplete="off" value={value.username} onChange={(event) => patch({ username: event.target.value })} /></label>
            <label>密码方式<select value={passwordAction} onChange={(event) => { setPasswordAction(event.target.value as DbSecretAction); setPassword(''); setPasswordVisible(false); setTest(null) }}>
                {initial && <option value="KEEP">保留（{initial.hasPassword ? '已设置' : '空密码'}）</option>}<option value="REPLACE">{initial ? '设置新密码' : '使用密码'}</option><option value="CLEAR">清空，使用空密码</option>
            </select></label>
            {passwordAction === 'REPLACE' && <label className="db-field-wide">密码<span className="password-input"><input type={passwordVisible ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={(event) => { setPassword(event.target.value); setTest(null) }} /><button type="button" className="icon-btn password-visibility" aria-label={passwordVisible ? '隐藏密码' : '显示密码'} aria-pressed={passwordVisible} onClick={() => setPasswordVisible((visible) => !visible)}>{passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>}
            <label>默认数据库<input maxLength={64} value={value.defaultDatabase} onChange={(event) => patch({ defaultDatabase: event.target.value })} /></label>
            <label>SSH 跳板<select value={value.tunnelSshConnectionId} onChange={(event) => patch({ tunnelSshConnectionId: event.target.value })}>
                <option value="">直连</option>{servers.map((server) => <option key={server.id} value={server.id}>{server.name} · {server.host}</option>)}
            </select></label>
            {value.tunnelSshConnectionId && <p>隧道目标主机须填写经服务端允许的 IP 地址；证书身份单独填写。</p>}
          </div>
          <div className="db-form-section" data-section="advanced" role="tabpanel" id="db-panel-advanced" aria-labelledby="db-tab-advanced" hidden={activeSection !== 'advanced'}>
            <h3 className="db-form-group-title">安全与证书</h3>
            <label>TLS 模式<select value={value.sslMode} onChange={(event) => patch({ sslMode: event.target.value as DbSslMode })}>
                <option value="VERIFY_IDENTITY">验证 CA 与服务器身份（默认）</option><option value="VERIFY_CA">只验证 CA</option><option value="REQUIRED">只要求加密</option><option value="PREFERRED">优先加密，允许明文</option><option value="DISABLED">禁用 TLS</option>
            </select></label>
            {value.sslMode !== 'VERIFY_IDENTITY' && <p role="note">当前模式不验证服务器身份。PREFERRED 和 DISABLED 还可能使用明文传输。</p>}
            <label>证书 DNS / IP 身份<input value={value.tlsServerName} onChange={(event) => patch({ tlsServerName: event.target.value })} placeholder="默认使用直连主机" /></label>
            <label>CA 公共证书<select value={caAction} onChange={(event) => { setCaAction(event.target.value as DbSecretAction); setCa(''); setTest(null) }}>
                {initial && <option value="KEEP">保留（{initial.hasCaCertificate ? '已设置' : '系统信任库'}）</option>}<option value="REPLACE">替换 PEM 证书链</option><option value="CLEAR">清空，使用系统信任库</option>
            </select></label>
            {caAction === 'REPLACE' && <label className="db-field-wide">PEM 公共证书链<textarea required value={ca} maxLength={65536} onChange={(event) => { setCa(event.target.value); setTest(null) }} placeholder="-----BEGIN CERTIFICATE-----" /></label>}
            <h3 className="db-form-group-title">AI 数据访问</h3>
            <label className="db-field-wide">AI 数据范围<select value={value.aiDataMode} onChange={(event) => patch({ aiDataMode: event.target.value as 'METADATA_ONLY' | 'ALLOWLIST' })}><option value="METADATA_ONLY">仅结构与诊断</option><option value="ALLOWLIST">开放指定库表列</option></select></label>
            <p>AI 使用独立连接。只开放适合发送给当前模型的数据；SQL 写操作仍须逐次审批。</p>
            {value.aiDataMode === 'ALLOWLIST' && <div className="db-column-rules">
                {columns.map((item, index) => <div className="db-column-rule" key={index}>{(['database', 'table', 'column'] as const).map((field) => <input key={field} required aria-label={`${index + 1} ${field}`} placeholder={field} value={item[field]} onChange={(event) => { setColumns((old) => old.map((row, i) => i === index ? { ...row, [field]: event.target.value } : row)); setTest(null) }} />)}<button type="button" className="btn" onClick={() => { setColumns((old) => old.filter((_, i) => i !== index)); setTest(null) }}>移除</button></div>)}
                <button type="button" className="btn" onClick={() => { setColumns((old) => [...old, { database: '', table: '', column: '' }]); setTest(null) }}>添加精确列规则</button>
            </div>}
            <h3 className="db-form-group-title">超时与结果限制</h3>
            <NumberField label="建连超时（秒）" min={1} max={30} value={value.connectTimeout} onChange={(connectTimeout) => patch({ connectTimeout })} />
            <NumberField label="查询超时（秒）" min={1} max={120} value={value.queryTimeout} onChange={(queryTimeout) => patch({ queryTimeout })} />
            <NumberField label="最多结果行" min={1} max={5000} value={value.maxRows} onChange={(maxRows) => patch({ maxRows })} />
          </div>
        </fieldset>
        {error && <p className="db-message db-form-error" role="alert">{error}</p>}
        {test && <div className="db-message db-form-success" role="status">MySQL {test.serverVersion} · TLS {test.tlsEncrypted ? '已加密' : '未加密'} · 身份{test.tlsIdentityVerified ? '已验证' : '未验证'}<p>诊断能力：{test.capabilityStates && Object.keys(test.capabilityStates).length > 0
            ? Object.entries(test.capabilityStates).map(([name, state]) => `${capabilityNames[name] ?? name}：${capabilityStates[state] ?? '未知状态'}`).join('；')
            : '服务端未提供探测结果'}</p></div>}
        <div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>取消</button><button type="button" className="btn" disabled={busy} onClick={() => void submit(true)}>{operation === 'test' ? <LoaderCircle size={14} className="spin" /> : <PlugZap size={14} />}{operation === 'test' ? '测试中…' : '测试连接'}</button><button className="btn btn-primary" disabled={busy} type="submit">{operation === 'save' ? '保存中…' : '保存连接'}</button></div>
    </form></div>
}
