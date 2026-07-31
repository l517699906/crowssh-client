use keyring::{Entry, Error};
use serde::Serialize;

const SERVICE: &str = "com.crowssh.ai";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretStatus {
    configured: bool,
    last_four: Option<String>,
}

fn entry(credential_id: &str) -> Result<Entry, String> {
    if credential_id.trim().is_empty() {
        return Err("密钥标识不能为空".to_string());
    }
    Entry::new(SERVICE, credential_id).map_err(|error| error.to_string())
}

fn last_four(secret: &str) -> String {
    let chars: Vec<char> = secret.chars().collect();
    chars[chars.len().saturating_sub(4)..].iter().collect()
}

#[tauri::command]
pub fn ai_secret_save(credential_id: String, secret: String) -> Result<SecretStatus, String> {
    let normalized = secret.trim();
    if normalized.is_empty() {
        return Err("API Key 不能为空".to_string());
    }

    entry(&credential_id)?
        .set_password(normalized)
        .map_err(|error| error.to_string())?;

    Ok(SecretStatus {
        configured: true,
        last_four: Some(last_four(normalized)),
    })
}

#[tauri::command]
pub fn ai_secret_status(credential_id: String) -> Result<SecretStatus, String> {
    match entry(&credential_id)?.get_password() {
        Ok(secret) => Ok(SecretStatus {
            configured: true,
            last_four: Some(last_four(&secret)),
        }),
        Err(Error::NoEntry) => Ok(SecretStatus {
            configured: false,
            last_four: None,
        }),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn ai_secret_read_for_request(credential_id: String) -> Result<String, String> {
    entry(&credential_id)?
        .get_password()
        .map_err(|error| match error {
            Error::NoEntry => "尚未保存 API Key".to_string(),
            other => other.to_string(),
        })
}

#[tauri::command]
pub fn ai_secret_delete(credential_id: String) -> Result<(), String> {
    match entry(&credential_id)?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}
