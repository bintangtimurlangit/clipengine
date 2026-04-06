"""Tests for clipengine_api.passwords — bcrypt hashing/verification."""

from __future__ import annotations


def test_hash_password_returns_bcrypt_string() -> None:
    from clipengine_api.passwords import hash_password

    h = hash_password("mysecret")
    assert h.startswith("$2b$") or h.startswith("$2a$")


def test_hash_password_different_salts() -> None:
    from clipengine_api.passwords import hash_password

    h1 = hash_password("same")
    h2 = hash_password("same")
    assert h1 != h2  # different salts → different hashes


def test_verify_password_correct() -> None:
    from clipengine_api.passwords import hash_password, verify_password

    h = hash_password("correct")
    assert verify_password("correct", h) is True


def test_verify_password_wrong_password() -> None:
    from clipengine_api.passwords import hash_password, verify_password

    h = hash_password("correct")
    assert verify_password("wrong", h) is False


def test_verify_password_empty_password() -> None:
    from clipengine_api.passwords import hash_password, verify_password

    h = hash_password("")
    assert verify_password("", h) is True
    assert verify_password("notempty", h) is False


def test_verify_password_invalid_hash_returns_false() -> None:
    from clipengine_api.passwords import verify_password

    assert verify_password("password", "not-a-valid-hash") is False


def test_verify_password_unicode() -> None:
    from clipengine_api.passwords import hash_password, verify_password

    pw = "pässwörd🔒"
    h = hash_password(pw)
    assert verify_password(pw, h) is True
    assert verify_password("passw0rd", h) is False
