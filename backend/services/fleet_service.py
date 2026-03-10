"""
DealerSuite - Fleet CSV Import Service
Parses TSD Dealer CSV exports and upserts vehicles into the database.

Expected CSV columns (case-insensitive, order-independent):
  Loaner_Number, VIN, Year, Make, Model, Plate, Mileage, Status, Vehicle_Type

Rules:
  • Skip rows where Status == "Retired"
  • Upsert on VIN (update if exists, create if new)
  • Log each row as: created | updated | skipped | error
"""

import csv
import io
import logging
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from services.vehicle_service import upsert_vehicle_from_csv, validate_vin

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Required column names (normalised to lowercase for matching)
# ---------------------------------------------------------------------------
REQUIRED_COLS = {"vin"}

COLUMN_ALIASES = {
    # Normalised key -> possible CSV header names (includes real TSD Dealer export headers)
    "loaner_number": ["loaner_number", "loaner number", "loaner#", "loaner_no", "unit", "unit_number", "unit number"],
    "vin":           ["vin", "vin number", "vin#"],
    "year":          ["year", "model_year", "yr"],
    "make":          ["make", "manufacturer"],
    "model":         ["model", "model_name"],
    "plate":         ["plate", "license_plate", "plate_number", "license", "license_plate"],
    "mileage":       ["mileage", "miles", "odometer", "current_mileage", "current_miles"],
    "status":        ["status", "vehicle_status", "current_status"],
    "vehicle_type":  ["vehicle_type", "type", "category", "body_style"],
    "fuel":          ["fuel", "fuel_level", "current_fuel"],
}

# Status mapping from TSD export values to our internal values
TSD_STATUS_MAP = {
    "in use":      "Active",
    "available":   "Active",
    "active":      "Active",
    "in service":  "In Service",
    "out of service": "In Service",
    "retired":     "Retired",
    "sold":        "Retired",
}


# ---------------------------------------------------------------------------
# Result data class
# ---------------------------------------------------------------------------
@dataclass
class ImportResult:
    total:   int = 0
    created: int = 0
    updated: int = 0
    skipped: int = 0
    errors:  list[dict] = field(default_factory=list)

    @property
    def processed(self) -> int:
        return self.created + self.updated + self.skipped

    def to_dict(self) -> dict:
        return {
            "total":     self.total,
            "created":   self.created,
            "updated":   self.updated,
            "skipped":   self.skipped,
            "errors":    self.errors,
            "processed": self.processed,
        }


# ---------------------------------------------------------------------------
# CSV normalisation helpers
# ---------------------------------------------------------------------------

def _strip_excel(value: str) -> str:
    # Strip Excel formula wrapper: ="M498" -> M498
    if not value:
        return value
    v = value.strip()
    # Pattern: ="somevalue"  ->  somevalue
    if v.startswith('="') and v.endswith('"'):
        v = v[2:-1]
    # Leftover = sign with no quotes
    elif v.startswith('='):
        v = v[1:]
    return v.strip()


def _normalise_header(raw: str) -> str:
    return raw.strip().lower().replace(" ", "_").replace("-", "_")


def _map_columns(headers: list[str]) -> dict[str, str]:
    """
    Build a mapping: canonical_key -> actual_csv_header
    Returns dict with only the columns that were found.
    """
    normalised = {_normalise_header(h): h for h in headers}
    mapping = {}
    for canon, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in normalised:
                mapping[canon] = normalised[alias]
                break
    return mapping


def _get(row: dict, mapping: dict, key: str) -> Optional[str]:
    """Safe getter - returns None if column not in CSV. Strips Excel formula wrappers."""
    csv_col = mapping.get(key)
    if csv_col is None:
        return None
    raw = (row.get(csv_col) or "").strip()
    return _strip_excel(raw) or None


def _map_status(raw: str | None) -> str:
    """Map TSD Dealer status strings to our internal VehicleStatus values."""
    if not raw:
        return "Active"
    return TSD_STATUS_MAP.get(raw.lower().strip(), "Active")


# ---------------------------------------------------------------------------
# Main import function
# ---------------------------------------------------------------------------

async def import_fleet_csv(
    csv_bytes: bytes,
    db: AsyncSession,
) -> ImportResult:
    """
    Parse the CSV bytes and upsert every valid vehicle row.
    Returns a summary ImportResult.
    """
    result = ImportResult()

    # Decode bytes - try UTF-8, fall back to latin-1 (common in dealer exports)
    try:
        text = csv_bytes.decode("utf-8-sig")   # strip BOM if present
    except UnicodeDecodeError:
        text = csv_bytes.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))

    if not reader.fieldnames:
        result.errors.append({"row": 0, "error": "CSV file is empty or has no headers"})
        return result

    col_map = _map_columns(list(reader.fieldnames))

    # Check required columns exist
    missing = REQUIRED_COLS - set(col_map.keys())
    if missing:
        result.errors.append({
            "row": 0,
            "error": f"Missing required column(s): {', '.join(missing).upper()}. "
                     f"Found headers: {', '.join(reader.fieldnames)}",
        })
        return result

    for row_num, row in enumerate(reader, start=2):   # row 1 = headers
        result.total += 1

        raw_vin = _get(row, col_map, "vin") or ""

        raw_status = _get(row, col_map, "status") or "Active"

        # Build the normalised row dict that upsert_vehicle_from_csv expects
        normalised = {
            "VIN":          raw_vin,
            "Loaner_Number": _get(row, col_map, "loaner_number"),
            "Year":          _get(row, col_map, "year"),
            "Make":          _get(row, col_map, "make"),
            "Model":         _get(row, col_map, "model"),
            "Plate":         _get(row, col_map, "plate"),
            "Mileage":       _get(row, col_map, "mileage"),
            "Status":        _map_status(raw_status),
            "Vehicle_Type":  _get(row, col_map, "vehicle_type") or "Loaner",
            "Fuel":          _get(row, col_map, "fuel"),
        }

        try:
            _vehicle, action = await upsert_vehicle_from_csv(db, normalised)

            if action == "created":
                result.created += 1
            elif action == "updated":
                result.updated += 1
            elif action == "skipped":
                result.skipped += 1

        except Exception as exc:
            logger.warning("Row %d import error: %s", row_num, exc)
            result.errors.append({
                "row":   row_num,
                "vin":   raw_vin or "(blank)",
                "error": str(exc),
            })

    return result
