"""P4: admin endpoints (staff, departments, roles, permissions, overview, audit logs,
chatbot admin, evaluation) - authorization, validation, behaviour and audit-log writes."""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

import app.api.v1.routes.evaluation as evaluation_routes
from app.models.admin import AdminDepartment, AdminPermission, AdminRole
from app.models.chatbot import AdminAuditLog, ChatConversation, ModelConfig, ModelUsage
from app.models.evaluation import BenchmarkQuery, EvaluationRun
from app.models.user import User
from app.services.websocket_manager import manager

HEALTH = {"available": True, "status": {"models": {
    "primary": {"connected": True, "models": ["groq-a", "groq-b"]},
    "fallback": {"connected": True, "models": ["llama-local"]}}}}


@pytest.fixture()
def admin(world):
    return world.user("admin", name="Admin One")


@pytest.fixture()
def ah(world, admin):
    return world.headers(admin)


@pytest.fixture()
def health():
    manager.latest_health = HEALTH
    yield HEALTH
    manager.latest_health = None


def seeded(world, name):
    return world.db.scalar(select(AdminDepartment).where(AdminDepartment.name == name))


def audits(world, action=None):
    world.db.expire_all()
    q = select(AdminAuditLog)
    if action:
        q = q.where(AdminAuditLog.action == action)
    return world.db.scalars(q.order_by(AdminAuditLog.id)).all()


def staff_body(dep_id, **over):
    body = {"fullName": "Dr Ayesha Khan", "email": "Ayesha@Example.com", "phone": "0300 1234567", "role": "doctor",
            "departmentId": dep_id, "specialty": "Cardiologist", "fee": 2000, "status": "active"}
    body.update(over)
    return body


# ---------------------------------------------------------------- authorization
ADMIN_ENDPOINTS = [
    ("get", "/api/v1/admin/overview"), ("get", "/api/v1/admin/hospital-profile"), ("put", "/api/v1/admin/hospital-profile"), ("get", "/api/v1/admin/staff"), ("post", "/api/v1/admin/staff"),
    ("patch", "/api/v1/admin/staff/1"), ("get", "/api/v1/admin/departments"), ("post", "/api/v1/admin/departments"),
    ("patch", "/api/v1/admin/departments/1"), ("delete", "/api/v1/admin/departments/1"),
    ("get", "/api/v1/admin/roles"), ("post", "/api/v1/admin/roles"), ("patch", "/api/v1/admin/roles/1"),
    ("put", "/api/v1/admin/roles/1/permissions"), ("delete", "/api/v1/admin/roles/1"),
    ("get", "/api/v1/admin/permissions"), ("post", "/api/v1/admin/permissions"),
    ("patch", "/api/v1/admin/permissions/1"), ("delete", "/api/v1/admin/permissions/1"),
    ("get", "/api/v1/admin/audit-logs"), ("get", "/api/v1/admin/audit-logs/export"),
    ("get", "/api/v1/admin/models"), ("get", "/api/v1/admin/chatbot/monitoring"),
    ("patch", "/api/v1/admin/services/ollama"), ("patch", "/api/v1/admin/settings"),
    ("post", "/api/v1/admin/fallback/return-to-primary"),
    ("get", "/api/v1/admin/evaluation/queries"), ("post", "/api/v1/admin/evaluation/queries"),
    ("get", "/api/v1/admin/evaluation/runs"), ("post", "/api/v1/admin/evaluation/runs"),
    ("delete", "/api/v1/admin/evaluation/runs/1"),
]


@pytest.mark.parametrize("method,path", ADMIN_ENDPOINTS)
def test_admin_endpoints_reject_anonymous_patient_and_doctor(world, method, path):
    call = getattr(world.client, method)
    assert call(path).status_code == 401
    assert call(path, headers=world.headers(world.user("patient"))).status_code == 403
    assert call(path, headers=world.headers(world.doctor())).status_code == 403


# ---------------------------------------------------------------- overview
def test_overview_counts(world, ah):
    world.doctor(); world.user("patient"); world.user("patient")
    data = world.client.get("/api/v1/admin/overview", headers=ah).json()
    assert data == {"doctors": 1, "patients": 2, "staff": 2, "today": 2}  # staff = admin + doctor


