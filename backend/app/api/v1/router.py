from fastapi import APIRouter

from app.api.v1.routes import admin_module, auth, chatbot, chatbot_admin, evaluation

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(chatbot.router)
api_router.include_router(chatbot_admin.router)
api_router.include_router(evaluation.router)
api_router.include_router(admin_module.router)
from app.api.v1.routes import doctor
api_router.include_router(doctor.router)
from app.api.v1.routes import patient
api_router.include_router(patient.router)
from app.api.v1.routes import doctor_followups, doctor_scheduling, patient_changes, patient_followups
api_router.include_router(doctor_scheduling.router)
api_router.include_router(patient_changes.router)
api_router.include_router(doctor_followups.router)
api_router.include_router(patient_followups.router)
