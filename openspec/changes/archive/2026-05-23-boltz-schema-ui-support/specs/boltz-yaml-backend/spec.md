## ADDED Requirements

### Requirement: Accept and store YAML config files

The backend SHALL accept YAML config file uploads and store them to Google Cloud Storage alongside existing FASTA inputs.

#### Scenario: Uploading a YAML config file

- **WHEN** the backend receives a YAML file via the file upload endpoint
- **THEN** it SHALL store the file to GCS under the same upload path prefix (`uploads/{uuid}/`)
- **AND** return the relative file path in the response

#### Scenario: Rejecting invalid YAML

- **WHEN** the backend receives a file that is not valid YAML
- **THEN** it SHALL return a 400 Bad Request with a descriptive error message

### Requirement: Extended prediction request with config file

The prediction request model SHALL include an optional `config_file` field to reference a YAML configuration.

#### Scenario: Submitting a prediction with a YAML config

- **WHEN** the `POST /api/predict-vertex` endpoint receives a request with `config_file` set
- **THEN** the backend SHALL construct a `config_uri` pointing to the YAML file in GCS
- **AND** pass `config_uri` as a parameter to the Vertex AI pipeline

#### Scenario: Submitting a prediction without a YAML config

- **WHEN** the `POST /api/predict-vertex` endpoint receives a request without `config_file`
- **THEN** the backend SHALL submit the pipeline without a `config_uri` parameter
- **AND** the existing FASTA-only behavior SHALL be preserved

### Requirement: Pipeline config_uri parameter

The Vertex AI pipeline definition SHALL accept an optional `config_uri` string parameter.

#### Scenario: Pipeline receives config_uri

- **WHEN** a pipeline run is created with a non-empty `config_uri` parameter
- **THEN** the runner SHALL download the YAML config from GCS
- **AND** pass it to `boltz predict` via the `--config` flag

#### Scenario: Pipeline runs without config_uri

- **WHEN** a pipeline run is created with an empty or absent `config_uri` parameter
- **THEN** the runner SHALL execute `boltz predict` without the `--config` flag
- **AND** the existing single-FASTA inference behavior SHALL be preserved

### Requirement: Runner config support

The Boltz runner script SHALL conditionally support a `--config` argument for complex YAML-based inputs.

#### Scenario: Runner receives a config path

- **WHEN** the runner downloads a YAML config file from the provided `config_uri`
- **THEN** it SHALL invoke `boltz predict <input> --config <config_path> --use_msa_server --out_dir <output>`

#### Scenario: Runner does not receive a config path

- **WHEN** `config_uri` is empty
- **THEN** the runner SHALL invoke `boltz predict <input> --use_msa_server --out_dir <output>` with no `--config` flag
