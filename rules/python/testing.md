---
description: Python testing with pytest — fixtures, parametrize, tmp_path, monkeypatch, frozen time
globs: "**/test_*.py,**/*_test.py,**/conftest.py"
---

# Python testing

- pytest with plain `assert`; one behaviour per test, named `test_<behaviour>`.
- `pytest.mark.parametrize` for tables of cases instead of loops.
- Fixtures for setup, kept small and local; factories for test data.
- `tmp_path` for files, `monkeypatch` for environment variables, a frozen clock for time.
- Mark slow or integration tests so the fast suite stays fast.
