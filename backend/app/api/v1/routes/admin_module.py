import re
import secrets
import string
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_roles
from app.core.security import hash_password
from app.db.session import get_db
from app.models.admin import AdminDepartment, AdminPermission, AdminRole, AdminStaffProfile, admin_role_permissions
from app.models.user import User
from app.schemas.admin import DepartmentIn, PermissionIn, RoleIn, RolePermissionsIn, StaffIn
from app.services.chatbot_admin import write_audit

router = APIRouter(prefix="/admin", tags=["admin module"], dependencies=[Depends(require_roles("admin"))])


def _raise_integrity(error_code: str):
    raise HTTPException(status.HTTP_409_CONFLICT, error_code)


def _department_data(db: Session, row: AdminDepartment) -> dict:
    staff_count = db.scalar(select(func.count(User.id)).join(AdminStaffProfile, AdminStaffProfile.user_id == User.id).where(AdminStaffProfile.department_id == row.id)) or 0
    return {"id": row.id, "name": row.name, "description": row.description, "staffCount": int(staff_count)}


def _permission_data(db: Session, row: AdminPermission) -> dict:
    count = db.scalar(select(func.count()).select_from(admin_role_permissions).where(admin_role_permissions.c.permission_id == row.id)) or 0
    return {"id": row.id, "name": row.name, "code": row.code, "description": row.description, "roleCount": int(count)}


def _role_data(db: Session, row: AdminRole) -> dict:
    member_count = db.scalar(select(func.count(User.id)).where(User.role == row.key, User.role != "patient")) or 0
    return {"id": row.id, "key": row.key, "name": row.name, "description": row.description, "system": row.system,
            "permissionIds": sorted(permission.id for permission in row.permissions), "memberCount": int(member_count)}


def _staff_data(db: Session, user: User, profile: AdminStaffProfile | None) -> dict:
    return {
        "id": user.id,
        "fullName": user.full_name,
        "email": user.email,
        "phone": user.phone or "",
        "role": user.role,
        "departmentId": profile.department_id if profile else None,
        "photo": profile.photo if profile else "",
        "specialty": profile.specialty if profile else "",
        "fee": profile.consultation_fee if profile else None,
        "status": "active" if user.is_active else "inactive",
    }


def _audit_staff(user: User, profile: AdminStaffProfile | None) -> dict:
    return {"full_name": user.full_name, "email": user.email, "phone": user.phone, "role": user.role,
            "department_id": profile.department_id if profile else None, "specialty": profile.specialty if profile else "",
            "fee": profile.consultation_fee if profile else None, "status": "active" if user.is_active else "inactive"}


def _password() -> str:
    alphabet = string.ascii_letters + string.digits + "@#$!%&*"
    chars = [secrets.choice(string.ascii_uppercase), secrets.choice(string.ascii_lowercase), secrets.choice(string.digits), secrets.choice("@#$!%&*")]
    chars.extend(secrets.choice(alphabet) for _ in range(12))
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def _role_key(name: str, db: Session) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.casefold()).strip("-")[:20].strip("-") or "role"
    key = base
    suffix = 2
    while db.scalar(select(AdminRole.id).where(AdminRole.key == key)):
        ending = f"-{suffix}"
        key = f"{base[:20-len(ending)].rstrip('-')}{ending}"
        suffix += 1
    return key


