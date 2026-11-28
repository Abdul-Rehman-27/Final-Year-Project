import asyncio
import os
import sys
import tempfile
from pathlib import Path

os.environ["MEDICAL_ASSISTANT_DB"] = str(Path(tempfile.mkdtemp()) / "test.sqlite3")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import api

# The four cases from the owner: Urdu, Roman Urdu, English, and a mix where the larger part wins.
URDU = "مجھے تین دن سے بخار ہے اور گلے میں درد ہے"
ROMAN = "Mujhe teen din se bukhar hai aur gale mein dard hai"
ENGLISH = "I have had a fever for three days and my throat hurts"
MIXED_URDU = "مجھے تین دن سے بخار ہے اور گلے میں درد ہے, please help"
MIXED_ENGLISH = "I have had a fever for three days and my throat hurts, مجھے ڈر لگ رہا ہے"
MIXED_ROMAN = "Mujhe kal raat se bukhar hai aur my throat hurts"


def test_four_styles_by_rules():
    assert api.language_of(URDU) == "urdu"
    assert api.language_of(ROMAN) == "roman"
    assert api.language_of(ENGLISH) == "english"
    assert api.language_of("hye") == "english"


def test_mixed_messages_follow_the_dominant_style():
    assert api.language_of(MIXED_URDU) == "urdu"
    assert api.language_of(MIXED_ENGLISH) == "english"
    assert api.language_of(MIXED_ROMAN) == "roman"
    assert api.language_of("My beta has a high fever since last night, doctor please help") == "english"


def test_clear_messages_never_call_the_model(monkeypatch):
    async def boom(*args, **kwargs):
        raise AssertionError("model should not be called")
    monkeypatch.setattr(api, "chat", boom)
    for text in (URDU, ROMAN, ENGLISH):
        asyncio.run(api.detect_language(text))


def test_unclear_message_asks_the_model_and_falls_back(monkeypatch):
    text = "Mujhe bukhar hai and I feel very weak since yesterday morning"
    assert api.language_is_unclear(text)

    async def says_roman(messages, **kwargs):
        return {"text": '{"language": "roman"}'}
    monkeypatch.setattr(api, "chat", says_roman)
    assert asyncio.run(api.detect_language(text)) == "roman"

    async def broken(messages, **kwargs):
        raise RuntimeError("down")
    monkeypatch.setattr(api, "chat", broken)
    assert asyncio.run(api.detect_language(text)) == api.language_of(text)

    async def junk(messages, **kwargs):
        return {"text": "not json"}
    monkeypatch.setattr(api, "chat", junk)
    assert asyncio.run(api.detect_language(text)) == api.language_of(text)


def test_causes_are_cleaned_and_never_add_up_to_more_than_100():
    causes = api.clean_causes([{"name": "Angina", "percent": 70}, {"name": "Anemia", "percent": 60}, "Acid reflux", {"name": " ", "percent": 5}])
    assert [c["name"] for c in causes] == ["Angina", "Anemia", "Acid reflux"]
    assert sum(c["percent"] or 0 for c in causes) <= 101  # rounding can add 1
    assert causes[2]["percent"] is None
    assert api.clean_causes([{"name": "X", "percent": 250}])[0]["percent"] == 100
    assert api.clean_causes("nonsense") == []
