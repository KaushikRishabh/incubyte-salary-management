"""Validated salary inputs. Money never passes through binary floating point."""

import re
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

CURRENCY_DECIMALS = {"USD": 2, "EUR": 2, "GBP": 2, "INR": 2, "JPY": 0}
Text = Annotated[str, Field(min_length=1, max_length=120)]


def minor_units(value: str, currency: str) -> int:
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
    digits = CURRENCY_DECIMALS[currency]
    return f"{Decimal(units) / (10**digits):.{digits}f}"


class EmployeeInput(BaseModel):
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
        if any(ord(c) < 32 for c in value):
            raise ValueError("Control characters are not permitted")
        return value

    @field_validator("currency")
    @classmethod
    def currency_supported(cls, value: str) -> str:
        if value not in CURRENCY_DECIMALS:
            raise ValueError("Supported currencies: " + ", ".join(CURRENCY_DECIMALS))
        return value

    @field_validator("effective_date")
    @classmethod
    def not_future(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("Future-dated salary changes are not supported")
        return value


class EmployeeUpdate(EmployeeInput):
    version: Annotated[int, Field(strict=True, ge=1)]


class StatusChange(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    version: Annotated[int, Field(strict=True, ge=1)]
    reason: Annotated[str, Field(min_length=3, max_length=500)]


class CSVImport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    csv: Annotated[str, Field(max_length=5_000_000)]
