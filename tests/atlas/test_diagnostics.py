from __future__ import annotations

from scripts import atlas_diagnose


def test_presence_does_not_print_secret(monkeypatch, capsys) -> None:
    secret = "secret-value-that-must-not-appear"
    monkeypatch.setenv("GROQ_API_KEY", secret)
    atlas_diagnose._print_presence()
    output = capsys.readouterr().out
    assert "credential.GROQ_API_KEY=set" in output
    assert secret not in output


def test_placeholder_is_not_treated_as_configured(monkeypatch, capsys) -> None:
    monkeypatch.setenv("GOOGLE_REFRESH_TOKEN", "your_refresh_token")
    atlas_diagnose._print_presence()
    output = capsys.readouterr().out
    assert "credential.GOOGLE_REFRESH_TOKEN=missing_or_placeholder" in output


def test_health_reports_status_without_values(monkeypatch, capsys) -> None:
    monkeypatch.delenv("SERPAPI_API_KEY", raising=False)
    monkeypatch.delenv("ATLAS_SERPAPI_API_KEY", raising=False)
    result = __import__("asyncio").run(atlas_diagnose._health(["serpapi"]))
    output = capsys.readouterr().out
    assert result == 1
    assert "connector.serpapi=not_configured" in output
    assert "api_key" not in output.lower()
