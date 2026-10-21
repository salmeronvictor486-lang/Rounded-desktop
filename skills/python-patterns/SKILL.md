---
name: python-patterns
description: Modern, maintainable Python — project layout, type hints checked by a type checker, dataclasses and pydantic models, error handling, packaging with uv or poetry, and pytest testing. Use when writing or reviewing Python code.
---

# Python patterns

## Project setup

- `pyproject.toml` as the single configuration file; manage environments and dependencies with `uv` (or poetry); commit the lockfile.
- `src/` layout (`src/package_name/`) so tests run against the installed package.
- Tooling: `ruff` (lint + format), `mypy` or `pyright` in strict mode, `pytest`.

## Types

- Type-hint all public functions; run the type checker in CI.
- Use built-in generics (`list[str]`, `dict[str, int]`) and `X | None`.
- `Protocol` for structural interfaces; `TypedDict` for dict-shaped data you do not control; `Literal` and `Enum` for closed sets.
- `@dataclass(frozen=True, slots=True)` for internal value objects; pydantic models for validating external input.

## Idioms

- Comprehensions for simple transforms; generators for large or streaming data.
- Context managers (`with`) for files, locks, transactions and temporary state.
- `pathlib.Path` instead of string paths; `datetime` with time zones (`datetime.now(tz=UTC)`).
- f-strings for formatting; `logging` (with structured extras) instead of `print` in libraries and services.
- Avoid mutable default arguments (`def f(items=None)` then `items = items or []`).

## Errors

- Raise specific exceptions; define a small hierarchy for your package.
- Catch specific exceptions; never bare `except:`.
- Chain causes with `raise NewError(...) from err`.

## Concurrency

- I/O-bound: `asyncio` with `httpx`/`asyncpg`, or threads for blocking libraries.
- CPU-bound: `multiprocessing` / `concurrent.futures.ProcessPoolExecutor`.
- Never block the event loop with synchronous I/O inside `async def`.

## Testing with pytest

- Plain functions and `assert`; fixtures for setup; `pytest.mark.parametrize` for tables of cases.
- `tmp_path` for files, `monkeypatch` for environment, a frozen clock (`time-machine` or `freezegun`) for time.
- Factories for test data; avoid sprawling shared fixtures.

## Security

- `subprocess.run([...], check=True)` with argument lists; never `shell=True` with user input.
- `yaml.safe_load`, never `yaml.load` on untrusted data; never unpickle untrusted data.
- Parameterised SQL (`cursor.execute(sql, params)`).
- `secrets` module for tokens, not `random`.
