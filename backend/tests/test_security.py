from app.security import hash_password, verify_password


def test_correct_password_is_accepted() -> None:
    password = "Example password for tests only"
    stored_hash = hash_password(password)

    assert stored_hash != password
    assert verify_password(password, stored_hash) is True


def test_wrong_password_is_rejected() -> None:
    stored_hash = hash_password("Correct test password")

    assert verify_password("Wrong test password", stored_hash) is False


def test_same_password_produces_different_hashes() -> None:
    password = "Another test-only password"

    first_hash = hash_password(password)
    second_hash = hash_password(password)

    assert first_hash != second_hash
    assert verify_password(password, first_hash) is True
    assert verify_password(password, second_hash) is True