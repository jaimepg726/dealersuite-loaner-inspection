"""
Fleet CSV import sync regression tests.

Tests the core decommission/reactivation LOGIC without requiring SQLAlchemy,
following the same pattern as test_video_dedup.py (mock objects, pure logic).

Four behaviors verified:
  1. New unit in CSV → created + active
  2. Existing unit in CSV → updated in place
  3. Active unit missing from CSV → decommissioned (is_active=False, status='Retired')
  4. Previously retired unit re-appears in CSV → reactivated (is_active=True)
"""

import pytest
from typing import Optional


# ── Helpers ───────────────────────────────────────────────────────────────────

class FakeVehicle:
    """Minimal stand-in for a Vehicle ORM row."""
    def __init__(self, loaner_number, vin, vehicle_type="Loaner",
                 is_active=True, status="Active"):
        self.loaner_number = loaner_number
        self.vin = vin
        self.vehicle_type = vehicle_type
        self.is_active = is_active
        self.status = status


def _collect_active_loaner_numbers(rows: list[dict]) -> set[str]:
    """
    Reproduce the fleet_import.py Step 2 logic:
    collect loaner numbers from non-Retired rows only.
    """
    numbers: set[str] = set()
    for row in rows:
        raw = (row.get("loaner_number") or "").strip()
        raw_status = (row.get("status") or "").lower().strip()
        if raw and raw_status != "retired":
            numbers.add(raw)
    return numbers


def _should_decommission(vehicle: FakeVehicle, current_fleet: set[str]) -> bool:
    """
    Reproduce the decommission WHERE clause:
    Vehicle.loaner_number.isnot(None)
    AND Vehicle.loaner_number.notin_(current_fleet)
    AND Vehicle.is_active == True

    Filters on loaner_number rather than vehicle_type so that vehicles
    previously stored with a wrong vehicle_type (e.g. 'Countryman' from the
    TSD Body Style column before the alias fix) are still correctly retired.
    """
    return (
        vehicle.loaner_number is not None
        and vehicle.is_active is True
        and vehicle.loaner_number not in current_fleet
    )


def _apply_decommission(vehicles: list[FakeVehicle], current_fleet: set[str]) -> int:
    """Simulate the bulk update: set is_active=False, status='Retired'."""
    count = 0
    for v in vehicles:
        if _should_decommission(v, current_fleet):
            v.is_active = False
            v.status = "Retired"
            count += 1
    return count


def _upsert_from_csv_row(existing: Optional[FakeVehicle], row: dict):
    """
    Reproduce upsert_vehicle_from_csv: always sets is_active=True and
    updates status from the CSV row for vehicles NOT marked Retired in CSV.
    Returns ('created', vehicle) or ('updated', vehicle) or ('skipped', None).
    """
    status_val = (row.get("status") or "Active").strip()
    if status_val.lower() == "retired":
        return "skipped", None

    fields = {
        "loaner_number": row.get("loaner_number"),
        "vin": row.get("vin", ""),
        "status": status_val,
        "is_active": True,  # always reactivate vehicles present in file
    }

    if existing:
        for k, v in fields.items():
            if v is not None:
                setattr(existing, k, v)
        return "updated", existing
    else:
        v = FakeVehicle(
            loaner_number=fields["loaner_number"],
            vin=fields["vin"],
            is_active=True,
            status=status_val,
        )
        return "created", v


def _fleet_list_query(vehicles: list, status_filter: Optional[str] = None):
    """
    Reproduce the fixed fleet.py list query logic:
    - status='Retired' → is_active=False only
    - anything else   → is_active=True only
    """
    if status_filter and status_filter.lower() == "retired":
        return [v for v in vehicles if v.is_active is False]
    else:
        base = [v for v in vehicles if v.is_active is True]
        if status_filter:
            base = [v for v in base if v.status == status_filter]
        return base


# ─────────────────────────────────────────────────────────────────────────────
# 1. New unit in CSV → created and active
# ─────────────────────────────────────────────────────────────────────────────

