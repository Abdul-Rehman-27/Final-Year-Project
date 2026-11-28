from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import Base
from app.models.admin import AdminDepartment, AdminModuleState, AdminPermission, AdminRole


DEFAULT_DEPARTMENTS = [
    ("Cardiology", "Heart and blood vessel care"),
    ("Pediatrics", "Children's health"),
    ("Dermatology", "Skin, hair and nails"),
    ("Pharmacy", "Medicines and dispensing"),
    ("Nursing", "Ward and patient care"),
    ("Reception", "Front desk and appointments"),
    ("Administration", "Hospital management"),
]
DEFAULT_PERMISSIONS = [
    ("View", "view", "See records and pages"),
    ("Create", "create", "Add new records"),
    ("Edit", "edit", "Change existing records"),
    ("Delete", "delete", "Remove records"),
]
DEFAULT_ROLES = [
    ("doctor", "Doctor", "", ["view", "create", "edit"]),
    ("receptionist", "Receptionist", "", ["view", "create", "edit"]),
    ("pharmacist", "Pharmacist", "", ["view", "create", "edit"]),
    ("nurse", "Nurse", "", ["view", "edit"]),
    ("admin", "Admin", "", ["view", "create", "edit", "delete"]),
]


def upgrade(engine):
    """Create persistent Admin entities and install built-in data once."""
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        if db.get(AdminModuleState, "admin-defaults-v1"):
            return

        departments = {row.name_key: row for row in db.scalars(select(AdminDepartment)).all()}
        for name, description in DEFAULT_DEPARTMENTS:
            key = name.casefold()
            if key not in departments:
                row = AdminDepartment(name=name, name_key=key, description=description)
                db.add(row)
                departments[key] = row

        permissions = {row.code: row for row in db.scalars(select(AdminPermission)).all()}
        for name, code, description in DEFAULT_PERMISSIONS:
            if code not in permissions:
                row = AdminPermission(name=name, name_key=name.casefold(), code=code, description=description)
                db.add(row)
                permissions[code] = row

        db.flush()
        roles = {row.key: row for row in db.scalars(select(AdminRole)).all()}
        for key, name, description, permission_codes in DEFAULT_ROLES:
            role = roles.get(key)
            if role is None:
                role = AdminRole(key=key, name=name, name_key=name.casefold(), description=description, system=True)
                db.add(role)
            role.system = True
            role.permissions = [permissions[code] for code in permission_codes]

        db.add(AdminModuleState(key="admin-defaults-v1"))
        db.commit()
