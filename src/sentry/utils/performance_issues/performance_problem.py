from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Self

from sentry.issues.grouptype import GroupType, get_group_type_by_type_id
from sentry.issues.issue_occurrence import IssueEvidence


@dataclass
class PerformanceProblem:
    fingerprint: str
    op: str
    desc: str
    type: type[GroupType]
    parent_span_ids: Sequence[str] | None
    # For related spans that caused the bad spans
    cause_span_ids: Sequence[str] | None
    # The actual bad spans
    offender_span_ids: Sequence[str]
    # Evidence to be used for the group
    # TODO: make evidence_data and evidence_display required once all detectors have been migrated to platform
    # We can't make it required until we stop loading these from nodestore via EventPerformanceProblem,
    # since there's legacy data in there that won't have these fields.
    # So until we disable transaction based perf issues we'll need to keep this optional.
    evidence_data: dict[str, Any] | None
    # User-friendly evidence to be displayed directly
    evidence_display: Sequence[IssueEvidence]

    def to_dict(
        self,
    ) -> Mapping[str, Any]:
        return {
            "fingerprint": self.fingerprint,
            "op": self.op,
            "desc": self.desc,
            "type": self.type.type_id,
            "parent_span_ids": self.parent_span_ids,
            "cause_span_ids": self.cause_span_ids,
            "offender_span_ids": self.offender_span_ids,
            "evidence_data": self.evidence_data,
            "evidence_display": [evidence.to_dict() for evidence in self.evidence_display],
        }

    @property
    def title(self) -> str:
        return self.type.description

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Self:
        return cls(
            data["fingerprint"],
            data["op"],
            data["desc"],
            get_group_type_by_type_id(data["type"]),
            data["parent_span_ids"],
            data["cause_span_ids"],
            data["offender_span_ids"],
            data.get("evidence_data", {}),
            [
                IssueEvidence(evidence["name"], evidence["value"], evidence["important"])
                for evidence in data.get("evidence_display", [])
            ],
        )

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, PerformanceProblem):
            return NotImplemented
        return (
            self.fingerprint == other.fingerprint
            and self.offender_span_ids == other.offender_span_ids
            and self.type == other.type
        )

    def __hash__(self) -> int:
        # This will de-duplicate on fingerprint and type and only for offending span ids.
        # Fingerprint should incorporate the 'uniqueness' enough that parent and span checks etc. are not required.
        return hash((self.fingerprint, frozenset(self.offender_span_ids), self.type))
