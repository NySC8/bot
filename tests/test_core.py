import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

os.environ["BOT_TOKEN"] = "test"
os.environ["GROUP_CHAT_ID"] = "-1001"
os.environ["TOPIC_IRAN"] = "10"
os.environ["TOPIC_MIDDLE_EAST"] = "20"
os.environ["TOPIC_WORLD"] = "30"

from core import clean_text, fingerprint, build_message

def test_clean_text():
    assert clean_text("<b>Hello</b>   world") == "Hello world"

def test_fingerprint_stable():
    assert fingerprint("Title", "https://example.com/a") == fingerprint("Title", "https://example.com/a")

def test_message_contains_source_and_link():
    msg = build_message("World", "Test", "A title", "A summary", "https://example.com/a")
    assert "A title" in msg
    assert "Test" in msg
    assert "https://example.com/a" in msg
