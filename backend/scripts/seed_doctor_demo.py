"""Create optional doctor-portal demonstration data (never run automatically)."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.db.migrations.v004_admin_module import upgrade as upgrade_admin
from app.db.migrations.v005_doctor_portal import upgrade as upgrade_portal
from app.db.session import SessionLocal, engine
from app.models.admin import AdminDepartment, AdminStaffProfile
from app.models.portal import PortalAppointment, PortalDoctorSchedule
from app.models.user import User
from app.services.portal_core import assign_token

PEOPLE=[("Ayesha Khan",34,"female"),("Bilal Ahmed",52,"male"),("Kamran Ali",60,"male"),("Mariam Siddiqui",45,"female"),("Sidra Aslam",28,"female"),("Usman Tariq",39,"male"),("Zainab Iqbal",31,"female")]
def main():
    upgrade_admin(engine); upgrade_portal(engine)
    with SessionLocal() as db:
        doctor=db.scalar(select(User).where(User.email==settings.SEED_DOCTOR_EMAIL,User.role=="doctor"))
        if not doctor: raise SystemExit("Seeded doctor is missing; run python -m scripts.seed first")
        if db.scalar(select(User).where(User.email=="ayesha.khan@example.com")):
            print("already seeded"); return
        department=db.scalar(select(AdminDepartment).where(AdminDepartment.name=="Cardiology"))
        if not department: department=AdminDepartment(name="Cardiology",name_key="cardiology",description="");db.add(department);db.flush()
        if not db.get(AdminStaffProfile,doctor.id):db.add(AdminStaffProfile(user_id=doctor.id,department_id=department.id,specialty="Cardiologist"))
        now=datetime.now(timezone.utc); patients=[]
        for n,age,gender in PEOPLE:
            email=n.lower().replace(" ",".")+"@example.com"; p=User(full_name=n,email=email,password_hash=hash_password(settings.SEED_DEMO_PATIENT_PASSWORD),role="patient",gender=gender,date_of_birth=(now.date().replace(year=now.year-age)));db.add(p);patients.append(p)
        db.flush()
        for i,minutes in enumerate((-85,-70,-33,-3,12,27,57)):
            a=PortalAppointment(patient_id=patients[i].id,doctor_id=doctor.id,starts_at=now+timedelta(minutes=minutes),status="confirmed",room_label="Floor 2 · Room 12");db.add(a);db.flush();assign_token(db,a)
            if i==0:a.visit_status="completed";a.completed_at=now+timedelta(minutes=-60)
            elif i==1:a.visit_status="incomplete";a.completed_at=now+timedelta(minutes=-55)
            elif i==2:a.visit_status="in_progress";a.checked_in_at=now+timedelta(minutes=-40);a.called_at=now+timedelta(minutes=-22)
            elif i in (4,5):a.checked_in_at=now+timedelta(minutes=minutes-18)
        db.add(PortalAppointment(patient_id=patients[0].id,doctor_id=doctor.id,starts_at=now+timedelta(days=2),status="pending",room_label="Floor 2 · Room 12"))
        for day,start,end,slot in ((0,"14:00","17:00",15),(3,"10:30","12:45",45)):
            db.add(PortalDoctorSchedule(doctor_id=doctor.id,weekday=day,is_active=True,start_time=start,end_time=end,slot_minutes=slot,room_label="Floor 2 · Room 12"))
        db.commit();print("seeded doctor portal demo")
if __name__=="__main__":main()
