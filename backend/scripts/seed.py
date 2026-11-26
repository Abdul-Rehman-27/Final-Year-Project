"""Create the first admin (and a demo doctor). Run from /backend:  python -m scripts.seed

Doctor/admin accounts are created by the administrator (see assignment: only patients self-register).
"""
from app import models  # noqa: F401
from app.core.config import settings
from app.core.security import hash_password
from app.db.session import Base, SessionLocal, engine
from app.db.migrations.v002_role_scoped_user_email import upgrade as migrate_role_scoped_user_email
from app.models.user import Role, User
from app.services.auth_service import get_user_by_email
from sqlalchemy import select

SEEDS = [
    ("Hamza Raza", settings.SEED_ADMIN_EMAIL, settings.SEED_ADMIN_PASSWORD, Role.ADMIN.value),
    ("Dr. Imran Malik", settings.SEED_DOCTOR_EMAIL, settings.SEED_DOCTOR_PASSWORD, Role.DOCTOR.value),
]


def main() -> None:
    Base.metadata.create_all(bind=engine)
    migrate_role_scoped_user_email(engine)
    with SessionLocal() as db:
        # Preserve the original seeded admin account when upgrading an existing DB.
        if (
            settings.SEED_ADMIN_EMAIL != "admin@cityhospital.pk"
            and not get_user_by_email(db, settings.SEED_ADMIN_EMAIL, Role.ADMIN.value)
        ):
            legacy_admin = db.scalar(select(User).where(User.email == "admin@cityhospital.pk", User.role == Role.ADMIN.value))
            if legacy_admin:
                legacy_admin.email = settings.SEED_ADMIN_EMAIL.lower()
                db.commit()
        for name, email, password, role in SEEDS:
            if get_user_by_email(db, email, role):
                print(f"exists : {email}")
                continue
            db.add(User(full_name=name, email=email, password_hash=hash_password(password), role=role))
            print(f"created: {email} ({role})")
        db.commit()


if __name__ == "__main__":
    main()
