from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from app.services.portal_core import build_queue

def test_queue_reference_ordering():
    now=datetime(2025,1,1,tzinfo=timezone.utc)
    def row(i, minutes, visit="scheduled", checked=None, called=None):
        return SimpleNamespace(id=i,starts_at=now+timedelta(minutes=minutes),visit_status=visit,checked_in_at=now+timedelta(minutes=checked) if checked is not None else None,called_at=now+timedelta(minutes=called) if called is not None else None,completed_at=now,patient_name=str(i))
    q=build_queue([row(1,-10,"completed"),row(2,-8,"incomplete"),row(3,-6,"in_progress",-8,-5),row(4,-3,"scheduled",-1),row(5,-2,"scheduled",-1),row(6,10),row(7,-20)],now,5)
    assert [x["appointment"].id for x in q["items"]]==[3,4,5,1,2]
    assert [x["appointment"].id for x in q["expected"]]==[7,6]
    assert q["counts"]["all"]==5
