use keyring::{Entry, Error};
use serde::{Deserialize, Serialize};

const SERVICE: &str = "com.crowssh.ssh";

#[derive(Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SshCredentials {
    Password { password: String },
    Key {
        #[serde(rename = "privateKey")]
        private_key: String,
        passphrase: Option<String>,
    },
}

fn entry(connection_id: &str) -> Result<Entry, String> {
    if connection_id.trim().is_empty() {
        return Err("服务器标识不能为空".to_string());
    }
    Entry::new(SERVICE, connection_id).map_err(|error| error.to_string())
}

fn validate_credentials(credentials: &SshCredentials) -> Result<(), String> {
    match credentials {
        SshCredentials::Password { password } if password.is_empty() => {
            Err("服务器密码不能为空".to_string())
        }
        SshCredentials::Key { private_key, .. } if private_key.trim().is_empty() => {
            Err("服务器私钥不能为空".to_string())
        }
        _ => Ok(()),
    }
}

#[tauri::command]
pub fn ssh_credentials_save(
    connection_id: String,
    credentials: SshCredentials,
) -> Result<(), String> {
    validate_credentials(&credentials)?;
    let serialized = serde_json::to_string(&credentials).map_err(|error| error.to_string())?;
    entry(&connection_id)?
        .set_password(&serialized)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn ssh_credentials_read(connection_id: String) -> Result<Option<SshCredentials>, String> {
    match entry(&connection_id)?.get_password() {
        Ok(serialized) => serde_json::from_str(&serialized)
            .map(Some)
            .map_err(|error| error.to_string()),
        Err(Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn ssh_credentials_delete(connection_id: String) -> Result<(), String> {
    match entry(&connection_id)?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::SshCredentials;

    #[test]
    fn key_credentials_use_frontend_field_names() {
        let credentials = SshCredentials::Key {
            private_key: "private-key".to_string(),
            passphrase: Some("passphrase".to_string()),
        };

        let json = serde_json::to_value(&credentials).unwrap();
        assert_eq!(json["type"], "key");
        assert_eq!(json["privateKey"], "private-key");
        assert_eq!(json["passphrase"], "passphrase");
        assert!(serde_json::from_value::<SshCredentials>(json).is_ok());
    }
}
