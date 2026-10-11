//! Values that come from the build configuration.

/// Project contact URL from the crate manifest. No product name in source (D34).
pub const CONTACT_URL: &str = env!("CARGO_PKG_REPOSITORY");

/// User-Agent for online services: `Name/version ( contact_url )` (R8, R31).
pub fn user_agent(name: &str, version: &str, contact_url: &str) -> String {
    format!("{name}/{version} ( {contact_url} )")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_agent_joins_name_version_and_contact_url() {
        assert_eq!(
            user_agent("Example", "1.2.3", "https://example.org/project"),
            "Example/1.2.3 ( https://example.org/project )"
        );
    }

    #[test]
    fn contact_url_comes_from_the_manifest() {
        assert!(CONTACT_URL.starts_with("https://"));
    }
}