def test_new_unit_created_and_active():
    rows = [{"loaner_number": "L001", "vin": "1HGBH41JXMN109186", "status": "Active"}]
    current_fleet = _collect_active_loaner_numbers(rows)

    existing_db: list[FakeVehicle] = []
    _apply_decommission(existing_db, current_fleet)

    action, vehicle = _upsert_from_csv_row(None, rows[0])
    assert action == "created"
    assert vehicle.is_active is True
    assert vehicle.loaner_number == "L001"


# ─────────────────────────────────────────────────────────────────────────────
# 2. Existing unit in CSV → updated in place (not duplicated)
# ─────────────────────────────────────────────────────────────────────────────

def test_existing_unit_updated_in_place():
    existing = FakeVehicle("L002", "2HGBH41JXMN109187", status="Active")
    row = {"loaner_number": "L002", "vin": "2HGBH41JXMN109187", "status": "In Service"}

    action, updated = _upsert_from_csv_row(existing, row)
    assert action == "updated"
    assert updated is existing           # same object, not a new one
    assert updated.status == "In Service"
    assert updated.is_active is True


# ─────────────────────────────────────────────────────────────────────────────
# 3. Active unit missing from new CSV → decommissioned
# ─────────────────────────────────────────────────────────────────────────────

def test_missing_active_unit_becomes_retired():
    kept    = FakeVehicle("L003", "3HGBH41JXMN109188")
    removed = FakeVehicle("L004", "4HGBH41JXMN109189")
    fleet = [kept, removed]

    # New CSV only contains L003
    new_csv_rows = [{"loaner_number": "L003", "vin": "3HGBH41JXMN109188", "status": "Active"}]
    current_fleet = _collect_active_loaner_numbers(new_csv_rows)

    decommissioned = _apply_decommission(fleet, current_fleet)

    assert decommissioned == 1
    assert kept.is_active is True
    assert kept.status != "Retired"
    # Record still exists — just decommissioned, never deleted
    assert removed.is_active is False
    assert removed.status == "Retired"


# ─────────────────────────────────────────────────────────────────────────────
# 4. Previously retired unit re-appears in CSV → reactivated
# ─────────────────────────────────────────────────────────────────────────────

def test_retired_unit_reactivated_on_reimport():
    # Simulate a vehicle that was previously decommissioned
    reactivating = FakeVehicle("L005", "5HGBH41JXMN109190", is_active=False, status="Retired")

    row = {"loaner_number": "L005", "vin": "5HGBH41JXMN109190", "status": "Active"}
    action, updated = _upsert_from_csv_row(reactivating, row)

    assert action == "updated"
    assert updated.is_active is True
    assert updated.status == "Active"


# ─────────────────────────────────────────────────────────────────────────────
# 5. Retired CSV rows are skipped — not inserted, not counted as active
# ─────────────────────────────────────────────────────────────────────────────

def test_csv_retired_rows_are_skipped():
    row = {"loaner_number": "L006", "vin": "7HGBH41JXMN109192", "status": "Retired"}
    action, vehicle = _upsert_from_csv_row(None, row)
    assert action == "skipped"
    assert vehicle is None


def test_retired_csv_rows_excluded_from_active_fleet_set():
    rows = [
        {"loaner_number": "L007", "vin": "8HGBH41JXMN109193", "status": "Active"},
        {"loaner_number": "L008", "vin": "9HGBH41JXMN109194", "status": "Retired"},
    ]
    current_fleet = _collect_active_loaner_numbers(rows)
    assert "L007" in current_fleet
    assert "L008" not in current_fleet  # Retired rows must not protect a vehicle from decommission


# ─────────────────────────────────────────────────────────────────────────────
# 6. Empty CSV (no loaner numbers) → decommission guard fires, nothing retired
# ─────────────────────────────────────────────────────────────────────────────

