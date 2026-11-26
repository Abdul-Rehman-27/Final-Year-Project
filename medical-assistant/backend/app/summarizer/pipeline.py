from __future__ import annotations

import hashlib
import json
import time
from pydantic import ConfigDict, create_model

from app.core import settings
from app.llm import chat
from app.summarizer.markdown import records_to_markdown

MISSING = "Not documented in the provided records"
SUMMARY_FIELDS = ["patient_overview", "chief_complaint", "medical_history", "surgical_history", "medications", "allergies", "family_history", "social_history", "vitals_and_results", "assessment_and_plan"]
SummaryFields = create_model("SummaryFields", __config__=ConfigDict(extra="forbid"), **{key: (str, ...) for key in SUMMARY_FIELDS})
INSTRUCTION = "Summarize only facts stated in the source. Never infer missing facts. Return only JSON with exactly these fields: " + ", ".join(SUMMARY_FIELDS) + ". Use '" + MISSING + "' for absent facts."


def validate_fields(raw):
    if isinstance(raw, str): raw = json.loads(raw.strip().removeprefix("```json").removesuffix("```").strip())
    return SummaryFields.model_validate(raw).model_dump()


async def summarize_records(records: dict):
    markdown, sources, warnings = records_to_markdown(records)
    if not markdown.strip(): raise ValueError("No readable patient records were found.")
    truncated = len(markdown) > settings.SUMMARIZER_MAX_CONTEXT_CHARS
    if truncated:
        # Keep section boundaries; each chunk is grounded independently before the final merge.
        chunks, current = [], ""
        for section in markdown.split("\n## "):
            candidate = current + "\n## " + section
            if len(candidate) > settings.SUMMARIZER_MAX_CONTEXT_CHARS and current: chunks.append(current); current = "## " + section
            else: current = candidate
        chunks.append(current)
        partials = []
        for chunk in chunks:
            result = await chat([{"role":"system","content":INSTRUCTION}, {"role":"user","content":chunk}], max_tokens=1500, json_mode=True)
            partials.append(result["text"])
        source = "\n".join(partials)
    else: source = markdown
    result = await chat([{"role":"system","content":INSTRUCTION}, {"role":"user","content":source}], max_tokens=1500, json_mode=True)
    try: fields = validate_fields(result["text"])
    except Exception:
        repair = await chat([{"role":"system","content":INSTRUCTION + " Repair invalid JSON."}, {"role":"user","content":result.get("text", "")}], max_tokens=1500, json_mode=True)
        fields = validate_fields(repair["text"]); result = repair
    return {"fields": fields, "markdown": markdown, "sources": sources, "warnings": warnings, "truncated": truncated, "provider": result.get("provider"), "model": result.get("model"), "usage": result.get("usage", {}), "generated_at": int(time.time())}


def markdown_hash(markdown): return hashlib.sha256(markdown.encode()).hexdigest()
