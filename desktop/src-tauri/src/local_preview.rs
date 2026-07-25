use serde::Serialize;
use std::net::{IpAddr, SocketAddr, TcpStream};
use std::time::Duration;
use url::{Host, Url};

const MAX_URL_LENGTH: usize = 2_048;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    reachable: bool,
    normalized_url: String,
    message: String,
}

pub fn normalize_loopback_url(raw: &str) -> Result<Url, String> {
    let candidate = raw.trim();
    if candidate.is_empty() || candidate.len() > MAX_URL_LENGTH {
        return Err("L’adresse locale est vide ou trop longue.".into());
    }

    let mut url =
        Url::parse(candidate).map_err(|_| "L’adresse locale n’est pas une URL valide.")?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("La preview locale doit utiliser HTTP ou HTTPS.".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Une URL de preview ne doit contenir aucun identifiant.".into());
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err("La preview locale ne doit contenir ni query string ni fragment.".into());
    }

    match url.host() {
        Some(Host::Domain(domain)) if domain.eq_ignore_ascii_case("localhost") => {
            url.set_host(Some("127.0.0.1"))
                .map_err(|_| "Impossible de normaliser l’adresse locale.")?;
        }
        Some(Host::Ipv4(address)) if address.is_loopback() => {}
        Some(Host::Ipv6(address)) if address.is_loopback() => {}
        _ => {
            return Err(
                "Seule une cible loopback explicite (127.0.0.1, localhost ou ::1) est autorisée."
                    .into(),
            )
        }
    }

    if url.port_or_known_default().is_none() {
        return Err("Le port de la preview est introuvable.".into());
    }

    Ok(url)
}

fn socket_address(url: &Url) -> Result<SocketAddr, String> {
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "Le port de la preview est introuvable.".to_string())?;
    let ip = match url.host() {
        Some(Host::Ipv4(address)) => IpAddr::V4(address),
        Some(Host::Ipv6(address)) => IpAddr::V6(address),
        _ => return Err("La cible locale n’a pas pu être normalisée.".into()),
    };
    Ok(SocketAddr::new(ip, port))
}

#[tauri::command]
pub fn probe_preview(url: String) -> Result<ProbeResult, String> {
    let normalized = normalize_loopback_url(&url)?;
    let address = socket_address(&normalized)?;
    let reachable = TcpStream::connect_timeout(&address, Duration::from_millis(650)).is_ok();

    Ok(ProbeResult {
        reachable,
        normalized_url: normalized.to_string(),
        message: if reachable {
            format!("Le port {} accepte les connexions locales.", address.port())
        } else {
            format!(
                "Aucune réponse sur le port {}. Le serveur démarre peut-être encore.",
                address.port()
            )
        },
    })
}

#[cfg(test)]
mod tests {
    use super::normalize_loopback_url;

    #[test]
    fn accepts_and_normalizes_loopback_urls() {
        let normalized = normalize_loopback_url("http://localhost:3000/preview").unwrap();
        assert_eq!(normalized.host_str(), Some("127.0.0.1"));
        assert_eq!(normalized.port(), Some(3000));
    }

    #[test]
    fn rejects_remote_and_credentialed_urls() {
        assert!(normalize_loopback_url("https://example.com").is_err());
        assert!(normalize_loopback_url("http://user:pass@127.0.0.1:3000").is_err());
        assert!(normalize_loopback_url("http://127.0.0.1:3000?token=secret").is_err());
    }
}
