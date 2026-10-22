"""API/import input contracts and exact money conversion.

Pydantic checks shape, bounded text, currency and calendar dates. The service
checks cross-field salary precision and state-dependent rules, such as stale
versions and dates earlier than an existing salary. Money enters and leaves the
API as decimal strings; SQLite stores only integer minor units.
"""

import re
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

# This is the supported product scope, not a complete ISO currency registry.
CURRENCY_DECIMALS = {"USD": 2, "EUR": 2, "GBP": 2, "INR": 2, "JPY": 0}
Text = Annotated[str, Field(min_length=1, max_length=120)]


def no_control_characters(value: str) -> str:
    """Reject embedded low ASCII controls (U+0000..U+001F) in labels/audit reasons."""
    if any(ord(character) < 32 for character in value):
        raise ValueError("Control characters are not permitted")
    return value


def minor_units(value: str, currency: str) -> int:
    """Convert a positive plain-decimal salary to exact integer minor units.

    Reject exponent notation, signs, separators, excess precision and amounts
    above one billion instead of silently rounding user input. The short input
    limit also bounds Decimal parsing work. Invalid input raises ValueError.
    """
    if currency not in CURRENCY_DECIMALS:
        raise ValueError("Unsupported currency")
    if len(value) > 32 or not re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", value):
        raise ValueError("Salary must be a plain positive decimal number")
    fraction = value.partition(".")[2]
    if len(fraction) > CURRENCY_DECIMALS[currency]:
        raise ValueError(f"{currency} supports {CURRENCY_DECIMALS[currency]} decimal places")
    try:
        amount = Decimal(value)
    except InvalidOperation:
        raise ValueError("Salary must be a decimal number") from None
    if not amount.is_finite() or amount <= 0 or amount > Decimal("1000000000"):
        raise ValueError("Salary must be positive and no greater than 1,000,000,000")
    scaled = amount * (10 ** CURRENCY_DECIMALS[currency])
    if scaled != scaled.to_integral_value():
        raise ValueError(f"{currency} supports {CURRENCY_DECIMALS[currency]} decimal places")
    return int(scaled)


def money(units: int, currency: str) -> str:
    """Render trusted stored units at the currency's fixed precision for JSON/CSV."""
    digits = CURRENCY_DECIMALS[currency]
    return f"{Decimal(units) / (10**digits):.{digits}f}"


class EmployeeInput(BaseModel):
    """Full employee-create payload, also reused for validated CSV rows.

    Unknown keys are rejected so misspelled fields cannot be silently ignored.
    Salary is deliberately a string: JSON numbers risk binary-float conversion.
    """

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    employee_code: Annotated[str, Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")]
    name: Text
    department: Text
    job_title: Text
    country: Text
    currency: str
    annual_salary: str
    effective_date: date
    reason: Annotated[str, Field(min_length=3, max_length=500)]

    @field_validator("name", "department", "job_title", "country", "reason")
    @classmethod
    def no_controls(cls, value: str) -> str:
        """Apply the shared profile/audit text rule after whitespace normalization."""
        return no_control_characters(value)

    @field_validator("currency")
    @classmethod
    def currency_supported(cls, value: str) -> str:
        """Reject unknown/lowercase codes rather than guessing a currency."""
        if value not in CURRENCY_DECIMALS:
            raise ValueError("Supported currencies: " + ", ".join(CURRENCY_DECIMALS))
        return value

    @field_validator("effective_date")
    @classmethod
    def not_future(cls, value: date) -> date:
        """This current-state demo does not queue future salary changes."""
        if value > date.today():
            raise ValueError("Future-dated salary changes are not supported")
        return value


class EmployeeUpdate(EmployeeInput):
    """Full replacement payload plus the version the editor originally read.

    Strict integers reject booleans, fractional numbers and numeric strings.
    """

    version: Annotated[int, Field(strict=True, ge=1)]


class StatusChange(BaseModel):
    """Minimal optimistic-concurrency payload for archive and restore events."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    version: Annotated[int, Field(strict=True, ge=1)]
    reason: Annotated[str, Field(min_length=3, max_length=500)]

    @field_validator("reason")
    @classmethod
    def no_controls(cls, value: str) -> str:
        """Apply the same audit-text invariant as employee creation and edits."""
        return no_control_characters(value)


class CSVImport(BaseModel):
    """JSON-wrapped CSV text; middleware separately caps actual request bytes."""

    model_config = ConfigDict(extra="forbid")
    csv: Annotated[str, Field(max_length=5_000_000)]
