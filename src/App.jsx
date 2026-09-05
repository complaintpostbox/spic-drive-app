touch or mouse identically.
   8. NEW — WhatsApp share: buildWhatsAppShareUrl() opens
      wa.me/?text=... (no fixed number — WhatsApp's own contact
      picker handles "who"), prefilled with the location's name,
      saved address, and a tappable Google Maps search link.
      Available to admins (per-row "💬 Share" in Manage Locations)
      and drivers (search-and-share "Quick Share" panel at the top
      of the Route tab) — same helper, same behavior, both places.
   9. NEW — Pre-map route summary: "📊 Calculate Distance & Time"
      calls the free, keyless OSRM public routing server
      (router.project-osrm.org) with the ordered start/stops/end
      and shows a leg-by-leg + total distance/time breakdown
      before "Open Route in Google Maps" is tapped. Two real
      constraints, both surfaced to the user rather than hidden:
        - OSRM does NOT geocode addresses — only points saved as
          "lat,lng" in Manage Locations can be included. A
          location saved as free-text address/name is named
          explicitly in an error rather than silently dropped.
        - The public OSRM demo server has no uptime/rate-limit SLA.
          Fine for internal/moderate use; for guaranteed uptime at
          scale, self-host OSRM or switch to a paid provider (e.g.
          Google Distance Matrix, which also geocodes addresses —
          would replace fetchRouteSummary() and need an API key).
      The summary auto-invalidates (clears) whenever start/end/
      stops change, so it can never describe a route that's since
      been edited.
  10. NEW — Searchable location picker: LocationPicker replaces the
      plain <select> for Start/End/each stop in Route Planner.
      Collapsed, it looks and sizes like a normal field; tapping it
      opens a text search over name + address with a scrollable
      filtered list (max-height 260px) — built for the 40-50+
      location lists this app expects, where scrolling a native
      dropdown to find one entry is painful, especially on mobile.
      No overlay/portal or click-outside listener — it expands
      inline and collapses on selection or Cancel, so there's
      nothing to mis-position on a small screen.
===================================================== */