# ---------------------------------------------------------------- departments
def test_department_crud_and_audit(world, ah):
    r = world.client.post("/api/v1/admin/departments", json={"name": "Neurology", "description": "Brain"}, headers=ah)
    assert r.status_code == 201 and r.json()["name"] == "Neurology" and r.json()["staffCount"] == 0
    dep_id = r.json()["id"]
    assert world.client.post("/api/v1/admin/departments", json={"name": "NEUROLOGY"}, headers=ah).json()["detail"] == "NAME_TAKEN"
    r = world.client.patch(f"/api/v1/admin/departments/{dep_id}", json={"name": "Neuro", "description": "x"}, headers=ah)
    assert r.status_code == 200 and r.json()["name"] == "Neuro"
    assert world.client.patch("/api/v1/admin/departments/9999", json={"name": "Abc"}, headers=ah).json()["detail"] == "DEPARTMENT_NOT_FOUND"
    assert world.client.patch(f"/api/v1/admin/departments/{dep_id}", json={"name": "cardiology"}, headers=ah).status_code == 409
    assert world.client.delete(f"/api/v1/admin/departments/{dep_id}", headers=ah).status_code == 204
    assert world.client.delete(f"/api/v1/admin/departments/{dep_id}", headers=ah).status_code == 404
    assert [a.action for a in audits(world)] == ["department_created", "department_updated", "department_deleted"]
    assert audits(world, "department_updated")[0].old_value["name"] == "Neurology"


def test_department_validation_and_in_use(world, ah):
    assert world.client.post("/api/v1/admin/departments", json={"name": "A"}, headers=ah).status_code == 422
    assert world.client.post("/api/v1/admin/departments", json={"name": "Ok name", "description": "x" * 201}, headers=ah).status_code == 422
    doc = world.doctor(department="Oncology")
    dep = world.db.scalar(select(AdminDepartment).where(AdminDepartment.name == "Oncology"))
    listed = {d["name"]: d for d in world.client.get("/api/v1/admin/departments", headers=ah).json()}
    assert listed["Oncology"]["staffCount"] == 1
    r = world.client.delete(f"/api/v1/admin/departments/{dep.id}", headers=ah)
    assert r.status_code == 409 and r.json()["detail"] == "IN_USE"
    assert not audits(world, "department_deleted")
    assert doc.id


# ---------------------------------------------------------------- staff
def test_staff_create_doctor_and_login_with_temp_password(world, ah):
    dep = world.department("Neurology")
    r = world.client.post("/api/v1/admin/staff", json=staff_body(dep.id), headers=ah)
    assert r.status_code == 201
    member, temp = r.json()["member"], r.json()["tempPassword"]
    assert member["email"] == "ayesha@example.com" and member["phone"] == "03001234567"
    assert member["role"] == "doctor" and member["fee"] == 2000 and member["status"] == "active"
    assert len(temp) >= 12
    login = world.client.post("/api/v1/auth/login", json={"email": "ayesha@example.com", "password": temp, "role": "doctor"})
    assert login.status_code == 200
    a = audits(world, "staff_account_created")
    assert len(a) == 1 and a[0].target == f"staff:{member['id']}"
    assert "password" not in str(a[0].new_value).lower()  # temp password never audited


def test_staff_create_errors(world, ah):
    dep = world.department("Neurology")
    post = lambda **o: world.client.post("/api/v1/admin/staff", json=staff_body(dep.id, **o), headers=ah)
    assert post(email=None).json()["detail"] == "EMAIL_REQUIRED"
    assert post(role="nonexistent").json()["detail"] == "ROLE_NOT_FOUND"
    assert world.client.post("/api/v1/admin/staff", json=staff_body(9999), headers=ah).json()["detail"] == "DEPARTMENT_NOT_FOUND"
    assert post(phone="12345").status_code == 422
    assert post(fullName="X1").status_code == 422
    assert post(specialty="").status_code == 422          # doctor needs specialty
    assert post(fee=None).status_code == 422              # doctor needs fee
    assert post(fee=50).status_code == 422
    assert post().status_code == 201
    assert post().json()["detail"] == "EMAIL_TAKEN"
    # same email under a different role is allowed (email unique per role)
    assert post(role="nurse", specialty="", fee=None).status_code == 201
    assert len(audits(world, "staff_account_created")) == 2


def test_staff_non_doctor_has_no_fee_and_inactive_cannot_login(world, ah):
    dep = seeded(world, "Nursing")
    r = world.client.post("/api/v1/admin/staff", json=staff_body(dep.id, role="nurse", fee=500, specialty=""), headers=ah)
    assert r.status_code == 201 and r.json()["member"]["fee"] is None
    r = world.client.post("/api/v1/admin/staff", json=staff_body(dep.id, email="off@example.com", status="inactive"), headers=ah)
    assert r.status_code == 201 and r.json()["member"]["status"] == "inactive"
    login = world.client.post("/api/v1/auth/login", json={"email": "off@example.com", "password": r.json()["tempPassword"], "role": "doctor"})
    assert login.status_code == 403


