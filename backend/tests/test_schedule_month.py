"""GET /doctor/schedule/month - calendar overview (additive, read-only)."""
from tests.test_availability import D, S, day_n, mk, setup


def month_of(d):
    return d.strftime("%Y-%m")


def test_month_overview_sources_and_counts(world):
    doc, pat, dh, _ = setup(world, [S("10:00", "13:00")])
    target = day_n(5)
    mk(world, pat, doc, target, "10:00")
    mk(world, pat, doc, target, "10:30")
    mk(world, pat, doc, target, "11:00", status="cancelled")      # cancelled never counts
    r = world.client.put(f"{D}/schedule/exceptions/{day_n(6).isoformat()}", headers=dh, json={"kind": "leave", "note": "x"})
    assert r.status_code == 200, r.text
    r = world.client.put(f"{D}/schedule/exceptions/{day_n(7).isoformat()}", headers=dh,
                         json={"kind": "custom_hours", "sessions": [S("15:00", "17:00")]})
    assert r.status_code == 200, r.text
    months = {month_of(day_n(i)) for i in (5, 6, 7)}
    rows = {}
    for m in months:
        body = world.client.get(f"{D}/schedule/month?month={m}", headers=dh)
        assert body.status_code == 200, body.text
        assert body.json()["month"] == m
        rows.update({x["date"]: x for x in body.json()["days"]})
    assert rows[target.isoformat()]["appointments_count"] == 2
    assert rows[target.isoformat()]["source"] == "template" and rows[target.isoformat()]["is_working"] is True
    assert rows[day_n(6).isoformat()] == {"date": day_n(6).isoformat(), "source": "leave", "is_working": False, "sessions_count": 0, "appointments_count": 0}
    assert rows[day_n(7).isoformat()]["source"] == "custom_hours" and rows[day_n(7).isoformat()]["sessions_count"] == 1


def test_month_has_one_row_per_day_and_validates_input(world):
    doc, _, dh, _ = setup(world)
    body = world.client.get(f"{D}/schedule/month?month=2026-12", headers=dh).json()
    assert len(body["days"]) == 31 and body["days"][0]["date"] == "2026-12-01"
    assert len(world.client.get(f"{D}/schedule/month?month=2028-02", headers=dh).json()["days"]) == 29
    assert world.client.get(f"{D}/schedule/month?month=2026-13", headers=dh).status_code == 422
    assert world.client.get(f"{D}/schedule/month", headers=dh).status_code == 422


def test_month_is_doctor_only_and_scoped(world):
    doc, pat, dh, ph = setup(world)
    other = world.doctor()
    mk(world, pat, doc, day_n(3), "10:00")
    assert world.client.get(f"{D}/schedule/month?month={month_of(day_n(3))}", headers=ph).status_code == 403
    assert world.client.get(f"{D}/schedule/month?month={month_of(day_n(3))}").status_code == 401
    mine = world.client.get(f"{D}/schedule/month?month={month_of(day_n(3))}", headers=world.headers(other)).json()
    assert sum(x["appointments_count"] for x in mine["days"]) == 0
