"""Die Nachricht, die der Coach schickt: Prüfung und FCM-Data-Payload."""
from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass
from urllib.parse import urlparse

TITLE_MAX = 65     # alles darüber wird auf Sperrbildschirmen abgeschnitten
BODY_MAX = 300

# Links dürfen nur in die eigenen Apps führen (kein Phishing-Weg über den Coach-Account)
DEFAULT_HOSTS = ("fitness-aos.web.app", "vos-coach.web.app", "vitalos.web.app")


class MessageError(ValueError):
    """Nachricht unvollständig oder unzulässig — Text ist für die Anzeige gedacht."""


def allowed_hosts() -> tuple[str, ...]:
    extra = tuple(h.strip() for h in os.environ.get("FITNESS_PUSH_HOSTS", "").split(",") if h.strip())
    return DEFAULT_HOSTS + extra


@dataclass(frozen=True)
class Message:
    title: str
    body: str
    link: str = "/"

    def problems(self) -> list[str]:
        out: list[str] = []
        if not self.title.strip():
            out.append("Titel fehlt")
        elif len(self.title.strip()) > TITLE_MAX:
            out.append(f"Titel zu lang ({len(self.title.strip())}/{TITLE_MAX})")
        if not self.body.strip():
            out.append("Text fehlt")
        elif len(self.body.strip()) > BODY_MAX:
            out.append(f"Text zu lang ({len(self.body.strip())}/{BODY_MAX})")
        out.extend(link_problems(self.link))
        return out

    def validate(self) -> "Message":
        problems = self.problems()
        if problems:
            raise MessageError("; ".join(problems))
        return Message(self.title.strip(), self.body.strip(), normalize_link(self.link))


def normalize_link(link: str) -> str:
    link = (link or "").strip()
    return link or "/"


def link_problems(link: str) -> list[str]:
    link = normalize_link(link)
    if re.search(r"[\s\x00-\x1f]", link):
        return ["Link enthält Leer- oder Steuerzeichen"]
    if link.startswith("/"):
        return ["Link darf nicht mit // beginnen"] if link.startswith("//") else []
    parsed = urlparse(link)
    if parsed.scheme != "https":
        return ["Link muss mit / beginnen oder https:// sein"]
    if parsed.hostname not in allowed_hosts():
        return [f"Host nicht erlaubt: {parsed.hostname} (erlaubt: {', '.join(allowed_hosts())})"]
    return []


def build_data(message: Message, now: float | None = None) -> dict[str, str]:
    """FCM-Data-Payload. Der Service Worker zeigt title/body/link/tag an; ein eigener Tag
    je Nachricht sorgt dafür, dass mehrere Nachrichten nacheinander sichtbar bleiben."""
    message = message.validate()
    stamp = int((now if now is not None else time.time()) * 1000)
    return {
        "type": "coachMessage",
        "title": message.title,
        "body": message.body,
        "link": message.link,
        "tag": f"coach-message-{stamp}",
    }