def test_staff_list_excludes_patients_and_patch(world, ah, admin):
    patient = world.user("patient")
    doc = world.doctor("Dr Hina Shah", "Cardiology")
    rows = world.client.get("/api/v1/admin/staff", headers=ah).json()
    ids = {row["id"] for row in rows}
    assert doc.id in ids and admin.id in ids and patient.id not in ids
    dep = world.db.scalar(select(AdminDepartment).where(AdminDepartment.name == "Cardiology"))
    body = staff_body(dep.id, fullName="Dr Hina Updated", email=None, fee=3000, status="inactive")
    r = world.client.patch(f"/api/v1/admin/staff/{doc.id}", json=body, headers=ah)
    assert r.status_code == 200 and r.json()["fullName"] == "Dr Hina Updated" and r.json()["fee"] == 3000 and r.json()["status"] == "inactive"
    assert r.json()["email"] == doc.email  # email is not editable
    a = audits(world, "staff_account_updated")[0]
    assert a.old_value["status"] == "active" and a.new_value["status"] == "inactive"
    assert world.client.patch(f"/api/v1/admin/staff/{patient.id}", json=body, headers=ah).json()["detail"] == "STAFF_NOT_FOUND"
    assert world.client.patch("/api/v1/admin/staff/9999", json=body, headers=ah).status_code == 404


def test_staff_patch_self_lockout_and_role_change(world, ah, admin):
    dep = seeded(world, "Administration")
    lock = lambda **o: world.client.patch(f"/api/v1/admin/staff/{admin.id}", json=staff_body(dep.id, role="admin", fee=None, specialty="", **o), headers=ah)
    assert lock(status="inactive").json()["detail"] == "SELF_LOCKOUT"
    assert world.client.patch(f"/api/v1/admin/staff/{admin.id}", json=staff_body(dep.id, role="nurse", fee=None, specialty=""), headers=ah).json()["detail"] == "SELF_LOCKOUT"
    assert lock(status="active").status_code == 200
    doc = world.doctor("Dr Role Change")
    r = world.client.patch(f"/api/v1/admin/staff/{doc.id}", json=staff_body(dep.id, role="nurse", fee=None, specialty=""), headers=ah)
    assert r.status_code == 200 and r.json()["role"] == "nurse" and r.json()["fee"] is None
    assert world.client.patch(f"/api/v1/admin/staff/{doc.id}", json=staff_body(dep.id, role="ghost", fee=None, specialty=""), headers=ah).json()["detail"] == "ROLE_NOT_FOUND"


# ---------------------------------------------------------------- permissions
def test_permission_crud(world, ah):
    r = world.client.post("/api/v1/admin/permissions", json={"name": "Export", "code": "export", "description": "d"}, headers=ah)
    assert r.status_code == 201 and r.json()["roleCount"] == 0
    pid = r.json()["id"]
    post = lambda **b: world.client.post("/api/v1/admin/permissions", json=b, headers=ah)
    assert post(name="EXPORT", code="other").json()["detail"] == "NAME_TAKEN"
    assert post(name="Another", code="export").json()["detail"] == "CODE_TAKEN"
    assert post(name="Bad code", code="Bad Code").status_code == 422
    assert post(name="Bad code", code="1abc").status_code == 422
    r = world.client.patch(f"/api/v1/admin/permissions/{pid}", json={"name": "Export2", "code": "export:v2"}, headers=ah)
    assert r.status_code == 200 and r.json()["code"] == "export:v2"
    assert world.client.patch(f"/api/v1/admin/permissions/{pid}", json={"name": "View", "code": "x"}, headers=ah).json()["detail"] == "NAME_TAKEN"
    assert world.client.patch(f"/api/v1/admin/permissions/{pid}", json={"name": "Zzz", "code": "view"}, headers=ah).json()["detail"] == "CODE_TAKEN"
    assert world.client.patch("/api/v1/admin/permissions/9999", json={"name": "Zzz", "code": "z"}, headers=ah).status_code == 404
    assert world.client.delete(f"/api/v1/admin/permissions/{pid}", headers=ah).status_code == 204
    assert world.client.delete(f"/api/v1/admin/permissions/{pid}", headers=ah).status_code == 404
    assert [a.action for a in audits(world)] == ["permission_created", "permission_updated", "permission_deleted"]
    codes = {p["code"]: p for p in world.client.get("/api/v1/admin/permissions", headers=ah).json()}
    assert codes["view"]["roleCount"] == 5 and codes["delete"]["roleCount"] == 1  # seeded defaults


