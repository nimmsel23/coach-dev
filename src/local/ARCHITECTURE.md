# Local Coach workspace

LocalCoachApp is a separate entry without auth/Firestore imports. It lists the
existing client registry via the local-only API, injects a pure catalog search
and local persistence into the pinned PlanEditor, and owns selection/navigation.
The Python HTTP boundary delegates storage to modules/plan/runtime/local_plans.py.
Released snapshots and working drafts stay separate. Explicit delivery delegates
to Plan's transactional publisher using the existing Coach credential loader.

Plan ansehen opens the shared PlanDocument from the pinned Plan source, separate
from form editing. It shows responsive exercise tables/cards and A4 sheets; long
source notes are disclosures. No plan data changes when opening or printing.
