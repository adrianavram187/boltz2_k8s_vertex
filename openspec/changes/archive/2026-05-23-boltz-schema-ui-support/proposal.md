## Why

The current UI only supports uploading a single FASTA file for Boltz-2 inference, limiting users to simple sequence inputs. The Boltz model supports a rich YAML-based schema with multiple sequences, inter-chain constraints, structural templates, pocket properties, and affinity binding specifications. Without UI support for these inputs, users cannot leverage Boltz's full capabilities without manually crafting YAML configs.

## What Changes

- Add a YAML config builder UI with form fields for sequences (multiple chains), constraints (bonding/contacts), templates (PDB/CIF references), properties (pockets, ligands), and affinity binding specs
- Add a second submission mode: "Advanced (YAML Schema)" alongside the existing "Quick (FASTA Upload)"
- Build a YAML file from user input in the browser and upload it alongside or in place of the FASTA file
- Extend the backend to accept and pass a YAML config file to the Boltz runner
- Update the Vertex AI pipeline to accept an optional `config_uri` parameter alongside `input_uri`
- Update the Boltz runner to support a `--config <yaml>` flag for complex inputs

## Capabilities

### New Capabilities

- `boltz-yaml-schema-ui`: Frontend form-based UI for building Boltz YAML configs with support for multi-chain sequences, constraints, templates, properties, and affinity binding
- `boltz-yaml-backend`: Backend support for accepting, validating, storing, and forwarding YAML configs to the Boltz inference pipeline

### Modified Capabilities

<!-- None -- no existing specs cover the predict/upload flow yet -->

## Impact

- **Frontend**: `ui/src/pages/Home.tsx` — new mode toggle (FASTA/YAML), YAML form fields, YAML builder logic
- **Backend**: `fastapi-app/main.py` — extended `PredictionRequest` with optional `config_yaml` field, new `/api/upload-yaml` or extended `/api/upload` endpoint, YAML validation
- **Dependencies**: `pyyaml` added to `fastapi-app/requirements.txt`
- **Pipeline**: `boltz/pipeline.py` and `boltz_pipeline.yaml` — new `config_uri` pipeline parameter
- **Runner**: `boltz/run.sh` — support for `--config` flag when a YAML config is provided