# ---------------------------------------------------------------- roles
def test_role_crud_and_key_generation(world, ah):
    r = world.client.post("/api/v1/admin/roles", json={"name": "Lab Technician", "description": "Labs"}, headers=ah)
    assert r.status_code == 201
    role = r.json()
    assert role["key"] == "lab-technician" and role["system"] is False and role["memberCount"] == 0
    assert world.client.post("/api/v1/admin/roles", json={"name": "lab technician"}, headers=ah).json()["detail"] == "NAME_TAKEN"
    r = world.client.patch(f"/api/v1/admin/roles/{role['id']}", json={"name": "Lab Tech", "description": "x"}, headers=ah)
    assert r.status_code == 200 and r.json()["name"] == "Lab Tech" and r.json()["key"] == "lab-technician"  # key is stable
    assert world.client.patch("/api/v1/admin/roles/9999", json={"name": "Abc"}, headers=ah).status_code == 404
    assert world.client.delete(f"/api/v1/admin/roles/{role['id']}", headers=ah).status_code == 204
    assert [a.action for a in audits(world)] == ["role_created", "role_updated", "role_deleted"]


def test_role_system_protection_and_in_use(world, ah):
    system = world.db.scalar(select(AdminRole).where(AdminRole.key == "nurse"))
    assert world.client.delete(f"/api/v1/admin/roles/{system.id}", headers=ah).json()["detail"] == "SYSTEM"
    assert world.client.patch(f"/api/v1/admin/roles/{system.id}", json={"name": "Renamed"}, headers=ah).json()["detail"] == "SYSTEM"
    r = world.client.patch(f"/api/v1/admin/roles/{system.id}", json={"name": "Nurse", "description": "desc ok"}, headers=ah)
    assert r.status_code == 200 and r.json()["description"] == "desc ok"  # description editable
    custom = world.client.post("/api/v1/admin/roles", json={"name": "Porter"}, headers=ah).json()
    dep = seeded(world, "Nursing")
    world.client.post("/api/v1/admin/staff", json=staff_body(dep.id, role=custom["key"], fee=None, specialty=""), headers=ah)
    r = world.client.delete(f"/api/v1/admin/roles/{custom['id']}", headers=ah)
    assert r.status_code == 409 and r.json()["detail"] == "IN_USE"
    listed = {x["key"]: x for x in world.client.get("/api/v1/admin/roles", headers=ah).json()}
    assert listed[custom["key"]]["memberCount"] == 1
    assert [x["system"] for x in world.client.get("/api/v1/admin/roles", headers=ah).json()][:5] == [True] * 5  # system first


def test_role_permissions_put(world, ah):
    role = world.client.post("/api/v1/admin/roles", json={"name": "Auditor"}, headers=ah).json()
    perms = {p.code: p.id for p in world.db.scalars(select(AdminPermission)).all()}
    r = world.client.put(f"/api/v1/admin/roles/{role['id']}/permissions", json={"permissionIds": [perms["view"], perms["edit"]]}, headers=ah)
    assert r.status_code == 200 and r.json()["permissionIds"] == sorted([perms["view"], perms["edit"]])
    r = world.client.put(f"/api/v1/admin/roles/{role['id']}/permissions", json={"permissionIds": [9999]}, headers=ah)
    assert r.status_code == 422 and r.json()["detail"] == "PERMISSION_NOT_FOUND"
    assert world.client.get("/api/v1/admin/roles", headers=ah).json() and \
        next(x for x in world.client.get("/api/v1/admin/roles", headers=ah).json() if x["id"] == role["id"])["permissionIds"] == sorted([perms["view"], perms["edit"]])
    r = world.client.put(f"/api/v1/admin/roles/{role['id']}/permissions", json={"permissionIds": []}, headers=ah)
    assert r.json()["permissionIds"] == []
    assert world.client.put("/api/v1/admin/roles/9999/permissions", json={"permissionIds": []}, headers=ah).status_code == 404
    a = audits(world, "role_permissions_updated")
    assert len(a) == 2 and a[0].new_value == {"permission_ids": sorted([perms["view"], perms["edit"]])}


# ---------------------------------------------------------------- audit logs
def _seed_audits(world, admin):
    now = datetime.now(timezone.utc)
    rows = [("alpha_action", "thing:1", now - timedelta(days=10)), ("beta_action", "other:2", now - timedelta(days=2)),
            ("alpha_action", "thing:3", now)]
    for action, target, ts in rows:
        world.db.add(AdminAuditLog(admin_id=admin.id, action=action, target=target, old_value={"a": 1}, new_value={}, created_at=ts))
    world.db.commit()


