---
'@glissade/core': patch
---

The signal-notification ticker now isolates a throwing subscriber: one subscriber that throws no longer starves the other subscribers coalesced into the same flush. Errors are collected and rethrown (as an `AggregateError` if more than one) after the queue fully drains, so every subscriber still fires for the change.
