## Context

The current submission flow is FASTA-only: user uploads a single `.fasta` file, backend stores it to GCS, and submits a Vertex AI pipeline job with `input_uri` pointing to that file. The Boltz model itself supports far richer inputs — multi-chain sequences, inter-residue constraints, structural templates, molecular properties, and affinity binding targets — typically expressed as a YAML configuration file passed via `--config` to the `boltz predict` CLI.

There is no YAML parsing anywhere in the codebase. No `pyyaml` dependency. The pipeline (`boltz/pipeline.py`) compiles to a YAML with exactly 2 string parameters: `input_uri` and `output_uri`. The runner (`boltz/run.sh`) downloads the input file and runs `boltz predict <input> --use_msa_server --out_dir <output>` with no config awareness.

## Goals / Non-Goals

**Goals:**
- Provide a browser-side YAML config builder that generates a valid Boltz-compatible YAML from structured form inputs
- Support dual submission modes (Quick FASTA / Advanced YAML) with a toggle
- Backend accepts and validates YAML configs, stores them to GCS, and passes `config_uri` to the pipeline
- Pipeline runner uses the YAML config when present via `--config`
- Existing FASTA-only flow continues to work unchanged

**Non-Goals:**
- Server-side YAML rendering or template engine
- YAML editing as a freeform text editor (form-driven only)
- Batch submission of multiple YAML configs
- Modifying the Boltz Docker image to include `pyyaml` (the runner uses shell scripts; config is passed as a file path)
- Changing the `GET /api/jobs` or pagination behavior
- Schema validation beyond basic structural checks (defer deep Boltz schema validation to the runner)

## Decisions

### 1. Form-driven YAML builder in the browser (not a text editor)

**Rationale:** Users are biologists, not YAML authors. A structured form with labeled fields (sequences, constraints, templates, etc.) reduces errors and improves discoverability. The browser assembles valid YAML from field values using a simple template function.

**Alternative considered:** Freeform YAML text area with syntax highlighting. Rejected because it requires users to learn the Boltz YAML schema and is error-prone. Could be added later as a power-user option.

### 2. Dual mode: "Quick" (FASTA) and "Advanced" (YAML Schema)

**Rationale:** The existing FASTA flow is proven and simple. Adding YAML as a toggle rather than replacing it preserves the zero-friction path for single-sequence use cases while exposing the full schema for power users.

**Implementation:** A segmented control (tab-like toggle) at the top of the Submit Job card switches between the current FASTA upload UI and the new YAML form. The underlying submission endpoint is the same (`POST /api/predict-vertex`) with an optional `config_yaml` field.

### 3. YAML uploaded as a GCS blob, not embedded in the API call

**Rationale:** YAML configs can be large (multi-chain, many constraints). Embedding them as a string parameter in the Vertex AI pipeline call would hit size limits and complicate quoting. Storing to GCS and passing a `config_uri` keeps the pipeline interface clean.

**Flow:** Frontend builds YAML string → frontend uploads it via `POST /api/upload-yaml` → backend stores to GCS → backend submits pipeline with `config_uri` pointing to that blob → runner downloads and passes to `boltz predict --config <path>`.

**Alternative considered:** Inline YAML as a pipeline string parameter. Rejected due to Vertex AI parameter size limits and shell escaping issues in the runner.

### 4. Extend `PredictionRequest` with optional `config_file` field

**Rationale:** A new Pydantic model field (`config_file: str | None = None`) is backward-compatible — existing FASTA submissions simply omit it. No new endpoint needed; the existing `/predict-vertex` handles both modes.

### 5. Pipeline adds optional `config_uri` parameter, runner handles conditionally

**Rationale:** The pipeline currently has 2 required string params. Adding `config_uri` as `Optional[str]` with a default of `""` keeps existing pipeline runs working. The runner (`run.sh`) checks if `config_uri` is non-empty and appends `--config <path>` to the boltz command.

### 6. PyYAML for backend validation only

**Rationale:** The backend parses uploaded YAML to validate basic structure (is it valid YAML? does it have the expected top-level keys?). This catches malformed configs early rather than failing silently in the GPU runner. The actual Boltz schema logic lives in the boltz binary itself.

## Risks / Trade-offs

- **Boltz may change its YAML schema** → Mitigation: The form fields map loosely to known Boltz schema concepts; the generated YAML structure is validated by Boltz at runtime. If Boltz changes, update the form template.
- **YAML file size (multi-chain complexes)** → Mitigation: GCS handles arbitrarily large blobs. The form limits the number of chains/constraints to prevent runaway submissions.
- **Runner needs YAML config file locally** → Mitigation: `run.sh` already downloads the input file from GCS; downloading a second tiny YAML blob adds negligible overhead.
- **Two-mode UI adds complexity** → Mitigation: Default to the familiar FASTA mode; YAML mode is opt-in and clearly labeled "Advanced."
