from __future__ import annotations

import base64
import csv
import io
import json


def _value(value):
    if value in (None, "", [], {}): return ""
    return json.dumps(value, default=str) if isinstance(value, (dict, list)) else str(value)


def _table(rows, columns):
    clean = [[_value(row.get(column)).replace("|", "\\|") for column in columns] for row in rows]
    clean = [row for row in clean if any(row)]
    if not clean: return ""
    return "| " + " | ".join(columns) + " |\n| " + " | ".join(["---"] * len(columns)) + " |\n" + "\n".join("| " + " | ".join(row) + " |" for row in clean)


def _file_text(name, content_type, data, warnings):
    lowered = (content_type or "").lower()
    if lowered.startswith("image/"):
        warnings.append("image file omitted, OCR not enabled")
        return ""
    if "pdf" in lowered or name.lower().endswith(".pdf"):
        try:
            import pymupdf4llm
            value = pymupdf4llm.to_markdown(stream=data, filetype="pdf")
        except Exception:
            try:
                from pypdf import PdfReader
                value = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(data)).pages)
            except Exception:
                warnings.append("image file omitted, OCR not enabled")
                return ""
        if not value.strip(): warnings.append("image file omitted, OCR not enabled")
        return value
    try: value = data.decode("utf-8")
    except UnicodeDecodeError: return ""
    if "csv" in lowered or name.lower().endswith(".csv"):
        rows = list(csv.reader(io.StringIO(value)))
        return _table([dict(zip(rows[0], row)) for row in rows[1:]], rows[0]) if rows else ""
    if "json" in lowered or name.lower().endswith(".json"):
        try: return "```json\n" + json.dumps(json.loads(value), indent=2) + "\n```"
        except json.JSONDecodeError: pass
    return value.strip()


def records_to_markdown(records: dict) -> tuple[str, list[str], list[str]]:
    warnings, sources, sections = [], [], []
    patient = records.get("patient", {})
    if patient:
        sections.append("## Patient\n" + _table([patient], ["full_name", "age", "gender"]))
        sources.append("CityHospital patient profile")
    for label, key, columns, source in [
        ("Appointments", "appointments", ["starts_at", "reason", "status"], "CityHospital appointments"),
        ("Prescriptions", "prescriptions", ["issued_on", "medicine", "dosage", "timing", "status"], "CityHospital prescriptions"),
        ("Lab and radiology reports", "reports", ["scheduled_for", "test_name", "results", "findings", "impression", "status"], "CityHospital lab reports"),
        ("Assistant records", "patient_records", ["created_at", "category", "content", "metadata"], "Medical Assistant records"),
    ]:
        rows = records.get(key, [])
        table = _table(rows, columns)
        if table: sections.append(f"## {label}\n{table}"); sources.append(source)
    for file in records.get("files", []) + records.get("documents", []):
        data = file.get("data") or base64.b64decode(file.get("content_base64", ""))
        value = _file_text(file.get("name", "record"), file.get("content_type", ""), data, warnings)
        if value: sections.append(f"## Document: {file.get('name', 'record')}\n{value}"); sources.append(file.get("name", "record"))
    return "\n\n".join(section for section in sections if section), list(dict.fromkeys(sources)), warnings