def test_audit_logs_list_filter_paginate(world, ah, admin):
    _seed_audits(world, admin)
    get = lambda **p: world.client.get("/api/v1/admin/audit-logs", params=p, headers=ah).json()
    d = get()
    assert d["total"] == 3 and d["page"] == 1 and d["pages"] == 1 and d["actions"] == ["alpha_action", "beta_action"]
    assert [i["target"] for i in d["items"]] == ["thing:3", "other:2", "thing:1"]  # newest first
    assert d["items"][0]["admin_name"] == "Admin One" and d["items"][0]["old_value"] == {"a": 1}
    assert get(action="alpha_action")["total"] == 2
    assert get(target="OTHER")["total"] == 1
    assert get(search="admin one")["total"] == 3 and get(search="nomatch")["total"] == 0
    assert get(date_from=(datetime.now(timezone.utc) - timedelta(days=3)).date().isoformat())["total"] == 2
    assert get(date_to=(datetime.now(timezone.utc) - timedelta(days=5)).date().isoformat())["total"] == 1
    p = get(page_size=2, page=2)
    assert p["total"] == 3 and p["pages"] == 2 and len(p["items"]) == 1
    assert world.client.get("/api/v1/admin/audit-logs", params={"page": 0}, headers=ah).status_code == 422
    assert world.client.get("/api/v1/admin/audit-logs", params={"page_size": 101}, headers=ah).status_code == 422
    assert world.client.get("/api/v1/admin/audit-logs", params={"date_from": "bad"}, headers=ah).status_code == 422


def test_audit_logs_export_csv_respects_filters(world, ah, admin):
    _seed_audits(world, admin)
    r = world.client.get("/api/v1/admin/audit-logs/export", params={"action": "alpha_action"}, headers=ah)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert "cityhospital-audit-logs.csv" in r.headers["content-disposition"]
    lines = r.text.strip().splitlines()
    assert lines[0].startswith("id,created_at,admin_name,admin_email,action,target")
    assert len(lines) == 3 and all("alpha_action" in line for line in lines[1:])


def test_audit_log_shows_deleted_admin_placeholder(world, ah, admin):
    # audit rows survive with an outer join; unknown admin renders as "Deleted admin"
    from sqlalchemy import text
    world.db.execute(text("PRAGMA foreign_keys=OFF"))
    world.db.add(AdminAuditLog(admin_id=99999, action="ghost", target="t", old_value={}, new_value={}))
    world.db.commit()
    items = world.client.get("/api/v1/admin/audit-logs", params={"action": "ghost"}, headers=ah).json()["items"]
    assert items[0]["admin_name"] == "Deleted admin" and items[0]["admin_email"] == ""


# ---------------------------------------------------------------- chatbot admin
def test_models_listing_and_monitoring(world, ah, health):
    r = world.client.get("/api/v1/admin/models", headers=ah)
    assert r.status_code == 200
    body = r.json()
    names = {(m["provider"], m["model"]): m for m in body["models"]}
    assert ("groq", "groq-a") in names and ("ollama", "llama-local") in names and names[("groq", "groq-a")]["online"] is True
    assert {s["id"] for s in body["services"]} == {"medical-assistant", "groqcloud", "ollama"}
    assert body["providers"]["groq"]["status"] == "online"
    mon = world.client.get("/api/v1/admin/chatbot/monitoring", headers=ah).json()
    assert mon["service"]["status"] == "online" and mon["config"]["primary_provider"] == "groq"
    assert mon["usage"]["queries_processed"] == 0


def test_monitoring_when_assistant_offline(world, ah):
    manager.latest_health = None
    mon = world.client.get("/api/v1/admin/chatbot/monitoring", headers=ah).json()
    assert mon["service"]["status"] == "offline" and mon["providers"]["groq"]["status"] == "offline"


def _usage(world, patient, model="groq-a", provider="groq", tokens_in=10, tokens_out=5, ms=100, status="success", fb=False, ago=timedelta(0)):
    conv = ChatConversation(medical_assistant_id=f"c{world.db.query(ChatConversation).count()}", patient_id=patient.id)
    world.db.add(conv); world.db.flush()
    world.db.add(ModelUsage(patient_id=patient.id, conversation_id=conv.id, provider=provider, model=model, tokens_in=tokens_in,
                            tokens_out=tokens_out, response_time_ms=ms, status=status, was_fallback=fb,
                            created_at=datetime.now(timezone.utc) - ago))
    world.db.commit()


