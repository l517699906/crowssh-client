use keyring::{Entry, Error};
use serde::{Deserialize, Serialize};

const SERVICE: &str = "com.crowssh.device";
const ACCOUNT: &str = "identity.v1";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceIdentity {
    principal_id: String,
    access_token: String,
}

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|error| error.to_string())
}

fn validate(principal_id: &str, access_token: &str) -> Result<(), String> {
    if principal_id.trim().is_empty() {
        return Err("设备身份标识不能为空".to_string());
    }
    if access_token.trim().is_empty() {
        return Err("设备访问令牌不能为空".to_string());
    }
    Ok(())
}

pub(crate) fn read_device_identity_value() -> Result<Option<DeviceIdentity>, String> {
    match entry()?.get_password() {
        Ok(serialized) => serde_json::from_str(&serialized)
            .map(Some)
            .map_err(|error| error.to_string()),
        Err(Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

pub(crate) fn current_principal_id() -> Result<String, String> {
    read_device_identity_value()?
        .map(|identity| identity.principal_id)
        .ok_or_else(|| "设备身份尚未初始化".to_string())
}

#[tauri::command]
pub fn device_identity_save(principal_id: String, access_token: String) -> Result<(), String> {
    validate(&principal_id, &access_token)?;
    let identity = DeviceIdentity {
        principal_id: principal_id.trim().to_string(),
        access_token: access_token.trim().to_string(),
    };
    let serialized = serde_json::to_string(&identity).map_err(|error| error.to_string())?;
    entry()?
        .set_password(&serialized)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn device_identity_read() -> Result<Option<DeviceIdentity>, String> {
    read_device_identity_value()
}

#[tauri::command]
pub fn device_identity_delete() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::DeviceIdentity;

    #[test]
    fn identity_uses_frontend_field_names() {
        let identity = DeviceIdentity {
            principal_id: "owner-a".to_string(),
            access_token: "token-a".to_string(),
        };

        let json = serde_json::to_value(&identity).unwrap();
        assert_eq!(json["principalId"], "owner-a");
        assert_eq!(json["accessToken"], "token-a");
    }
}
