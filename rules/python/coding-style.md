---
description: Python conventions — type hints, dataclasses, pathlib, specific exceptions, safe subprocess and deserialisation
globs: "**/*.py,**/*.pyi"
---

# Python

- Type-hint public functions; keep the type checker (mypy/pyright) clean.
- Format and lint with the project's tools (usually `ruff`); follow PEP 8 naming.
- `dataclasses` or pydantic models instead of loose dicts for structured data.
- `pathlib.Path` for paths; time-zone-aware `datetime`.
- Catch specific exceptions; never bare `except:`; chain with `raise ... from err`.
- No mutable default arguments.
- `subprocess.run([...])` with argument lists, never `shell=True` with external input; `yaml.safe_load`; never unpickle untrusted data.
- Use `logging`, not `print`, in library and service code.
