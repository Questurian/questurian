"""What a writer model's transport can and cannot be told to do."""

from app.shared.writer_models import temperature_is_honored
from utils import llm_model_policy


def test_gemini_models_honour_temperature(monkeypatch):
    monkeypatch.setattr(llm_model_policy, "anthropic_models_enabled", lambda: False)
    monkeypatch.setattr(
        llm_model_policy, "claude_subscription_models_enabled", lambda: False
    )

    assert temperature_is_honored("gemini-3.1-pro-preview") is True


def test_a_claude_model_served_by_the_subscription_cli_does_not(monkeypatch):
    """The CLI has no temperature flag, so the creativity control is inert.

    This is the state every current article route is in, which is why the run
    record and the composer have to be able to say so rather than show a dial
    that reaches nothing.
    """
    monkeypatch.setattr(llm_model_policy, "anthropic_models_enabled", lambda: False)
    monkeypatch.setattr(
        llm_model_policy, "claude_subscription_models_enabled", lambda: True
    )

    assert temperature_is_honored("claude-opus-5-high") is False
    # The substitution path is unaffected: a Gemini name is still a Gemini call.
    assert temperature_is_honored("gemini-3.7-flash") is True


def test_the_anthropic_api_path_honours_temperature_again(monkeypatch):
    monkeypatch.setattr(llm_model_policy, "anthropic_models_enabled", lambda: True)
    monkeypatch.setattr(
        llm_model_policy, "claude_subscription_models_enabled", lambda: True
    )

    assert temperature_is_honored("claude-opus-5-high") is True
