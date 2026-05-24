## Why

The jobs list endpoint (`GET /api/jobs`) has a hardcoded limit of 20 results with no way to navigate beyond that window. As users accumulate more jobs over time, they lose visibility into older jobs and cannot browse their job history. Adding pagination makes the full job history accessible and reduces unnecessary data transfer from the Vertex AI API.

## What Changes

- Add cursor-based pagination to `GET /api/jobs` with `page_size` and `page_token` query parameters
- Return pagination metadata (`next_page_token`, `has_more`, `total_count`) in the API response
- Add pagination controls (Prev / Next buttons with page info) to the frontend jobs table
- Adjust the frontend polling to preserve current page state across refreshes

## Capabilities

### New Capabilities

- `job-pagination`: Cursor-based pagination for the `/api/jobs` endpoint, including query parameters, response metadata, and frontend pagination UI

### Modified Capabilities

<!-- None -- no existing specs to modify -->

## Impact

- **Backend**: `fastapi-app/main.py` — `list_jobs()` endpoint gains query parameters and restructured response
- **Frontend**: `ui/src/pages/Home.tsx` — jobs table gains pagination controls and updated data fetching logic
- **API contract**: Response shape changes from `{ jobs: [...] }` to `{ jobs: [...], next_page_token: string | null, has_more: bool, total_count: int }` (backward-compatible addition of metadata fields)
