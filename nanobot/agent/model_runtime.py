"""Immutable runtime selection and model-preset resolution for one agent loop."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import replace

from nanobot.agent.model_presets import (
    PresetCatalogLoader,
    PresetSnapshotLoader,
    build_runtime_preset_snapshot,
    normalize_preset_name,
)
from nanobot.config.schema import ModelPresetConfig
from nanobot.providers.factory import ProviderSnapshot
from nanobot.utils.llm_runtime import LLMRuntime, runtime_from_provider_snapshot


class ModelRuntimeResolver:
    """Resolve immutable runtimes while keeping provider config reloadable.

    The resolver owns the default selection for future turns. A selected preset is
    retained until explicitly changed or a refresh discovers that the active preset
    now has the same runtime as the new default. Session-specific callers use
    ``resolve_preset`` without changing the default selection.
    """

    def __init__(
        self,
        runtime: LLMRuntime,
        *,
        model_presets: Mapping[str, ModelPresetConfig] | None = None,
        preset_catalog_loader: PresetCatalogLoader | None = None,
        configured_default_preset: str | None = None,
        provider_snapshot_loader: Callable[[], ProviderSnapshot] | None = None,
        preset_snapshot_loader: PresetSnapshotLoader | None = None,
    ) -> None:
        self.runtime = runtime
        self._model_presets = self._copy_presets(model_presets or {})
        self._preset_catalog_loader = preset_catalog_loader
        self._configured_default_preset = configured_default_preset
        self._provider_snapshot_loader = provider_snapshot_loader
        self._preset_snapshot_loader = preset_snapshot_loader
        self._invalidated = False
        self._selected_preset: str | None = None
        self._resolved_presets: dict[str, LLMRuntime] = {}

    @staticmethod
    def _copy_presets(
        presets: Mapping[str, ModelPresetConfig],
    ) -> dict[str, ModelPresetConfig]:
        return {
            str(name): preset.model_copy(deep=True)
            for name, preset in presets.items()
        }

    @property
    def model_presets(self) -> Mapping[str, ModelPresetConfig]:
        """Return a deep-copied read-only mapping of configured presets."""
        from types import MappingProxyType

        return MappingProxyType(self._copy_presets(self._model_presets))

    @property
    def model_preset(self) -> str | None:
        return self._selected_preset

    def current(self, *, refresh: bool = False) -> LLMRuntime:
        if refresh:
            self.invalidate()
            return self.admit()
        return self.runtime

    def invalidate(self) -> None:
        self._invalidated = True
        self._resolved_presets.clear()

    def _load_default(self) -> LLMRuntime:
        if self._provider_snapshot_loader is not None:
            return runtime_from_provider_snapshot(self._provider_snapshot_loader())
        # No loader means the provider object is still the authoritative local
        # source; capture it to pick up changed generation settings.
        return LLMRuntime.capture(
            self.runtime.provider,
            self.runtime.model,
            context_window_tokens=self.runtime.context_window_tokens,
            snapshot_signature=self.runtime.snapshot_signature,
        )

    def _load_catalog(self) -> None:
        if self._preset_catalog_loader is not None:
            self._model_presets = self._copy_presets(self._preset_catalog_loader())

    def admit(self) -> LLMRuntime:
        """Return the runtime for the next turn, reloading only when invalidated."""
        if not self._invalidated:
            if self._selected_preset is None and self._provider_snapshot_loader is None:
                refreshed = self._load_default()
                if refreshed.generation != self.runtime.generation:
                    self.runtime = refreshed
            return self.runtime
        self._load_catalog()
        default_runtime = self._load_default()
        if self._selected_preset is None:
            self.runtime = default_runtime
        else:
            # Preserve an active preset across a config refresh when it still
            # exists; otherwise fall back to the newly loaded default.
            if self._selected_preset in self._model_presets:
                selected = self._resolve_preset_runtime(self._selected_preset)
                if selected.snapshot_signature != default_runtime.snapshot_signature:
                    self.runtime = selected
                else:
                    self._selected_preset = None
                    self.runtime = replace(default_runtime, model_preset=None)
            else:
                self._selected_preset = None
                self.runtime = default_runtime
        self._invalidated = False
        return self.runtime

    def _resolve_preset_runtime(self, name: str) -> LLMRuntime:
        cached = self._resolved_presets.get(name)
        if cached is not None:
            return cached
        preset = self._model_presets[name]
        snapshot = build_runtime_preset_snapshot(
            name=name,
            presets=self._model_presets,
            provider=self.runtime.provider,
            loader=self._preset_snapshot_loader,
        )
        # A custom loader may omit generation; static presets still have it.
        if snapshot.generation is None:
            snapshot = ProviderSnapshot(
                provider=snapshot.provider,
                model=snapshot.model,
                context_window_tokens=snapshot.context_window_tokens,
                signature=snapshot.signature,
                generation=preset.to_generation_settings(),
                model_preset=name,
            )
        runtime = runtime_from_provider_snapshot(snapshot)
        self._resolved_presets[name] = runtime
        return runtime

    def resolve_preset(self, name: str) -> LLMRuntime:
        canonical = normalize_preset_name(name, self._model_presets)
        return self._resolve_preset_runtime(canonical)

    def select_preset(self, name: str | None) -> LLMRuntime:
        if name is None:
            self._selected_preset = None
            self.runtime = self._load_default()
            return self.runtime
        canonical = normalize_preset_name(name, self._model_presets)
        selected = self._resolve_preset_runtime(canonical)
        self._selected_preset = canonical
        self.runtime = selected
        return selected

    def select_model(self, model: str) -> LLMRuntime:
        if not isinstance(model, str) or not model.strip():
            raise ValueError("model must be a non-empty string")
        self._selected_preset = None
        self.runtime = replace(self.runtime, model=model.strip(), model_preset=None)
        return self.runtime

    def select_context_window(self, context_window_tokens: int) -> LLMRuntime:
        if context_window_tokens < 1:
            raise ValueError("context_window_tokens must be positive")
        self.runtime = replace(self.runtime, context_window_tokens=context_window_tokens)
        return self.runtime

    def resolve_override(
        self,
        *,
        model: str | None,
        model_preset: str | None,
    ) -> LLMRuntime | None:
        if model_preset is not None:
            return self.resolve_preset(model_preset)
        if model is None:
            return None
        return replace(self.runtime, model=model, model_preset=None)

    def adopt_snapshot(self, snapshot: ProviderSnapshot) -> LLMRuntime:
        self._selected_preset = snapshot.model_preset
        self.runtime = runtime_from_provider_snapshot(snapshot)
        self._invalidated = False
        return self.runtime

    def refresh(self) -> LLMRuntime | None:
        self.invalidate()
        previous_preset = self._selected_preset
        runtime = self.admit()
        if previous_preset is not None and self._selected_preset == previous_preset:
            return None
        return runtime


__all__ = ["ModelRuntimeResolver"]
