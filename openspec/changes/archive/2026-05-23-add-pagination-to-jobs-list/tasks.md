## 1. Backend — Paginated API endpoint

- [x] 1.1 Add `page_size` (int, default 10, max 50) and `page_token` (optional str) query parameters to `GET /api/jobs` in `fastapi-app/main.py`
- [x] 1.2 Pass `page_size` and `page_token` to `aiplatform.PipelineJob.list()` call alongside existing `order_by`
- [x] 1.3 Capture `next_page_token` from the Vertex AI list response to include in API output
- [x] 1.4 Remove hardcoded `len(job_list) >= 20` break — pagination now controls result size
- [x] 1.5 Restructure response body to `{ jobs: [...], next_page_token: str | null, has_more: bool, total_count: int | null }`
- [x] 1.6 Add input validation: return 400 for `page_size < 1`, cap `page_size` at 50, return 400 for malformed `page_token` (catch SDK errors and return 400)

## 2. Frontend — Data fetching & state

- [x] 2.1 Add pagination state to `Home.tsx`: `pageSize` (default 10), `currentPageToken` (string | null), `pageTokenStack` (array of page tokens for Prev navigation), `hasMore` (bool)
- [x] 2.2 Update `fetchJobs` to include `page_size` and `page_token` as query params when calling `GET /api/jobs`
- [x] 2.3 Parse pagination metadata from the response (`next_page_token`, `has_more`, `total_count`) and update state
- [x] 2.4 Update polling `useEffect` to pass `pageSize` and `currentPageToken` to `fetchJobs`, preserving current page

## 3. Frontend — Pagination UI controls

- [x] 3.1 Add Prev / Next buttons below the jobs table, using Lucide `ChevronLeft` and `ChevronRight` icons
- [x] 3.2 Disable Prev button when `pageTokenStack` is empty (first page); disable Next button when `hasMore` is false
- [x] 3.3 Add page indicator text between buttons (e.g., "Page 1")
- [x] 3.4 Implement Next click: push `currentPageToken` onto `pageTokenStack`, set `currentPageToken` to `next_page_token` from response, increment local page counter
- [x] 3.5 Implement Prev click: pop last token from `pageTokenStack`, set it as `currentPageToken`, decrement local page counter
- [x] 3.6 Hide pagination controls when there are 0 jobs (e.g., "No jobs found" state)

## 4. Polish

- [x] 4.1 Make manual Refresh button (already exists) reset to page 1 by clearing `currentPageToken` and `pageTokenStack`
- [x] 4.2 Verify manual Refresh preserves user's `pageSize` preference even when resetting to page 1
- [x] 4.3 Verify that the empty state ("No jobs found") still works correctly with the new response format
