mod ai_secrets;
mod ssh;
mod ssh_secrets;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ssh::AppState::default())
        .invoke_handler(tauri::generate_handler![
            ai_secrets::ai_secret_save,
            ai_secrets::ai_secret_status,
            ai_secrets::ai_secret_read_for_request,
            ai_secrets::ai_secret_delete,
            ssh_secrets::ssh_credentials_save,
            ssh_secrets::ssh_credentials_read,
            ssh_secrets::ssh_credentials_delete,
            ssh::ssh_connect,
            ssh::ssh_test_connection,
            ssh::ssh_send_input,
            ssh::ssh_resize,
            ssh::ssh_disconnect
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
