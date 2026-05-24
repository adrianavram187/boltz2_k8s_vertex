# boltz-yaml-schema-ui

## Purpose

Provide a dual-mode submission UI for the Boltz prediction platform, allowing users to switch between a simple "Quick (FASTA)" mode and an "Advanced (YAML Schema)" mode. The Advanced mode includes a structured YAML config builder form that generates and uploads valid YAML configurations to the backend.

## Requirements

### Requirement: Dual submission mode toggle

The Submit Job card SHALL provide a mode selector switching between "Quick (FASTA)" and "Advanced (YAML Schema)" submission modes.

#### Scenario: Default mode is Quick

- **WHEN** the page loads
- **THEN** the Quick (FASTA) mode SHALL be selected by default, displaying the existing FASTA file upload UI

#### Scenario: Switching to Advanced mode

- **WHEN** the user selects "Advanced (YAML Schema)" mode
- **THEN** the FASTA upload UI SHALL be replaced with the YAML config builder form
- **AND** the mode SHALL persist across page interactions within the same session

#### Scenario: Switching back to Quick mode

- **WHEN** the user switches back to "Quick (FASTA)" mode from Advanced mode
- **THEN** the YAML form SHALL be hidden and the FASTA upload UI SHALL reappear
- **AND** any incomplete YAML form state SHALL be preserved if the user switches back

### Requirement: YAML config builder form

The YAML config builder SHALL provide structured form fields covering the Boltz schema capabilities: sequences, constraints, templates, properties, and affinity binding.

#### Scenario: Building multi-chain sequence input

- **WHEN** the user is in Advanced mode
- **THEN** the form SHALL include an "Add Chain" button that appends a new sequence input field
- **AND** each chain field SHALL accept a protein sequence string and an optional chain label

#### Scenario: Adding inter-chain constraints

- **WHEN** the user has at least two chains defined
- **THEN** the form SHALL allow adding contacts constraints between specific residue pairs across chains

#### Scenario: Setting molecular properties

- **WHEN** the user expands the Properties section
- **THEN** the form SHALL expose fields for pocket residues, ligand SMILES strings, and covalent bond specifications

#### Scenario: Generating YAML from form input

- **WHEN** the user clicks "Submit" in Advanced mode
- **THEN** the browser SHALL assemble a valid YAML string from all populated form fields
- **AND** the YAML SHALL be uploaded to the backend as part of the submission flow

### Requirement: YAML upload and submission flow

The frontend SHALL upload the generated YAML config to the backend and include the resulting file reference in the prediction request.

#### Scenario: Submitting a YAML config job

- **WHEN** the user submits in Advanced mode with a populated YAML config
- **THEN** the frontend SHALL first upload the YAML config to the backend via the upload endpoint
- **AND** then submit the prediction request with the returned config file reference alongside any FASTA input reference

#### Scenario: Error on YAML generation failure

- **WHEN** the YAML builder produces invalid YAML or the upload fails
- **THEN** the frontend SHALL display an error message and prevent submission
