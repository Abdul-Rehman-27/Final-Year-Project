from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


admin_role_permissions = Table(
    "admin_role_permissions",
    Base.metadata,
    Column("role_id", ForeignKey("admin_roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", ForeignKey("admin_permissions.id", ondelete="CASCADE"), primary_key=True),
)


class AdminDepartment(Base):
    __tablename__ = "admin_departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    name_key: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(200), nullable=False, default="")


class AdminPermission(Base):
    __tablename__ = "admin_permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    name_key: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    roles: Mapped[list["AdminRole"]] = relationship(secondary=admin_role_permissions, back_populates="permissions")


class AdminRole(Base):
    __tablename__ = "admin_roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(30), nullable=False)
    name_key: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    permissions: Mapped[list[AdminPermission]] = relationship(secondary=admin_role_permissions, back_populates="roles")


class AdminStaffProfile(Base):
    __tablename__ = "admin_staff_profiles"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("admin_departments.id", ondelete="RESTRICT"), nullable=True)
    photo: Mapped[str] = mapped_column(Text, nullable=False, default="")
    specialty: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    consultation_fee: Mapped[int | None] = mapped_column(Integer, nullable=True)


class AdminModuleState(Base):
    """Small migration marker used to seed built-in records exactly once."""
    __tablename__ = "admin_module_state"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
