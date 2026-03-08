"""
DealerSuite — ORM Models
Import all models here so SQLAlchemy's metadata and Alembic
can discover every table from a single import.
"""

from models.user       import User, UserRole          # noqa: F401
from models.vehicle    import Vehicle, VehicleStatus, VehicleType   # noqa: F401
from models.inspection import Inspection, InspectionType, InspectionStatus  # noqa: F401
from models.damage     import Damage, DamageStatus, DamageLocation  # noqa: F401

__all__ = [
    "User", "UserRole",
    "Vehicle", "VehicleStatus", "VehicleType",
    "Inspection", "InspectionType", "InspectionStatus",
    "Damage", "DamageStatus", "DamageLocation",
]
