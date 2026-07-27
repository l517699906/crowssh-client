// CrowSSH · 真实 SSH 交互式终端后端
// 基于 russh 0.62：连接 -> 认证 -> 请求 PTY + shell -> 拆分读写半 ->
// 后台 task 把 SSH 输出以原始字节(ArrayBuffer)推给前端，命令处理器负责输入/resize。
use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use russh::client::{self, Handle};
use russh::keys::{decode_secret_key, ssh_key, PrivateKeyWithHashAlg};
use russh::{compression, ChannelMsg, ChannelWriteHalf, Disconnect, Preferred};
use tauri::async_runtime::JoinHandle;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, State};

type SessionId = String;

/// 前端传入的认证参数（与 TS 联合类型对应）
#[derive(serde::Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AuthArg {
    Password {
        password: String,
    },
    Key {
        private_key: String,          // PEM 私钥内容
        passphrase: Option<String>,   // 可选口令
    },
}

/// 单个 SSH 会话：保留 handle 维持连接，写半供输入/resize，reader_task 泵出输出
struct SshSession {
    handle: Handle<ClientHandler>,
    writer: Arc<ChannelWriteHalf<client::Msg>>,
    reader_task: JoinHandle<()>,
}

#[derive(Clone, Default)]
pub struct AppState {
    sessions: Arc<Mutex<HashMap<SessionId, SshSession>>>,
}

/// SSH 客户端回调处理器
struct ClientHandler {
    host: String,
    port: u16,
    strict_host_key_check: bool,
}

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        if !self.strict_host_key_check {
            return Ok(true);
        }

        Ok(russh::keys::check_known_hosts(
            &self.host,
            self.port,
            server_public_key,
        )
        .unwrap_or(false))
    }
}

fn client_config(keepalive_interval: Option<u64>, enable_compression: bool) -> client::Config {
    let preferred = if enable_compression {
        Preferred {
            compression: Cow::Owned(vec![
                compression::ZLIB_LEGACY,
                compression::ZLIB,
                compression::NONE,
            ]),
            ..Preferred::default()
        }
    } else {
        Preferred::default()
    };

    client::Config {
        preferred,
        inactivity_timeout: None,
        keepalive_interval: keepalive_interval
            .filter(|seconds| *seconds > 0)
            .map(Duration::from_secs),
        ..Default::default()
    }
}

fn client_handler(host: &str, port: u16, strict_host_key_check: bool) -> ClientHandler {
    ClientHandler {
        host: host.to_owned(),
        port,
        strict_host_key_check,
    }
}

async fn authenticate(
    handle: &mut Handle<ClientHandler>,
    username: String,
    auth: AuthArg,
) -> Result<(), String> {
    let authed = match auth {
        AuthArg::Password { password } => handle
            .authenticate_password(username, password)
            .await
            .map_err(|e| format!("认证出错: {e}"))?
            .success(),
        AuthArg::Key {
            private_key,
            passphrase,
        } => {
            let key = decode_secret_key(&private_key, passphrase.as_deref())
                .map_err(|e| format!("私钥解析失败: {e}"))?;
            let alg = handle
                .best_supported_rsa_hash()
                .await
                .ok()
                .flatten()
                .flatten();
            handle
                .authenticate_publickey(username, PrivateKeyWithHashAlg::new(Arc::new(key), alg))
                .await
                .map_err(|e| format!("认证出错: {e}"))?
                .success()
        }
    };

    if !authed {
        return Err("认证失败：用户名、密码或私钥不正确".into());
    }
    Ok(())
}

/// 使用表单草稿验证 SSH 连通性与认证，不创建终端会话。
#[tauri::command]
pub async fn ssh_test_connection(
    host: String,
    port: u16,
    username: String,
    auth: AuthArg,
    connection_timeout: u64,
    compression: bool,
    strict_host_key_check: bool,
) -> Result<(), String> {
    let config = Arc::new(client_config(None, compression));
    let mut handle = tokio::time::timeout(
        Duration::from_secs(connection_timeout.max(1)),
        client::connect(
            config,
            (host.as_str(), port),
            client_handler(&host, port, strict_host_key_check),
        ),
    )
    .await
    .map_err(|_| format!("连接超时（{} 秒）", connection_timeout.max(1)))?
    .map_err(|e| format!("连接失败: {e}"))?;

    authenticate(&mut handle, username, auth).await?;
    let _ = handle
        .disconnect(Disconnect::ByApplication, "connection test complete", "en")
        .await;
    Ok(())
}

