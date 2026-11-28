from app.service_factory import create_service

app = create_service("Patient Chatbot Service", ("/api/v1/chat", "/api/v1/integrations"))
