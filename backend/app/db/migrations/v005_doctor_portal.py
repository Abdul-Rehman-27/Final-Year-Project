from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import Base
from app.models.portal import PortalHospitalSettings, PortalLabTest

CATALOG = [
    ("Complete blood count", "lab", ""), ("Lipid profile", "lab", "Fasting is usually required — follow the lab's instructions."),
    ("Blood sugar", "lab", ""), ("Liver function", "lab", ""), ("Chest X-ray", "radiology", ""), ("ECG", "lab", ""),
]

def ensure_defaults(db: Session):
    if db.get(PortalHospitalSettings, 1) is None:
        db.add(PortalHospitalSettings(id=1))
    existing = set(db.scalars(select(PortalLabTest.name)).all())
    for name, kind, prep_note in CATALOG:
        if name not in existing:
            db.add(PortalLabTest(name=name, kind=kind, prep_note=prep_note))
    db.commit()

def upgrade(engine):
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        ensure_defaults(db)