@router.get("/overview")
def get_admin_overview(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    hospital_now = datetime.now(ZoneInfo("Asia/Karachi"))
    local_start = datetime.combine(hospital_now.date(), time.min, tzinfo=ZoneInfo("Asia/Karachi"))
    today_start = local_start.astimezone(timezone.utc)
    tomorrow = (local_start + timedelta(days=1)).astimezone(timezone.utc)
    patients = select(func.count(User.id)).where(User.role == "patient")
    return {
        "doctors": int(db.scalar(select(func.count(User.id)).where(User.role == "doctor")) or 0),
        "patients": int(db.scalar(patients) or 0),
        "staff": int(db.scalar(select(func.count(User.id)).where(User.role != "patient")) or 0),
        "today": int(db.scalar(select(func.count(User.id)).where(User.role == "patient", User.created_at >= today_start, User.created_at < tomorrow)) or 0),
    }


@router.get("/staff")
def list_staff(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    rows = db.execute(
        select(User, AdminStaffProfile)
        .outerjoin(AdminStaffProfile, AdminStaffProfile.user_id == User.id)
        .where(User.role != "patient")
        .order_by(User.full_name, User.id)
    ).all()
    return [_staff_data(db, member, profile) for member, profile in rows]


@router.post("/staff", status_code=status.HTTP_201_CREATED)
def create_staff(payload: StaffIn, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    if payload.email is None:
        raise HTTPException(422, "EMAIL_REQUIRED")
    role = db.scalar(select(AdminRole).where(AdminRole.key == payload.role))
    if role is None:
        raise HTTPException(422, "ROLE_NOT_FOUND")
    if db.get(AdminDepartment, payload.department_id) is None:
        raise HTTPException(422, "DEPARTMENT_NOT_FOUND")
    if db.scalar(select(User.id).where(User.email == payload.email, User.role == payload.role)):
        raise HTTPException(409, "EMAIL_TAKEN")

    temporary_password = _password()
    member = User(full_name=payload.full_name, email=payload.email, phone=payload.phone,
                  role=payload.role, password_hash=hash_password(temporary_password), is_active=payload.status == "active")
    db.add(member)
    try:
        db.flush()
        profile = AdminStaffProfile(user_id=member.id, department_id=payload.department_id, photo=payload.photo,
                                    specialty=payload.specialty, consultation_fee=payload.fee if payload.role == "doctor" else None)
        db.add(profile)
        write_audit(db, user.id, "staff_account_created", f"staff:{member.id}", {}, _audit_staff(member, profile))
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "EMAIL_TAKEN") from exc
    db.refresh(member)
    db.refresh(profile)
    return {"member": _staff_data(db, member, profile), "tempPassword": temporary_password}


@router.patch("/staff/{staff_id}")
def update_staff(staff_id: int, payload: StaffIn, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    member = db.get(User, staff_id)
    if member is None or member.role == "patient":
        raise HTTPException(404, "STAFF_NOT_FOUND")
    if db.scalar(select(User.id).where(User.email == member.email, User.role == payload.role, User.id != member.id)):
        raise HTTPException(409, "EMAIL_TAKEN")
    role = db.scalar(select(AdminRole).where(AdminRole.key == payload.role))
    if role is None:
        raise HTTPException(422, "ROLE_NOT_FOUND")
    if db.get(AdminDepartment, payload.department_id) is None:
        raise HTTPException(422, "DEPARTMENT_NOT_FOUND")
    if member.id == user.id and (payload.role != "admin" or payload.status != "active"):
        raise HTTPException(409, "SELF_LOCKOUT")

    profile = db.get(AdminStaffProfile, member.id)
    old = _audit_staff(member, profile)
    member.full_name = payload.full_name
    member.phone = payload.phone
    member.role = payload.role
    member.is_active = payload.status == "active"
    if profile is None:
        profile = AdminStaffProfile(user_id=member.id)
        db.add(profile)
    profile.department_id = payload.department_id
    profile.photo = payload.photo
    profile.specialty = payload.specialty
    profile.consultation_fee = payload.fee if payload.role == "doctor" else None
    new = _audit_staff(member, profile)
    write_audit(db, user.id, "staff_account_updated", f"staff:{member.id}", old, new)
    db.commit()
    db.refresh(member)
    db.refresh(profile)
    return _staff_data(db, member, profile)


@router.get("/departments")
def list_departments(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    return [_department_data(db, row) for row in db.scalars(select(AdminDepartment).order_by(AdminDepartment.name)).all()]


@router.post("/departments", status_code=status.HTTP_201_CREATED)
def create_department(payload: DepartmentIn, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    name_key = payload.name.casefold()
    if db.scalar(select(AdminDepartment.id).where(AdminDepartment.name_key == name_key)):
        raise HTTPException(409, "NAME_TAKEN")
    row = AdminDepartment(name=payload.name, name_key=name_key, description=payload.description)
    db.add(row)
    try:
        db.flush()
        write_audit(db, user.id, "department_created", f"department:{row.id}", {}, {"name": row.name, "description": row.description})
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        _raise_integrity("NAME_TAKEN")
    db.refresh(row)
    return _department_data(db, row)


@router.patch("/departments/{department_id}")
def update_department(department_id: int, payload: DepartmentIn, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    row = db.get(AdminDepartment, department_id)
    if row is None:
        raise HTTPException(404, "DEPARTMENT_NOT_FOUND")
    name_key = payload.name.casefold()
    if db.scalar(select(AdminDepartment.id).where(AdminDepartment.name_key == name_key, AdminDepartment.id != row.id)):
        raise HTTPException(409, "NAME_TAKEN")
    old = {"name": row.name, "description": row.description}
    row.name, row.name_key, row.description = payload.name, name_key, payload.description
    write_audit(db, user.id, "department_updated", f"department:{row.id}", old, {"name": row.name, "description": row.description})
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        _raise_integrity("NAME_TAKEN")
    db.refresh(row)
    return _department_data(db, row)


@router.delete("/departments/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_department(department_id: int, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    row = db.get(AdminDepartment, department_id)
    if row is None:
        raise HTTPException(404, "DEPARTMENT_NOT_FOUND")
    if db.scalar(select(AdminStaffProfile.user_id).where(AdminStaffProfile.department_id == row.id).limit(1)):
        raise HTTPException(409, "IN_USE")
    old = {"name": row.name, "description": row.description}
    write_audit(db, user.id, "department_deleted", f"department:{row.id}", old, {})
    db.delete(row)
    db.commit()


@router.get("/roles")
def list_roles(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    rows = db.scalars(select(AdminRole).options(selectinload(AdminRole.permissions)).order_by(AdminRole.system.desc(), AdminRole.name)).all()
    return [_role_data(db, row) for row in rows]


@router.post("/roles", status_code=status.HTTP_201_CREATED)
def create_role(payload: RoleIn, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    name_key = payload.name.casefold()
    if db.scalar(select(AdminRole.id).where(AdminRole.name_key == name_key)):
        raise HTTPException(409, "NAME_TAKEN")
    row = AdminRole(key=_role_key(payload.name, db), name=payload.name, name_key=name_key, description=payload.description, system=False)
    db.add(row)
    try:
        db.flush()
        write_audit(db, user.id, "role_created", f"role:{row.key}", {}, {"name": row.name, "description": row.description})
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        _raise_integrity("NAME_TAKEN")
    db.refresh(row)
    return _role_data(db, row)


@router.patch("/roles/{role_id}")
def update_role(role_id: int, payload: RoleIn, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    row = db.get(AdminRole, role_id)
    if row is None:
        raise HTTPException(404, "ROLE_NOT_FOUND")
    if row.system and payload.name.casefold() != row.name_key:
        raise HTTPException(409, "SYSTEM")
    name_key = row.name_key if row.system else payload.name.casefold()
    if db.scalar(select(AdminRole.id).where(AdminRole.name_key == name_key, AdminRole.id != row.id)):
        raise HTTPException(409, "NAME_TAKEN")
    old = {"name": row.name, "description": row.description}
    if not row.system:
        row.name, row.name_key = payload.name, name_key
    row.description = payload.description
    write_audit(db, user.id, "role_updated", f"role:{row.key}", old, {"name": row.name, "description": row.description})
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        _raise_integrity("NAME_TAKEN")
    db.refresh(row)
    return _role_data(db, row)


@router.put("/roles/{role_id}/permissions")
def update_role_permissions(role_id: int, payload: RolePermissionsIn, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    row = db.scalar(select(AdminRole).options(selectinload(AdminRole.permissions)).where(AdminRole.id == role_id))
    if row is None:
        raise HTTPException(404, "ROLE_NOT_FOUND")
    requested = set(payload.permission_ids)
    permissions = db.scalars(select(AdminPermission).where(AdminPermission.id.in_(requested))).all() if requested else []
    if len(permissions) != len(requested):
        raise HTTPException(422, "PERMISSION_NOT_FOUND")
    old = {"permission_ids": sorted(permission.id for permission in row.permissions)}
    row.permissions = permissions
    write_audit(db, user.id, "role_permissions_updated", f"role:{row.key}", old, {"permission_ids": sorted(requested)})
    db.commit()
    db.refresh(row)
    return _role_data(db, row)


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(role_id: int, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    row = db.get(AdminRole, role_id)
    if row is None:
        raise HTTPException(404, "ROLE_NOT_FOUND")
    if row.system:
        raise HTTPException(409, "SYSTEM")
    if db.scalar(select(User.id).where(User.role == row.key).limit(1)):
        raise HTTPException(409, "IN_USE")
    old = {"key": row.key, "name": row.name, "description": row.description}
    write_audit(db, user.id, "role_deleted", f"role:{row.key}", old, {})
    db.delete(row)
    db.commit()


@router.get("/permissions")
def list_permissions(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    return [_permission_data(db, row) for row in db.scalars(select(AdminPermission).order_by(AdminPermission.name)).all()]


@router.post("/permissions", status_code=status.HTTP_201_CREATED)
def create_permission(payload: PermissionIn, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    name_key = payload.name.casefold()
    if db.scalar(select(AdminPermission.id).where(AdminPermission.name_key == name_key)):
        raise HTTPException(409, "NAME_TAKEN")
    if db.scalar(select(AdminPermission.id).where(AdminPermission.code == payload.code)):
        raise HTTPException(409, "CODE_TAKEN")
    row = AdminPermission(name=payload.name, name_key=name_key, code=payload.code, description=payload.description)
    db.add(row)
    try:
        db.flush()
        write_audit(db, user.id, "permission_created", f"permission:{row.code}", {}, {"name": row.name, "code": row.code, "description": row.description})
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        _raise_integrity("CODE_TAKEN")
    db.refresh(row)
    return _permission_data(db, row)


@router.patch("/permissions/{permission_id}")
def update_permission(permission_id: int, payload: PermissionIn, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    row = db.get(AdminPermission, permission_id)
    if row is None:
        raise HTTPException(404, "PERMISSION_NOT_FOUND")
    name_key = payload.name.casefold()
    if db.scalar(select(AdminPermission.id).where(AdminPermission.name_key == name_key, AdminPermission.id != row.id)):
        raise HTTPException(409, "NAME_TAKEN")
    if db.scalar(select(AdminPermission.id).where(AdminPermission.code == payload.code, AdminPermission.id != row.id)):
        raise HTTPException(409, "CODE_TAKEN")
    old = {"name": row.name, "code": row.code, "description": row.description}
    row.name, row.name_key, row.code, row.description = payload.name, name_key, payload.code, payload.description
    write_audit(db, user.id, "permission_updated", f"permission:{row.id}", old, {"name": row.name, "code": row.code, "description": row.description})
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        _raise_integrity("CODE_TAKEN")
    db.refresh(row)
    return _permission_data(db, row)


@router.delete("/permissions/{permission_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_permission(permission_id: int, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    row = db.get(AdminPermission, permission_id)
    if row is None:
        raise HTTPException(404, "PERMISSION_NOT_FOUND")
    old = {"name": row.name, "code": row.code, "description": row.description}
    write_audit(db, user.id, "permission_deleted", f"permission:{row.id}", old, {})
    db.delete(row)
    db.commit()
