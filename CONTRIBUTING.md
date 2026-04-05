# Contributing to Clip Engine

Thank you for your interest in contributing.

## Development setup

```bash
git clone https://github.com/bintangtimurlangit/clipengine.git
cd clipengine
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

Ensure **ffmpeg** and **ffprobe** are on your `PATH`. For optional Tavily-based planning during `plan` / `run-all`, install **Node.js** so `npx -y tavily-mcp` can run.

## Checks

```bash
ruff check src tests
ruff format src tests --check
pytest
```

## Git identity

Configure your name and email once (or per repository) so commits are attributed correctly:

```bash
git config user.name "Your Name"
git config user.email "you@example.com"
```

## Pull requests

- Keep changes focused on a single concern.
- Match existing style (Ruff line length 100, Python 3.10+).
- Update `CHANGELOG.md` under **Unreleased** when the change is user-visible.

## License

By contributing, you agree that your contributions are licensed under the MIT License.
