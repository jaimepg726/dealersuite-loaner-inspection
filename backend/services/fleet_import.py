"""
DealerSuite - Fleet Import Service
Wraps the CSV import with auto-decommission logic.

Process:
  1. Parse uploaded fleet file
  2. Extract loaner numbers present in the file
  3. Mark loaner vehicles missing from the file as inactive
  4. Insert or update vehicles in the file (upsert on VIN)

Rules:
  - Never delete records (only set is_active = False)
  - Only decommission vehicles of vehicle_type 'Loaner'
  - Vehicles in the file are always set is_active = True on upsert
"""

import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import update

from models.vehicle import Vehicle
from services.fleet_service import import_fleet_csv as _import_fleet_csv, ImportResult
from services.fleet_service import (
    _strip_excel,
    _normalise_header,
    _map_columns,
    _get,
    COLUMN_ALIASES,
)

logger = logging.getLogger(__name__)


async def import_fleet_csv(
    csv_bytes: bytes,
    db: AsyncSession,
) -> ImportResult:
    """
    Enhanced fleet import that:
      1. Extracts all loaner numbers present in the uploaded file.
      2. Marks any loaner vehicle NOT in the file as is_active = False.
      3. Delegates the per-row upsert to the existing fleet_service logic.

    Returns the same ImportResult summary plus a 'decommissioned' count
    stored in ImportResult.skipped is NOT used for decommissioned —
    we log it separately and attach it to the result dict via a monkey-patch.
    """
    import csv
    import io

    # ── Step 1: decode ───────────────────────────────────────────────────────
    try:
        text = csv_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = csv_bytes.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))

    if not reader.fieldnames:
        result = ImportResult()
        result.errors.append({"row": 0, "error": "CSV file is empty or has no headers"})
        return result

    col_map = _map_columns(list(reader.fieldnames))

    # ── Step 2: collect loaner numbers of ACTIVE (non-Retired) vehicles ───────
    # Retired rows are intentionally excluded so the decommission step below
    # treats them the same as vehicles missing from the file (→ is_active=False).
    # Including them would protect them from decommission even though they're retired.
    rows = list(reader)
    current_fleet_numbers: set[str] = set()
    for row in rows:
        raw = _get(row, col_map, "loaner_number")
        raw_status = (_get(row, col_map, "status") or "").lower().strip()
        if raw and raw_status != "retired":
            current_fleet_numbers.add(raw.strip())

    logger.info(
        "Fleet import: found %d active loaner numbers in file: %s",
        len(current_fleet_numbers),
        sorted(current_fleet_numbers),
    )

    # ── Step 3: decommission vehicles missing from file ──────────────────────
    # Filter by loaner_number.isnot(None) rather than vehicle_type == "Loaner"
    # so that vehicles previously imported with a wrong vehicle_type value
    # (e.g. "Countryman" from the TSD Body Style column before the alias fix)
    # are still correctly retired when they disappear from the CSV.
    decommissioned = 0
    if current_fleet_numbers:
        stmt = (
            update(Vehicle)
            .where(
                Vehicle.loaner_number.isnot(None),
                Vehicle.loaner_number.notin_(current_fleet_numbers),
                Vehicle.is_active == True,  # noqa: E712
            )
            .values(is_active=False, status="Retired")
            .execution_options(synchronize_session="fetch")
        )
        result_proxy = await db.execute(stmt)
        decommissioned = result_proxy.rowcount
        if decommissioned:
            logger.info(
                "Fleet import: decommissioned %d loaner vehicle(s) not in file",
                decommissioned,
            )
    else:
        logger.warning(
            "Fleet import: no loaner numbers found in CSV - skipping decommission "
            "to avoid marking all vehicles inactive"
        )

    # ── Step 4: upsert vehicles from file (existing logic) ───────────────────
    result = await _import_fleet_csv(csv_bytes, db)

    # Attach decommissioned count so the route can include it in the response
    result.decommissioned = decommissioned  # type: ignore[attr-defined]

    return result
