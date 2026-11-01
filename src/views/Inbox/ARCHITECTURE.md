# Inbox source selection

SourceEditor is shared by InboxCard, the exercise inspector and CatalogBrowser.
It inspects authoritative local data, searches raw wger/yuhonas entries and
replaces/removes one source assignment. Existing link-source worker commands
carry operation=inspect|search|set; no new Firestore rules or browser-to-laptop
HTTP dependency for hosted Coach. API mutations return refreshed exercise data.
Removing a proposal stores explicit no-link; manual alternatives can still be
selected. Existing AI content is flagged for another review.
