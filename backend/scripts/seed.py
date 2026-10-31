"""Create the first admin (and a demo doctor). Run from /backend:  python -m scripts.seed

Doctor/admin accounts are created by the administrator (see assignment: only patients self-register).
"""
from app import models  # noqa: F401
from app.core.config import settings
from app.core.security import hash_password
from app.db.session import Base, SessionLocal, engine
from app.models.user import Role, User
from app.services.auth_service import get_user_by_email

SEEDS = [
    ("Hamza Raza", settings.SEED_ADMIN_EMAIL, settings.SEED_ADMIN_PASSWORD, Role.ADMIN.value),
    ("Dr. Imran Malik", "imran.malik@cityhospital.pk", "Doctor@12345", Role.DOCTOR.value),
]


def main() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        for name, email, password, role in SEEDS:
            if get_user_by_email(db, email):
                print(f"exists : {email}")
                continue
            db.add(User(full_name=name, email=email, password_hash=hash_password(password), role=role))
            print(f"created: {email} ({role})")
        db.commit()


if __name__ == "__main__":
    main()
