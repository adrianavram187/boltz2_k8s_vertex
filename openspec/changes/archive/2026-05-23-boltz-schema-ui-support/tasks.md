## 1. Pipeline & Runner — Foundation

- [x] 1.1 Add optional `config_uri` string parameter to `boltz/pipeline.py` with default `""` and recompile `boltz_pipeline.yaml`
- [x] 1.2 Update `boltz/run.sh` to accept `config_uri` as a third argument, download the YAML config from GCS if non-empty, and append `--config <path>` to the boltz predict command
- [x] 1.3 Rebuild and push the Boltz runner Docker image with the updated `run.sh`
- [x] 1.4 Copy the recompiled `boltz_pipeline.yaml` into `fastapi-app/` directory

## 2. Backend — API Changes

- [x] 2.1 Add `pyyaml` to `fastapi-app/requirements.txt`
- [x] 2.2 Extend `PredictionRequest` model with optional `config_file: str | None = None` field
- [x] 2.3 Add YAML validation to the upload endpoint: parse uploaded file as YAML, return 400 if invalid
- [x] 2.4 Update `predict-vertex` endpoint to construct `config_uri` from `config_file` and pass it to the pipeline job submission

## 3. Frontend — Mode Toggle

- [x] 3.1 Add submission mode state (`"fasta" | "yaml"`) with a segmented toggle control in the Submit Job card header
- [x] 3.2 Wrap existing FASTA upload UI in a conditional that renders only when mode is `"fasta"`
- [x] 3.3 Add mode label and description below the toggle explaining the difference between Quick and Advanced modes

## 4. Frontend — YAML Config Builder Form

- [x] 4.1 Create a `YamlConfigForm` component with sections for Sequences, Constraints, Templates, and Properties
- [x] 4.2 Implement chain management: "Add Chain" button, chain label input, sequence textarea, remove chain button (min 1 chain)
- [x] 4.3 Implement constraint fields: residue pair selectors (chain + residue index), constraint type dropdown
- [x] 4.4 Implement properties fields: pocket residues, ligand SMILES input, covalent bond specifications
- [x] 4.5 Add collapsible sections for Constraints and Properties, collapsed by default

## 5. Frontend — YAML Generation & Submission

- [x] 5.1 Implement `buildYamlConfig()` function that assembles form state into a valid Boltz-compatible YAML string
- [x] 5.2 Update the submit handler for Advanced mode to upload the YAML config as a file to the backend, then pass the returned filename in `config_file` on the predict request
- [x] 5.3 Show a YAML preview (read-only `<pre>` block) before submission so users can review the generated config
- [x] 5.4 Handle errors: display validation errors from YAML generation, upload failures, and predict failures

## 6. Integration & Polish

- [x] 6.1 Verify the existing Quick (FASTA) flow still works end-to-end with no regressions
- [x] 6.2 Verify the Advanced (YAML) flow works end-to-end: form → YAML generation → upload → predict → pipeline runs with config
- [x] 6.3 Ensure the Submit button is disabled appropriately when required fields are empty in both modes
