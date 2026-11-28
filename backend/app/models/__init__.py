from app.models.user import Role, User  # noqa: F401  (ensures models are registered)
from app.models.chatbot import AdminAuditLog, ChatConversation, ChatMessage, ModelConfig, ModelUsage  # noqa: F401
from app.models.password_reset import PasswordResetCode  # noqa: F401
from app.models.evaluation import BenchmarkQuery, EvaluationRun  # noqa: F401
from app.models.admin import AdminDepartment, AdminPermission, AdminRole, AdminStaffProfile, AdminModuleState  # noqa: F401
from app.models.portal import PortalAppointment, PortalClinicalSummary, PortalDoctorSchedule, PortalHospitalSettings, PortalLabReport, PortalLabReportFile, PortalLabTest, PortalPrescription, PortalPrescriptionItem  # noqa: F401