def test_model_usage_report_and_export(world, ah, health):
    from app.services.chatbot_admin import model_id
    p = world.user("patient")
    _usage(world, p, tokens_in=10, tokens_out=5, ms=100)
    _usage(world, p, tokens_in=20, tokens_out=10, ms=300, status="error", fb=True)
    _usage(world, p, ago=timedelta(days=20))  # outside week range, inside month
    key = model_id("groq", "groq-a")
    week = world.client.get(f"/api/v1/admin/models/{key}/usage", params={"range": "week"}, headers=ah).json()
    assert week["queries"] == 2 and week["tokens_in"] == 30 and week["tokens_out"] == 15 and week["tokens"] == 45
    assert week["error_count"] == 1 and week["fallback_count"] == 1 and week["average_response_time_ms"] == 200 and week["slowest_response_time_ms"] == 300
    assert len(week["series"]) == 1 and week["series"][0]["queries"] == 2
    assert world.client.get(f"/api/v1/admin/models/{key}/usage", params={"range": "month"}, headers=ah).json()["queries"] == 3
    assert world.client.get(f"/api/v1/admin/models/{key}/usage", params={"range": "year"}, headers=ah).status_code == 422
    assert world.client.get("/api/v1/admin/models/!!!/usage", headers=ah).status_code == 422
    csv_r = world.client.get(f"/api/v1/admin/models/{key}/usage/export", params={"range": "week"}, headers=ah)
    assert csv_r.status_code == 200 and "groq-groq-a-usage.csv" in csv_r.headers["content-disposition"]
    lines = csv_r.text.strip().splitlines()
    assert lines[0].startswith("period,queries,tokens_in") and len(lines) == 2
    assert world.client.get("/api/v1/admin/models/!!!/usage/export", headers=ah).status_code == 422
    listed = {m["model"]: m for m in world.client.get("/api/v1/admin/models", headers=ah).json()["models"]}
    assert listed["groq-a"]["queries"] >= 2


def test_service_toggle_rules_and_audit(world, ah, health):
    patch = lambda sid, enabled: world.client.patch(f"/api/v1/admin/services/{sid}", json={"enabled": enabled}, headers=ah)
    assert patch("ollama", True).json()["status"] == "unchanged"
    assert patch("medical-assistant", False).status_code == 409           # gateway cannot be disabled
    assert patch("bogus", True).status_code == 422
    r = patch("groqcloud", False)                                         # ollama is online -> allowed, primary flips
    assert r.status_code == 200 and r.json()["enabled"] is False
    cfg = world.client.get("/api/v1/admin/chatbot/monitoring", headers=ah).json()["config"]
    assert cfg["primary_provider"] == "ollama" and cfg["auto_fallback_enabled"] is False
    assert patch("ollama", False).status_code == 409                      # would leave no provider
    a = audits(world, "service_toggled")
    assert len(a) == 1 and a[0].target == "groqcloud" and a[0].new_value["groq_enabled"] is False
    assert patch("groqcloud", True).status_code == 200


def test_service_toggle_blocked_when_other_provider_offline(world, ah):
    manager.latest_health = {"available": True, "status": {"models": {"primary": {"connected": True, "models": ["groq-a"]},
                                                                     "fallback": {"connected": False, "models": []}}}}
    try:
        assert world.client.patch("/api/v1/admin/services/groqcloud", json={"enabled": False}, headers=ah).status_code == 409
    finally:
        manager.latest_health = None


def settings_body(**o):
    body = {"primary_provider": "groq", "active_model": "groq-a", "auto_fallback_enabled": True,
            "fallback_model": "llama-local", "monthly_token_limit": 1000}
    body.update(o)
    return body


def test_settings_update_validation_and_audit(world, ah, health):
    patch = lambda **o: world.client.patch("/api/v1/admin/settings", json=settings_body(**o), headers=ah)
    assert patch(active_model="nope").status_code == 422
    assert patch(fallback_model="nope").status_code == 422
    assert patch(primary_provider="ollama", active_model="groq-a", auto_fallback_enabled=False).status_code == 422
    assert patch(monthly_token_limit=-1).status_code == 422
    assert patch(primary_provider="other").status_code == 422
    r = patch(active_model="groq-b")
    assert r.status_code == 200 and r.json()["config"]["groq_model"] == "groq-b" and r.json()["config"]["monthly_token_limit"] == 1000
    assert patch(active_model="groq-b").json()["status"] == "unchanged"      # idempotent, no audit row
    r = patch(primary_provider="ollama", active_model="llama-local", auto_fallback_enabled=False, fallback_model="")
    assert r.status_code == 200 and r.json()["active_model"]["name"] == "llama-local"
    a = audits(world, "chatbot_settings_changed")
    assert len(a) == 2 and a[0].old_value["groq_model"] != "groq-b" and a[0].new_value["groq_model"] == "groq-b"


