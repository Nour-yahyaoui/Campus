//! Pure domain rules. No database, no HTTP, no clock hidden inside logic —
//! every decision is a total function over explicit inputs so it can be tested
//! without a running server and mirrored 1:1 in the TypeScript implementation.

use chrono::{DateTime, Duration, Utc};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RegistrationOutcome {
    /// A seat was available and is now taken.
    Registered,
    /// The event is full and the waitlist accepted the request.
    Waitlisted,
    /// The event is full and no waitlist is offered.
    Rejected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RegistrationState {
    Registered,
    Waitlisted,
    Cancelled,
    Attended,
    NoShow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CapacityError {
    AlreadyRegistered,
    RegistrationClosed,
    CapacityExhausted,
}

/// Mirrors `registerForEvent` in the TypeScript service, including the
/// rule that a full event with a waitlist never silently overbooks.
pub fn decide_registration(
    capacity: Option<i32>,
    confirmed: i64,
    waitlist_enabled: bool,
    existing: Option<RegistrationState>,
) -> Result<RegistrationOutcome, CapacityError> {
    if matches!(existing, Some(RegistrationState::Registered | RegistrationState::Attended | RegistrationState::Waitlisted)) {
        return Err(CapacityError::AlreadyRegistered);
    }
    match capacity {
        None => Ok(RegistrationOutcome::Registered),
        Some(limit) if limit <= 0 => Err(CapacityError::RegistrationClosed),
        Some(limit) if confirmed < i64::from(limit) => Ok(RegistrationOutcome::Registered),
        Some(_) if waitlist_enabled => Ok(RegistrationOutcome::Waitlisted),
        Some(_) => Err(CapacityError::CapacityExhausted),
    }
}

/// The first waiting person, by queue position, takes a freed seat. Positions
/// are 1-based and stable; ties break on signup time.
pub fn next_waitlisted(position: i64) -> bool {
    position == 1
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClubRole {
    Member,
    Officer,
    President,
}

impl ClubRole {
    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "member" => Some(Self::Member),
            "officer" => Some(Self::Officer),
            "president" => Some(Self::President),
            _ => None,
        }
    }

    /// Content edits need officer level; memberships officer level; granting
    /// roles and editing the public profile need the presidency.
    pub fn can_manage_content(self) -> bool {
        matches!(self, Self::Officer | Self::President)
    }

    pub fn can_manage_members(self) -> bool {
        matches!(self, Self::Officer | Self::President)
    }

    pub fn can_manage_roles(self) -> bool {
        matches!(self, Self::President)
    }
}

/// Feedback opens when the event has ended and stays open for a fortnight.
pub fn feedback_window(starts_at: DateTime<Utc>, ends_at: DateTime<Utc>, now: DateTime<Utc>) -> Result<(), &'static str> {
    if starts_at > ends_at {
        return Err("This event's start time is after its end time.");
    }
    if now < ends_at {
        return Err("Feedback opens when the event has ended.");
    }
    if now > ends_at + Duration::days(14) {
        return Err("The feedback window for this event has closed.");
    }
    Ok(())
}

/// Slugs are lowercase ASCII, hyphen separated, bounded, and never empty.
pub fn slugify(input: &str) -> String {
    let mut slug = String::with_capacity(input.len());
    let mut last_dash = true;
    for character in input.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            slug.push(character);
            last_dash = false;
        } else if !last_dash {
            slug.push('-');
            last_dash = true;
        }
    }
    let trimmed = slug.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "item".to_string()
    } else {
        trimmed.chars().take(80).collect::<String>().trim_end_matches('-').to_string()
    }
}

/// Open redirects are a classic OAuth bug; only same-site absolute paths pass.
pub fn safe_next(next: Option<&str>) -> String {
    match next {
        Some(value)
            if value.starts_with('/')
                && !value.starts_with("//")
                && !value.starts_with("/\\")
                && !value.contains(char::is_whitespace) =>
        {
            value.to_string()
        }
        _ => "/dashboard".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capacity_is_never_overbooked() {
        assert_eq!(decide_registration(Some(3), 2, false, None), Ok(RegistrationOutcome::Registered));
        assert_eq!(decide_registration(Some(3), 3, true, None), Ok(RegistrationOutcome::Waitlisted));
        assert_eq!(
            decide_registration(Some(3), 3, false, None),
            Err(CapacityError::CapacityExhausted)
        );
        assert_eq!(decide_registration(None, 9_999, false, None), Ok(RegistrationOutcome::Registered));
    }

    #[test]
    fn duplicate_registrations_are_refused() {
        assert_eq!(
            decide_registration(Some(10), 0, true, Some(RegistrationState::Waitlisted)),
            Err(CapacityError::AlreadyRegistered)
        );
        assert_eq!(
            decide_registration(Some(10), 0, true, Some(RegistrationState::Cancelled)),
            Ok(RegistrationOutcome::Registered)
        );
    }

    #[test]
    fn only_the_first_waitlisted_person_is_promoted() {
        assert!(next_waitlisted(1));
        assert!(!next_waitlisted(2));
    }

    #[test]
    fn role_permissions_are_ordered() {
        assert!(ClubRole::President.can_manage_roles());
        assert!(!ClubRole::Officer.can_manage_roles());
        assert!(ClubRole::Officer.can_manage_members());
        assert!(!ClubRole::Member.can_manage_content());
    }

    #[test]
    fn slugs_are_stable_and_readable() {
        assert_eq!(slugify("Solar charging bench for the courtyard!"), "solar-charging-bench-for-the-courtyard");
        assert_eq!(slugify("  Café — Société  "), "caf-soci-t");
        assert_eq!(slugify("***"), "item");
        assert_eq!(slugify("A".repeat(200).as_str()).len(), 80);
    }

    #[test]
    fn redirects_stay_on_site() {
        assert_eq!(safe_next(Some("/events/abc")), "/events/abc");
        assert_eq!(safe_next(Some("https://evil.example")), "/dashboard");
        assert_eq!(safe_next(Some("//evil.example")), "/dashboard");
        assert_eq!(safe_next(None), "/dashboard");
    }
}
