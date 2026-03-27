"""Abstract base for object/link stores."""

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

from ontology.types import LinkInstance, ObjectInstance


class BaseStore(ABC):
    """Interface that all store backends must implement."""

    # ── Load ────────────────────────────────────────────────────────────────

    @abstractmethod
    def load_seed(self, path: Path) -> None: ...

    # ── Write ───────────────────────────────────────────────────────────────

    @abstractmethod
    def add_object(self, obj: ObjectInstance) -> None: ...

    @abstractmethod
    def add_link(self, link: LinkInstance) -> None: ...

    @abstractmethod
    def add_objects_bulk(
        self,
        objects: list[ObjectInstance],
        links: list[LinkInstance],
    ) -> dict[str, int]: ...

    @abstractmethod
    def add_source(self, source: dict[str, Any]) -> None: ...

    @abstractmethod
    def delete_source(self, source_id: str) -> dict[str, int]: ...

    # ── Read ────────────────────────────────────────────────────────────────

    @abstractmethod
    def list_objects(self, type_filter: str | None = None) -> list[ObjectInstance]: ...

    @abstractmethod
    def get_object(self, rid: str) -> ObjectInstance | None: ...

    @abstractmethod
    def list_links(self, link_type: str | None = None) -> list[LinkInstance]: ...

    @abstractmethod
    def get_links_for(self, rid: str) -> list[LinkInstance]: ...

    @abstractmethod
    def list_sources(self) -> list[dict[str, Any]]: ...

    # ── Graph ───────────────────────────────────────────────────────────────

    @abstractmethod
    def get_graph(
        self,
        type_filters: list[str] | None = None,
    ) -> dict[str, Any]: ...

    @abstractmethod
    def get_neighbors(self, rid: str) -> dict[str, Any]: ...

    # ── Search ──────────────────────────────────────────────────────────────

    @abstractmethod
    def search(
        self,
        query: str,
        type_filter: str | None = None,
    ) -> list[ObjectInstance]: ...
