# job-pagination

## Purpose

Enable users to navigate through their full job history via cursor-based pagination. The `GET /api/jobs` endpoint supports `page_size` and `page_token` query parameters, returns pagination metadata, and the frontend provides Prev/Next navigation controls that preserve page state across polling.

## Requirements

### Requirement: Paginated job listing API

The `GET /api/jobs` endpoint SHALL support cursor-based pagination via `page_size` and `page_token` query parameters.

#### Scenario: Default request returns first page

- **WHEN** a client sends `GET /api/jobs` without any pagination parameters
- **THEN** the response SHALL return up to 10 jobs (default page_size), a `next_page_token` string if more results exist, `has_more: true` if additional pages are available, and `total_count` as an integer (or `null` if unavailable)

#### Scenario: Request with explicit page_size

- **WHEN** a client sends `GET /api/jobs?page_size=5`
- **THEN** the response SHALL return up to 5 jobs and appropriate pagination metadata

#### Scenario: Request with page_token for next page

- **WHEN** a client sends `GET /api/jobs?page_token=<valid_token>`
- **THEN** the response SHALL return the next page of jobs as determined by the cursor, with a `next_page_token` for the subsequent page if more results exist

#### Scenario: Last page has no next_page_token

- **WHEN** a client requests the final page of results
- **THEN** the response SHALL include `next_page_token: null` and `has_more: false`

#### Scenario: Invalid page_token returns error

- **WHEN** a client sends `GET /api/jobs?page_token=<invalid_or_expired_token>`
- **THEN** the API SHALL return a 400 Bad Request with a descriptive error message

#### Scenario: page_size capped at maximum

- **WHEN** a client requests `GET /api/jobs?page_size=100`
- **THEN** the API SHALL cap the page size to 50 and return at most 50 results

### Requirement: Paginated response format

The API response SHALL include pagination metadata alongside the jobs array.

#### Scenario: Response includes pagination metadata

- **WHEN** any valid `GET /api/jobs` request is made
- **THEN** the response JSON SHALL contain the keys `jobs` (array), `next_page_token` (string or null), `has_more` (boolean), and `total_count` (integer or null)

### Requirement: Frontend pagination controls

The jobs table in the UI SHALL display pagination controls allowing navigation between pages.

#### Scenario: Pagination buttons rendered below table

- **WHEN** jobs are displayed in the table
- **THEN** Prev and Next buttons SHALL be rendered below the table, along with page indicator text (e.g., "Page 1")

#### Scenario: Prev button disabled on first page

- **WHEN** the user is viewing the first page of results
- **THEN** the Prev button SHALL be disabled (greyed out, not clickable)

#### Scenario: Next button disabled on last page

- **WHEN** the user is viewing the last page of results (has_more is false)
- **THEN** the Next button SHALL be disabled

#### Scenario: Navigating between pages

- **WHEN** the user clicks the Next button
- **THEN** the table SHALL fetch and display the next page of jobs using the `next_page_token`, and the UI SHALL update the page indicator

### Requirement: Polling preserves pagination state

The frontend's periodic polling SHALL preserve the current page and page_size across refreshes.

#### Scenario: Polling on a non-first page

- **WHEN** a 10-second polling interval triggers while the user is on page 2 with page_size 10
- **THEN** the fetch SHALL use the same `page_size` and `page_token` that loaded the current page, refreshing statuses without resetting to page 1

#### Scenario: Manual refresh resets to first page

- **WHEN** the user clicks the manual Refresh button
- **THEN** the fetch SHALL reset to page 1 (no page_token) while preserving any custom page_size
