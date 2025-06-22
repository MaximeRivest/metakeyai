META = {
    "id": "word_count",
    "name": "Word Count",
    "description": "Counts words and characters in the given text.",
    "icon": "🔢",
    "category": "text",
}


def main(text: str) -> str:
    """Return a simple count summary."""
    words = len(text.split())
    chars = len(text)
    return f"{words} words, {chars} characters" 