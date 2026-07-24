use super::{EngineError, EngineResult};

pub(crate) fn assert_safe_theme_id(id: &str) -> EngineResult<()> {
    if id.is_empty()
        || id.len() > 80
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(EngineError::Message("主题 ID 不合法".into()));
    }
    Ok(())
}

pub(crate) fn safe_theme_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|c| !c.is_control())
        .collect::<String>()
        .trim()
        .chars()
        .take(40)
        .collect();
    if cleaned.is_empty() {
        "我的主题".into()
    } else {
        cleaned
    }
}

pub(crate) fn safe_theme_text(value: Option<&str>, fallback: &str, max_chars: usize) -> String {
    let cleaned: String = value
        .unwrap_or("")
        .chars()
        .filter(|c| !c.is_control() && *c != '\u{2028}' && *c != '\u{2029}')
        .collect::<String>()
        .trim()
        .chars()
        .take(max_chars)
        .collect();
    if cleaned.is_empty() {
        fallback.to_string()
    } else {
        cleaned
    }
}

pub(crate) fn safe_accent_color(value: Option<&str>) -> EngineResult<Option<String>> {
    let Some(raw) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let valid = raw.len() == 7
        && raw.starts_with('#')
        && raw[1..].chars().all(|character| character.is_ascii_hexdigit());
    if !valid {
        return Err(EngineError::Message(
            "强调色必须是六位十六进制颜色，例如 #e08a91".into(),
        ));
    }
    Ok(Some(raw.to_ascii_lowercase()))
}

pub(crate) fn safe_unit_value(value: Option<f64>, label: &str) -> EngineResult<Option<f64>> {
    let Some(value) = value else {
        return Ok(None);
    };
    if !value.is_finite() || !(0.0..=1.0).contains(&value) {
        return Err(EngineError::Message(format!(
            "{label} 必须是 0 到 1 之间的数字"
        )));
    }
    Ok(Some(value))
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn theme_id_allows_safe_values() {
        assert!(assert_safe_theme_id("preset-little-cat").is_ok());
        assert!(assert_safe_theme_id("img-123_abc").is_ok());
    }

    #[test]
    fn theme_id_rejects_invalid_values() {
        assert!(assert_safe_theme_id("").is_err());
        assert!(assert_safe_theme_id("../etc").is_err());
        assert!(assert_safe_theme_id("bad id").is_err());
        assert!(assert_safe_theme_id(&"a".repeat(81)).is_err());
    }

    #[test]
    fn theme_name_is_trimmed_and_capped() {
        assert_eq!(safe_theme_name("  midnight  "), "midnight");
        assert_eq!(safe_theme_name(""), "我的主题");
        let long = "字" .repeat(100);
        assert!(safe_theme_name(&long).chars().count() <= 40);
    }

    #[test]
    fn accent_color_validation() {
        assert_eq!(safe_accent_color(Some("#e08a91")).unwrap(), Some("#e08a91".into()));
        assert_eq!(safe_accent_color(Some("#AABBCC")).unwrap(), Some("#aabbcc".into()));
        assert!(safe_accent_color(Some("red")).is_err());
        assert_eq!(safe_accent_color(None).unwrap(), None);
    }

    #[test]
    fn unit_value_clamps_range() {
        assert_eq!(safe_unit_value(Some(0.5), "x").unwrap(), Some(0.5));
        assert!(safe_unit_value(Some(-0.1), "x").is_err());
        assert!(safe_unit_value(Some(1.1), "x").is_err());
        assert_eq!(safe_unit_value(None, "x").unwrap(), None);
    }
}
