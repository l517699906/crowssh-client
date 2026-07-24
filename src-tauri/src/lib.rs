mod ssh;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ssh::AppState::default())
        .invoke_handler(tauri::generate_handler![
            ssh::ssh_connect,
            ssh::ssh_test_connection,
            ssh::ssh_send_input,
            ssh::ssh_resize,
            ssh::ssh_disconnect
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
