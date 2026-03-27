"""Excel to CSV bridge — thin wrapper using pandas."""

import io
import logging

logger = logging.getLogger(__name__)


def read_xlsx(file_bytes: bytes, sheet_name: str | None = None) -> str:
    """Read a single sheet from an XLSX file and return CSV text."""
    import pandas as pd

    try:
        df = pd.read_excel(
            io.BytesIO(file_bytes),
            sheet_name=sheet_name or 0,
            engine="openpyxl",
        )
    except Exception as e:
        logger.exception("Failed to read XLSX sheet %s", sheet_name)
        raise ValueError(f"Cannot read Excel file (sheet={sheet_name}): {e}") from e

    return df.to_csv(index=False)


def read_xlsx_all_sheets(file_bytes: bytes) -> dict[str, str]:
    """Read all sheets from an XLSX file. Returns {sheet_name: csv_text}."""
    import pandas as pd

    try:
        sheets = pd.read_excel(
            io.BytesIO(file_bytes),
            sheet_name=None,
            engine="openpyxl",
        )
    except Exception as e:
        logger.exception("Failed to read XLSX file")
        raise ValueError(f"Cannot read Excel file: {e}") from e

    return {name: df.to_csv(index=False) for name, df in sheets.items()}
