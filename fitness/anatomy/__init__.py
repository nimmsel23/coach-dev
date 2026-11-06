"""Anatomy-facing adapters around the catalog KB.

This package is intentionally thin:
- HTTP/API namespace and enrichment-specific helpers may live here.
- The underlying SSOT for muscles and anatomy teaching remains
  `fitness.catalog.kb.*`.
- Write-capable muscle storage lives in `fitness.catalog.muscles_store`.
"""
