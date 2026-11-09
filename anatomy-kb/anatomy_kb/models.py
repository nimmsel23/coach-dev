"""
Leichtgewichtige Dataclasses für Exercise-Daten.

Kein striktes Schema-Enforcement — die YAMLs sind der Source of Truth.
Die Dataclasses bieten typisierte Zugriffspunkte für häufig genutzte Felder.
Unbekannte Felder werden in `raw` gespeichert, damit keine Daten verloren gehen.
"""

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class MuscleRoles:
    primary: list[str] = field(default_factory=list)
    secondary: list[str] = field(default_factory=list)
    stabilizers: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, d: Optional[dict]) -> "MuscleRoles":
        if not d:
            return cls()
        return cls(
            primary=cls._flatten(d.get("primary")),
            secondary=cls._flatten(d.get("secondary")),
            stabilizers=cls._flatten(d.get("stabilizers")),
        )

    @staticmethod
    def _flatten(value) -> list[str]:
        """Liste oder Dict (z.B. {front_leg: [...], back_leg: [...]}) → flache Liste."""
        if not value:
            return []
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            result = []
            for v in value.values():
                if isinstance(v, list):
                    result.extend(v)
                elif isinstance(v, str):
                    result.append(v)
            return result
        return []


@dataclass
class Exercise:
    exercise_id: str
    name: str
    category: str
    movement_pattern: str
    equipment: str
    simple_explanation: str
    detailed_explanation: str
    muscle_roles: MuscleRoles
    feel_cues: list[str]
    # Alle weiteren Felder (joint_actions, common_errors, quiz_prompts, ...) ungefiltert
    raw: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict) -> "Exercise":
        return cls(
            exercise_id=data.get("exercise_id", ""),
            name=data.get("name", ""),
            category=data.get("category", ""),
            movement_pattern=data.get("movement_pattern", ""),
            equipment=data.get("equipment", ""),
            simple_explanation=data.get("simple_explanation", ""),
            detailed_explanation=data.get("detailed_explanation", ""),
            muscle_roles=MuscleRoles.from_dict(data.get("muscle_roles")),
            feel_cues=data.get("feel_cues") or [],
            raw=data,
        )

    def to_summary(self) -> dict:
        """Kompakte Darstellung für Listen-Endpoints."""
        return {
            "exercise_id": self.exercise_id,
            "name": self.name,
            "category": self.category,
            "movement_pattern": self.movement_pattern,
            "equipment": self.equipment,
            "primary_muscles": self.muscle_roles.primary,
        }

    def to_full(self) -> dict:
        """Vollständige Darstellung inkl. aller YAML-Felder."""
        return self.raw