def test_settings_blocked_when_provider_unreachable(world, ah):
    manager.latest_health = {"available": True, "status": {"models": {"primary": {"connected": False, "models": []},
                                                                     "fallback": {"connected": True, "models": ["llama-local"]}}}}
    try:
        assert world.client.patch("/api/v1/admin/settings", json=settings_body(auto_fallback_enabled=False), headers=ah).status_code == 409
    finally:
        manager.latest_health = None


def test_return_to_primary(world, ah, health):
    world.client.get("/api/v1/admin/models", headers=ah)  # creates the settings row
    world.db.get(ModelConfig, 1).groq_model = "groq-a"; world.db.commit()
    r = world.client.post("/api/v1/admin/fallback/return-to-primary", headers=ah)
    assert r.status_code == 200 and r.json()["status"] == "unchanged"
    cfg = world.db.get(ModelConfig, 1)
    cfg.primary_provider, cfg.fallback_active, cfg.groq_model = "ollama", True, "groq-a"
    world.db.commit()
    r = world.client.post("/api/v1/admin/fallback/return-to-primary", headers=ah)
    assert r.status_code == 200 and r.json()["config"]["primary_provider"] == "groq" and r.json()["config"]["fallback_active"] is False
    assert len(audits(world, "returned_to_primary_model")) == 1
    manager.latest_health = None
    cfg = world.db.get(ModelConfig, 1)
    world.db.refresh(cfg)
    cfg.primary_provider = "ollama"; world.db.commit()
    assert world.client.post("/api/v1/admin/fallback/return-to-primary", headers=ah).status_code == 409


# ---------------------------------------------------------------- evaluation
@pytest.fixture()
def fake_eval(monkeypatch):
    launched = []

    async def fake_models():
        return {"groq": ["groq-a"], "ollama": ["llama-local"]}

    monkeypatch.setattr(evaluation_routes, "available_models", fake_models)
    monkeypatch.setattr(evaluation_routes, "launch_run", lambda *a: launched.append(a))
    return launched


def query_body(**o):
    body = {"lang": "en", "category": "triage", "query": "I have chest pain", "truth": "Cardiology"}
    body.update(o)
    return body


def test_benchmark_query_crud_validation_audit(world, ah):
    post = lambda **o: world.client.post("/api/v1/admin/evaluation/queries", json=query_body(**o), headers=ah)
    r = post()
    assert r.status_code == 201 and r.json() == {"id": r.json()["id"], "lang": "en", "category": "triage", "query": "I have chest pain", "truth": "Cardiology"}
    qid = r.json()["id"]
    assert post(lang="fr").status_code == 422 and post(category="x").status_code == 422
    assert post(query="abcd").status_code == 422 and post(truth="").status_code == 422 and post(truth="x" * 101).status_code == 422
    r = world.client.put(f"/api/v1/admin/evaluation/queries/{qid}", json=query_body(truth="Neurology", lang="ur"), headers=ah)
    assert r.status_code == 200 and r.json()["truth"] == "Neurology" and r.json()["lang"] == "ur"
    assert world.client.put("/api/v1/admin/evaluation/queries/9999", json=query_body(), headers=ah).status_code == 404
    assert len(world.client.get("/api/v1/admin/evaluation/queries", headers=ah).json()) == 1
    assert world.client.delete(f"/api/v1/admin/evaluation/queries/{qid}", headers=ah).status_code == 204
    assert world.client.delete(f"/api/v1/admin/evaluation/queries/{qid}", headers=ah).status_code == 404
    assert [a.action for a in audits(world)] == ["benchmark_query_created", "benchmark_query_updated", "benchmark_query_deleted"]


def test_evaluation_models_endpoint(world, ah, fake_eval):
    assert world.client.get("/api/v1/admin/evaluation/models", headers=ah).json() == {"groq": ["groq-a"], "ollama": ["llama-local"]}