/// 建立连接并开启交互式 shell
#[tauri::command]
pub async fn ssh_connect(
    state: State<'_, AppState>,
    app: AppHandle,
    session_id: String,
    host: String,
    port: u16,
    username: String,
    auth: AuthArg,
    cols: u16,
    rows: u16,
    connection_timeout: u64,
    keepalive_interval: u64,
    compression: bool,
    startup_command: Option<String>,
    strict_host_key_check: bool,
    on_output: Channel,
) -> Result<(), String> {
    let config = Arc::new(client_config(Some(keepalive_interval), compression));

    // 连接 + 认证：全部在锁之外完成
    let mut handle: Handle<ClientHandler> = tokio::time::timeout(
        Duration::from_secs(connection_timeout.max(1)),
        client::connect(
            config,
            (host.as_str(), port),
            client_handler(&host, port, strict_host_key_check),
        ),
    )
    .await
    .map_err(|_| format!("连接超时（{} 秒）", connection_timeout.max(1)))?
    .map_err(|e| format!("连接失败: {e}"))?;

    authenticate(&mut handle, username, auth).await?;

    // 打开会话通道，请求 PTY + 交互式登录 shell
    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| format!("打开通道失败: {e}"))?;
    channel
        .request_pty(false, "xterm-256color", cols as u32, rows as u32, 0, 0, &[])
        .await
        .map_err(|e| format!("请求 PTY 失败: {e}"))?;
    channel
        .request_shell(true)
        .await
        .map_err(|e| format!("请求 shell 失败: {e}"))?;

    if let Some(command) = startup_command.filter(|command| !command.trim().is_empty()) {
        channel
            .data_bytes(format!("{}\n", command.trim()).into_bytes())
            .await
            .map_err(|e| format!("发送启动命令失败: {e}"))?;
    }

    let (mut read_half, write_half) = channel.split();
    let writer = Arc::new(write_half);

    // reader task：SSH 输出 -> 前端（原始字节，交由 xterm 解码 UTF-8）
    let sessions = state.sessions.clone();
    let sid = session_id.clone();
    let reader_task = tauri::async_runtime::spawn(async move {
        while let Some(msg) = read_half.wait().await {
            match msg {
                ChannelMsg::Data { ref data } => {
                    let _ = on_output.send(InvokeResponseBody::Raw(data.to_vec()));
                }
                ChannelMsg::ExtendedData { ref data, .. } => {
                    let _ = on_output.send(InvokeResponseBody::Raw(data.to_vec()));
                }
                ChannelMsg::Eof | ChannelMsg::Close | ChannelMsg::ExitStatus { .. } => break,
                _ => {}
            }
        }
        // 服务器主动关闭时自清理并通知前端
        sessions.lock().unwrap().remove(&sid);
        let _ = app.emit(&format!("ssh://closed/{sid}"), ());
    });

    state.sessions.lock().unwrap().insert(
        session_id,
        SshSession {
            handle,
            writer,
            reader_task,
        },
    );
    Ok(())
}

/// 写入终端输入
#[tauri::command]
pub async fn ssh_send_input(
    state: State<'_, AppState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let writer = {
        let map = state.sessions.lock().unwrap();
        map.get(&session_id).map(|s| s.writer.clone()) // 克隆 Arc 后立刻释放锁
    }
    .ok_or("会话不存在")?;
    writer
        .data(data.as_bytes())
        .await
        .map_err(|e| format!("写入失败: {e}"))
}

/// 同步终端窗口尺寸
#[tauri::command]
pub async fn ssh_resize(
    state: State<'_, AppState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let writer = {
        let map = state.sessions.lock().unwrap();
        map.get(&session_id).map(|s| s.writer.clone())
    }
    .ok_or("会话不存在")?;
    writer
        .window_change(cols as u32, rows as u32, 0, 0)
        .await
        .map_err(|e| format!("调整尺寸失败: {e}"))
}

/// 主动断开（幂等）
#[tauri::command]
pub async fn ssh_disconnect(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let session = state.sessions.lock().unwrap().remove(&session_id);
    if let Some(s) = session {
        let _ = s.writer.eof().await;
        s.reader_task.abort();
        let _ = s
            .handle
            .disconnect(Disconnect::ByApplication, "", "en")
            .await;
    }
    Ok(())
}