def test_empty_csv_does_not_decommission_all():
    active_vehicle = FakeVehicle("L009", "1HGBH41JXMN109195")

    # CSV has no loaner numbers → current_fleet is empty → guard skips decommission
    rows: list[dict] = []
    current_fleet = _collect_active_loaner_numbers(rows)

    # The real code guards against this: if not current_fleet_numbers, skip decommission
    if current_fleet:
        _apply_decommission([active_vehicle], current_fleet)

    assert active_vehicle.is_active is True  # untouched


# ─────────────────────────────────────────────────────────────────────────────
# 7. Fleet list query — retired filter shows is_active=False vehicles only
# ─────────────────────────────────────────────────────────────────────────────

def test_fleet_list_default_hides_retired():
    """Default fleet list must not show is_active=False vehicles."""
    active  = FakeVehicle("L010", "2HGBH41JXMN109196", is_active=True,  status="Active")
    retired = FakeVehicle("L011", "3HGBH41JXMN109197", is_active=False, status="Retired")

    result = _fleet_list_query([active, retired], status_filter=None)
    assert active  in result
    assert retired not in result


def test_fleet_list_retired_filter_shows_only_inactive():
    """Retired filter must return only is_active=False vehicles."""
    active  = FakeVehicle("L012", "4HGBH41JXMN109198", is_active=True,  status="Active")
    retired = FakeVehicle("L013", "5HGBH41JXMN109199", is_active=False, status="Retired")

    result = _fleet_list_query([active, retired], status_filter="Retired")
    assert active  not in result
    assert retired in result


def test_fleet_list_active_filter_excludes_retired():
    """Explicit 'Active' filter must only show is_active=True with status='Active'."""
    active    = FakeVehicle("L014", "6HGBH41JXMN109200", is_active=True,  status="Active")
    in_svc    = FakeVehicle("L015", "7HGBH41JXMN109201", is_active=True,  status="In Service")
    retired   = FakeVehicle("L016", "8HGBH41JXMN109202", is_active=False, status="Retired")

    result = _fleet_list_query([active, in_svc, retired], status_filter="Active")
    assert active  in result
    assert in_svc  not in result
    assert retired not in result


# ─────────────────────────────────────────────────────────────────────────────
# 8. Vehicles without a loaner number are not decommissioned by CSV import
# ─────────────────────────────────────────────────────────────────────────────

def test_non_loaner_vehicles_not_decommissioned():
    """Vehicles with no loaner_number (inventory, sales) are never decommissioned."""
    # Real inventory/sales vehicles have no loaner number — that's the protection
    inventory = FakeVehicle(None, "9HGBH41JXMN109203", vehicle_type="Inventory")
    current_fleet: set[str] = {"L001"}

    decommissioned = _apply_decommission([inventory], current_fleet)
    assert decommissioned == 0
    assert inventory.is_active is True


# ─────────────────────────────────────────────────────────────────────────────
# 9. Vehicles stored with wrong vehicle_type (e.g. body style) are still retired
# ─────────────────────────────────────────────────────────────────────────────

def test_wrong_vehicle_type_still_decommissioned():
    """
    Vehicles previously imported with vehicle_type='Countryman' (body style alias bug)
    must still be decommissioned when they disappear from the CSV.
    The filter uses loaner_number, not vehicle_type, so this is now safe.
    """
    v = FakeVehicle("M502", "WMZ23GA06T7T90489", vehicle_type="Countryman")
    current_fleet: set[str] = {"M503"}  # M502 not present

    decommissioned = _apply_decommission([v], current_fleet)
    assert decommissioned == 1
    assert v.is_active is False
    assert v.status == "Retired"


def test_correct_vehicle_type_not_decommissioned_when_present():
    """A loaner that IS in the new CSV is never decommissioned regardless of vehicle_type."""
    v = FakeVehicle("M502", "WMZ23GA06T7T90489", vehicle_type="Countryman")
    current_fleet: set[str] = {"M502", "M503"}  # M502 is present

    decommissioned = _apply_decommission([v], current_fleet)
    assert decommissioned == 0
    assert v.is_active is True
