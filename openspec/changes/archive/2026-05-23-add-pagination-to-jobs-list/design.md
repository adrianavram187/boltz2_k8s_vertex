## Context

The jobs list endpoint (`GET /api/jobs`) currently fetches all Vertex AI pipeline jobs matching the `vertex-boltz-` prefix and returns up to 20 results with a hardcoded limit. There is no mechanism to page through results. The API is a FastAPI route in `main.py`, and the frontend is a React component in `Home.tsx` that polls the endpoint every 10 seconds.

The current response shape is:
```json
{ "jobs": [...] }
```

There are no existing pagination patterns in the codebase. No database is involved — all job data comes from the Vertex AI Pipeline Job list API via `aiplatform.PipelineJob.list()`.

## Goals / Non-Goals

**Goals:**
- Add cursor-based pagination with `page_size` (upshard default) and `page_token` query parameters to `GET /api/jobs`
- Include pagination metadata (`next_page_token`, `has_more`, `total_count`) in the response
- Add Prev / Next pagination controls to the frontend jobs table
- Preserve pagination state across frontend polling refreshes

**Non-Goals:**
- Page number-based pagination (e.g., `?page=3`). Cursor-based is more robust for dynamic data.
- Infinite scroll
- Server-side filtering or sorting beyond what already exists
- Changing the Vertex AI `order_by="create_time desc"` sort order
- Modifying the `GET /api/status/{job_id}` or `GET /api/jobs/{job_id}/cif` endpoints

## Decisions

### 1. Cursor-based pagination over offset-based

**Rationale:** The Vertex AI `PipelineJob.list()` API returns a natural page token (similar to a cursor). Cursor-based pagination is more stable when new jobs are created between requests — page boundaries don't shift. Offset-based pagination requires either fetching all results and slicing, or hoping the API supports `OFFSET`/`LIMIT` natively, which Vertex AI does not guarantee.

**Alternative considered:** Offset/page-number pagination with `?page=1&page_size=10`. Rejected because:
- Vertex AI's SDK doesn't have a native skip/offset parameter
- Newly created jobs would shift page boundaries, causing duplicate or missed entries

### 2. Keep polling but preserve current page state

**Rationale:** The frontend polls every 10 seconds for real-time status updates. When pagination is introduced, polling should refresh only the current page's worth of jobs (respecting `page_size` and `page_token`) rather than resetting to page 1. This avoids UX disruption where the user is on page 3 and the next poll jumps them back to page 1.

### 3. Leverage Vertex AI SDK's native paging for cursors

**Rationale:** `aiplatform.PipelineJob.list()` supports `page_size` and `page_token` parameters in the underlyingsh API call. We pass these through transparently. The backing CursorOrPaginator fromgoogle-cloud-aiplatform emits native page tokens that can be round-tripped. This avoids implementing custom cursor encoding.

**Alternative considered:** Custom cursor encoding (e.g., base64-encoded timestamp + ID). Rejected because Vertex AI already provides opaque page tokens that are safe to round-trip.

### 4. `total_count` is best-effort

**Rationale:** Vertex AI's list API may not always return an exact total count for filtered or paginated results. The `total_count` field in the response is labelled "approximate" in docs and set to `null` when unavailable. In our implementation, we'll report the count returned by the SDK but document it as approximate.

### 5. `page_size` default of 10

**Rationale:** The current hardcoded limit is 20, which works but produces a dense table. A smaller default (10) keeps the page size manageable and aligns with common pagination conventions. Users can request up to 50 with `page_size`.

## Risks / Trade-offs

- **Vertex AI SDK page token format may change** → Mitigation: Pass tokens through opaquely; never parse or interpret them
- **Polling on a non-first page may miss new jobs** → Mitigation: The "Refresh" button still fetches page 1; polling persists current page. A "Latest" or "First page" indicator can be added if needed
- **`total_count` may be null or inaccurate** → Mitigation: Document as approximate in API response; frontend uses `has_more` for "Next" button enabled/disabled state
