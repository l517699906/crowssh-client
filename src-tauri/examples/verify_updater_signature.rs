use base64::{engine::general_purpose::STANDARD, Engine as _};
use minisign_verify::{PublicKey, Signature};
use std::{env, error::Error, fs, path::Path};

fn decode_base64_text(value: &str, label: &str) -> Result<String, Box<dyn Error>> {
    let decoded = STANDARD
        .decode(value.trim())
        .map_err(|_| format!("{label} is not valid base64"))?;
    String::from_utf8(decoded).map_err(|_| format!("{label} is not valid UTF-8").into())
}

fn main() -> Result<(), Box<dyn Error>> {
    let mut args = env::args().skip(1);
    let public_key = args.next().ok_or("missing updater public key")?;
    let artifact_path = args.next().ok_or("missing updater artifact path")?;
    let signature_path = args.next().ok_or("missing updater signature path")?;
    if args.next().is_some() {
        return Err("unexpected verifier arguments".into());
    }

    let public_key = PublicKey::decode(&decode_base64_text(&public_key, "public key")?)?;
    let signature = fs::read_to_string(&signature_path)?;
    let signature = Signature::decode(&decode_base64_text(&signature, "signature")?)?;
    let artifact = fs::read(&artifact_path)?;
    public_key.verify(&artifact, &signature, true)?;

    println!(
        "updater-signature: verified {}",
        Path::new(&artifact_path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("artifact")
    );
    Ok(())
}
