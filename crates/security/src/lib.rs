//! Token handling shared by sessions, OAuth state and attendance codes.
//!
//! Raw tokens never touch the database: only their SHA-256 digest is stored, so
//! a database leak does not hand out live sessions. Comparisons are constant
//! time to avoid turning verification into a timing oracle.

use rand::RngCore;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

pub fn random_token(bytes: usize) -> String {
    let mut buffer = vec![0u8; bytes.max(16)];
    rand::thread_rng().fill_bytes(&mut buffer);
    hex::encode(buffer)
}

pub fn hash_token(raw: &str) -> String {
    let digest = Sha256::digest(raw.as_bytes());
    hex::encode(digest)
}

pub fn verify_token(raw: &str, expected_hash: &str) -> bool {
    let actual = hash_token(raw);
    actual.as_bytes().ct_eq(expected_hash.as_bytes()).into()
}

/// Check-in codes are short and human-shareable; ambiguity-prone characters are
/// removed so a code can be read aloud across a noisy room.
pub fn attendance_code() -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    let mut code = String::with_capacity(8);
    for _ in 0..8 {
        let index = (rng.next_u32() as usize) % ALPHABET.len();
        code.push(ALPHABET[index] as char);
    }
    code
}

/// The session cookie is HttpOnly, SameSite=Lax and Secure outside local dev.
pub fn session_cookie(token: &str, max_age_seconds: i64, secure: bool) -> String {
    let secure_flag = if secure { "; Secure" } else { "" };
    format!(
        "cs_session={token}; HttpOnly; Path=/; SameSite=Lax; Max-Age={max_age_seconds}{secure_flag}"
    )
}

pub fn clear_session_cookie(secure: bool) -> String {
    let secure_flag = if secure { "; Secure" } else { "" };
    format!("cs_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0{secure_flag}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_are_stable_and_not_reversible_looking() {
        let hash = hash_token("secret-token");
        assert_eq!(hash, hash_token("secret-token"));
        assert_eq!(hash.len(), 64);
        assert!(!hash.contains("secret"));
    }

    #[test]
    fn verification_rejects_wrong_tokens() {
        let hash = hash_token("correct");
        assert!(verify_token("correct", &hash));
        assert!(!verify_token("wrong", &hash));
    }

    #[test]
    fn codes_avoid_lookalike_characters() {
        for _ in 0..200 {
            let code = attendance_code();
            assert_eq!(code.len(), 8);
            assert!(!code.contains('O') && !code.contains('0'));
            assert!(!code.contains('I') && !code.contains('1'));
        }
    }

    #[test]
    fn cookies_carry_the_security_flags() {
        let cookie = session_cookie("abc", 3600, true);
        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.contains("Secure"));
        assert!(cookie.contains("SameSite=Lax"));
        assert!(clear_session_cookie(false).contains("Max-Age=0"));
    }
}
