from app.service_factory import create_service

app = create_service("Doctor Clinical Summarizer Service", ("/api/v1/summaries",))
