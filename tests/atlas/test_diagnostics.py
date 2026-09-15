from __future__ import annotations

from scripts import atlas_diagnose


def test_presence_does_not_print_secret(monkeypatch, capsys) -> None:
    secret = "secret-value-that-must-not-appear"
    monkeypatch.setenv("GROQ_API_KEY", secret)
    atlas_diagnose._print_presence()
    output = capsys.readouterr().out
    assert "credential.GROQ_API_KEY=set" in output
    assert secret not in output


def test_placeholder_is_reported_as_placeholder(monkeypatch, capsys) -> None:
    # Hermetic: the canonical alias must not leak in from the ambient environment.
    monkeypatch.delenv("ATLAS_GOOGLE_REFRESH_TOKEN", raising=False)
    monkeypatch.setenv("GOOGLE_REFRESH_TOKEN", "your_refresh_token")
    atlas_diagnose._print_presence()
    output = capsys.readouterr().out
    # Security rule 4: presence is reported as set|missing|placeholder only.
    assert "credential.GOOGLE_REFRESH_TOKEN=placeholder" in output
    assert "your_refresh_token" not in output


def test_missing_is_reported_as_missing(monkeypatch, capsys) -> None:
    for name in ("GOOGLE_REFRESH_TOKEN", "ATLAS_GOOGLE_REFRESH_TOKEN"):
        monkeypatch.delenv(name, raising=False)
    atlas_diagnose._print_presence()
    output = capsys.readouterr().out
    assert "credential.GOOGLE_REFRESH_TOKEN=missing" in output


def test_health_reports_status_without_values(monkeypatch, capsys) -> None:
    monkeypatch.delenv("SERPAPI_API_KEY", raising=False)
    monkeypatch.delenv("ATLAS_SERPAPI_API_KEY", raising=False)
    result = __import__("asyncio").run(atlas_diagnose._health(["serpapi"]))
    output = capsys.readouterr().out
    assert result == 1
    assert "connector.serpapi=not_configured" in output
    assert "api_key" not in output.lower()