def test_evaluation_models_503_when_assistant_down(world, ah, monkeypatch):
    async def down(*a, **k):
        from app.services.medical_assistant_client import MedicalAssistantError
        raise MedicalAssistantError("x")
    import app.services.evaluation as ev
    monkeypatch.setattr(ev, "request", down)
    assert world.client.get("/api/v1/admin/evaluation/models", headers=ah).status_code == 503


def test_evaluation_run_lifecycle(world, ah, fake_eval):
    post = lambda **o: world.client.post("/api/v1/admin/evaluation/runs", json={"provider": "groq", "model": "groq-a", **o}, headers=ah)
    assert post().status_code == 409                                      # no benchmark queries yet
    world.db.add(BenchmarkQuery(lang="en", category="triage", query="I have chest pain", truth="Cardiology")); world.db.commit()
    assert post(model="missing").status_code == 422
    assert post(provider="bad").status_code == 422
    r = post()
    assert r.status_code == 201 and r.json()["status"] == "queued" and r.json()["totalQueries"] == 1
    run_id = r.json()["id"]
    assert fake_eval == [(run_id, "groq", "groq-a")]
    assert post().status_code == 409                                      # one active run at a time
    assert world.client.delete(f"/api/v1/admin/evaluation/runs/{run_id}", headers=ah).status_code == 409   # must stop first
    assert world.client.post(f"/api/v1/admin/evaluation/runs/{run_id}/resume", headers=ah).status_code == 409
    assert world.client.get(f"/api/v1/admin/evaluation/runs/{run_id}", headers=ah).json()["id"] == run_id

    r = world.client.post(f"/api/v1/admin/evaluation/runs/{run_id}/cancel", headers=ah)
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert world.client.post(f"/api/v1/admin/evaluation/runs/{run_id}/cancel", headers=ah).status_code == 409

    r = world.client.post(f"/api/v1/admin/evaluation/runs/{run_id}/resume", headers=ah)
    assert r.status_code == 200 and r.json()["status"] == "queued" and len(fake_eval) == 2
    world.client.post(f"/api/v1/admin/evaluation/runs/{run_id}/cancel", headers=ah)

    assert [x["id"] for x in world.client.get("/api/v1/admin/evaluation/runs", headers=ah).json()] == [run_id]
    assert world.client.delete(f"/api/v1/admin/evaluation/runs/{run_id}", headers=ah).status_code == 204
    assert world.client.get(f"/api/v1/admin/evaluation/runs/{run_id}", headers=ah).status_code == 404
    assert world.client.delete(f"/api/v1/admin/evaluation/runs/{run_id}", headers=ah).status_code == 404
    assert [a.action for a in audits(world)] == ["evaluation_started", "evaluation_cancelled", "evaluation_resumed",
                                                 "evaluation_cancelled", "evaluation_report_deleted"]


def test_evaluation_resume_requires_available_model(world, ah, fake_eval):
    run = EvaluationRun(provider="groq", model="gone-model", status="failed", total_queries=1)
    world.db.add(run); world.db.commit()
    assert world.client.post(f"/api/v1/admin/evaluation/runs/{run.id}/resume", headers=ah).status_code == 422
    assert world.client.post("/api/v1/admin/evaluation/runs/9999/resume", headers=ah).status_code == 404
    assert world.client.post("/api/v1/admin/evaluation/runs/9999/cancel", headers=ah).status_code == 404


def test_evaluation_helpers():
    from app.services.evaluation import normalized, rouge_l
    assert normalized("  Hello,   WORLD! ") == "hello world"
    assert rouge_l("heart doctor", "heart doctor") == 1.0 and rouge_l("a", "b") == 0.0 and rouge_l("", "x") == 0.0


# ---------------------------------------------------------------- websocket
def test_knowledge_base_websocket_auth(world, admin, health, monkeypatch):
    import app.main as app_main
    from tests.conftest import _Session
    monkeypatch.setattr(app_main, "SessionLocal", _Session)
    from starlette.websockets import WebSocketDisconnect
    patient = world.user("patient")
    with world.client.websocket_connect("/ws/admin/knowledge-base") as ws:
        ws.send_json({"type": "authenticate", "token": "garbage"})
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == 4401
    from app.core.security import create_access_token
    with world.client.websocket_connect("/ws/admin/knowledge-base") as ws:
        ws.send_json({"type": "authenticate", "token": create_access_token(patient.id, "patient")})
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == 4403
    with world.client.websocket_connect("/ws/admin/knowledge-base") as ws:
        ws.send_json({"type": "authenticate", "token": create_access_token(admin.id, "admin")})
        first = ws.receive_json()
        assert first["type"] == "initial_state" and first["data"]["config"]["primary_provider"] == "groq"
