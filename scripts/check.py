import ast
from pathlib import Path
ast.parse(Path("bot.py").read_text(encoding="utf-8"))
print("Syntax check: PASS")
