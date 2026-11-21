import smtplib
from email.message import EmailMessage

from app.core.config import settings


def send_password_reset_code(recipient: str, code: str) -> None:
    if not settings.SMTP_HOST or not settings.SMTP_FROM_EMAIL:
        raise RuntimeError("Password reset email is not configured")

    message = EmailMessage()
    message["Subject"] = "CityHospital password reset code"
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = recipient
    message.set_content(
        f"Your CityHospital password reset code is {code}. It expires in "
        f"{settings.PASSWORD_RESET_CODE_TTL_MINUTES} minutes. If you did not request this, ignore this email."
    )

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
        if settings.SMTP_USE_TLS:
            smtp.starttls()
        if settings.SMTP_USERNAME:
            smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        smtp.send_message(message)
