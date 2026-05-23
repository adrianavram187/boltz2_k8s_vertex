# Multi-Model Architecture Plan: Boltz-2, Chai-2, ProteinX (Vertex AI Only)

This document outlines the engineering plan to evolve the High-Performance ML Inference Platform from a hardcoded single-model system (`boltz-2`) into a dynamic, multi-model orchestrator running exclusively on Google Cloud Vertex AI Pipelines (Path A).

## 1. Architectural Strategy: The Model Registry Pattern

We will implement a configuration-driven **Model Registry**. Instead of hardcoding container images, resource limits, and CLI arguments in the FastAPI application, these will be defined in a centralized `models.json` file.

**Goal:** Adding a new model (like `chai-2`) should only require dropping a new `Dockerfile` into the repository and adding one JSON entry, without modifying the core FastAPI logic.

### Proposed `models.json` Structure:
```json
{
  "boltz-2": {
    "display_name": "Boltz 2",
    "description": "High accuracy protein structure prediction.",
    "vertex_pipeline_file": "boltz_pipeline.yaml",
    "supported_extensions": [".fasta", ".yaml"],
    "resources": {
      "cpu": "4",
      "memory": "16G",
      "accelerator": "NVIDIA_L4",
      "accelerator_count": 1
    },
    "default_params": {
      "use_msa_server": true,
      "num_recycles": 3
    }
  },
  "chai-2": {
    "display_name": "Chai 2",
    "description": "Fast folding algorithm optimized for small peptides.",
    "vertex_pipeline_file": "chai_pipeline.yaml",
    "supported_extensions": [".fasta"],
    "resources": {
      "cpu": "8",
      "memory": "32G",
      "accelerator": "NVIDIA_A100",
      "accelerator_count": 1
    },
    "default_params": {
      "ensemble_size": 5
    }
  }
}
```

---

## 2. Managing Variable Model Inputs & Configuration

Different models require vastly different configuration options. Boltz-2 might use `--use_msa_server` while Chai-2 might use `--ensemble_size=5`. We cannot hardcode these CLI flags into a single shell script.

### Solution: Dynamic Argument Passing via JSON
Instead of passing just `[input_uri, output_uri]` to the Vertex AI Container Component, we will pass a third argument: a serialized JSON string containing the job parameters.

**1. FastAPI Changes (`fastapi-app/main.py`):**
```python
class PredictionRequest(BaseModel):
    model_name: str
    input_file: str
    params: dict = Field(default_factory=dict) # Allow arbitrary JSON config

@app.post("/predict-vertex")
def submit_vertex_pipeline(request: PredictionRequest):
    registry = load_model_registry()
    if request.model_name not in registry:
        raise HTTPException(status_code=400, detail="Model not found")
        
    model_spec = registry[request.model_name]
    
    # Merge user params with default params
    final_params = {**model_spec["default_params"], **request.params}

    # Pass the JSON directly into the Vertex AI Pipeline parameters
    pipeline_job = aiplatform.PipelineJob(
        template_path=f"/app/pipelines/{model_spec['vertex_pipeline_file']}",
        parameter_values={
            "input_uri": input_uri,
            "output_uri": output_uri,
            "config_json": json.dumps(final_params) # NEW PARAMETER
        }
    )
```

**2. Model Runner Changes (`run.sh` inside the Docker image):**
Each model will have its own custom `run.sh` entrypoint that parses the `config_json` string and dynamically constructs its unique CLI arguments. For example, in the Chai-2 `run.sh`:
```bash
#!/bin/bash
INPUT_URI=$1
OUTPUT_URI=$2
CONFIG_JSON=$3 # E.g. '{"ensemble_size": 5}'

# Extract specific params using jq
ENSEMBLE_SIZE=$(echo "$CONFIG_JSON" | jq -r '.ensemble_size')

echo "Running Chai-2 prediction..."
chai predict "$LOCAL_INPUT" --out_dir "$LOCAL_OUTPUT" --ensemble "$ENSEMBLE_SIZE"
```

---

## 3. Vertex AI Pipeline Compilation Re-Architecture

Currently, the pipeline is compiled using a single script (`boltz/pipeline.py`) that hardcodes `NVIDIA_L4`. We need to generate multiple YAML files based on the `models.json` file.

**Solution: A Universal Pipeline Generator (`compiler.py`)**
We will replace `boltz/pipeline.py` with a generic python script that reads `models.json`, iterates through every model, dynamically assigns the `set_accelerator_type()` and `set_memory_limit()` methods from the JSON payload, and writes out a unique `<model_name>_pipeline.yaml` for each entry.

The build script will then copy **all** generated YAML files into the FastAPI container:
```bash
# In fastapi-app/build_push.sh
cp ../models/*_pipeline.yaml ./pipelines/
```

---

## 4. React UI Adaptations

The frontend must dynamically render itself based on the available models.

**1. A New `/models` Endpoint:**
FastAPI will expose the `models.json` registry via a `GET /models` endpoint.

**2. Dynamic UI Rendering (`ui/src/pages/Home.tsx`):**
When the UI loads, it fetches the list of available models.
- It renders a dropdown selector (`<select>`) for the user to choose "Boltz-2" or "Chai-2".
- It dynamically renders an Advanced Settings form based on the `default_params` dictionary of the selected model (e.g., showing a toggle switch for `use_msa_server` if Boltz-2 is selected, or a number input for `ensemble_size` if Chai-2 is selected).
- It validates the uploaded file extension against the `supported_extensions` array before allowing the upload to proceed.

**3. The Submit Payload:**
When the user clicks "Run Inference", the UI builds the payload dynamically:
```javascript
const payload = {
  model_name: selectedModel.name,
  input_file: uploadedFilename,
  params: userFormState // e.g., { ensemble_size: 10 }
};
```

---

## 5. Summary of Directory Structure Changes

The repository structure will change from this:
```text
/boltz
  Dockerfile
  run.sh
  pipeline.py
/fastapi-app
  main.py
```

To this:
```text
/models
  models.json          <-- The central registry
  compiler.py          <-- Generates ALL pipeline YAMLs dynamically
  /boltz-2
    Dockerfile
    run.sh             <-- Parses JSON config to build 'boltz predict...'
  /chai-2
    Dockerfile
    run.sh             <-- Parses JSON config to build 'chai predict...'
  /proteinx
    Dockerfile
    run.sh             <-- Parses JSON config to build 'proteinx run...'
/fastapi-app
  main.py              <-- Reads models.json, expects config payload
```

This ensures that adding a 4th model next month requires exactly zero changes to the UI or the FastAPI backend code!
