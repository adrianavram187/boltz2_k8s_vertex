import os
from kfp import dsl
from kfp import compiler

# Project configuration
PROJECT_ID = os.environ.get("PROJECT_ID", "YOUR_PROJECT_ID_HERE")
REGION = os.environ.get("REGION", "us-central1")
IMAGE_URI = f"gcr.io/{PROJECT_ID}/boltz-runner:latest"


@dsl.container_component
def boltz_predict_component(
    input_uri: str,
    output_uri: str,
):
    """
    Executes the Boltz-2 runner container as a Vertex AI Pipeline step.
    The container expects input_uri and output_uri as CLI arguments.
    """
    return dsl.ContainerSpec(
        image=IMAGE_URI,
        command=["/app/run.sh"],
        args=[input_uri, output_uri],
    )


@dsl.pipeline(
    name="boltz-inference-pipeline",
    description="Vertex AI Pipeline for Boltz-2 protein folding inference",
)
def boltz_pipeline(input_uri: str, output_uri: str):
    """
    Main pipeline definition.
    """
    # 1. Define the component task
    boltz_task = boltz_predict_component(input_uri=input_uri, output_uri=output_uri)

    # 2. Assign resource limits
    # Vertex AI Custom Model Training quota for L4 is often 0 for new projects.
    # However, T4 quota is almost always 1.
    boltz_task.set_cpu_limit("4")
    boltz_task.set_memory_limit("16G")
    boltz_task.set_accelerator_type("NVIDIA_L4")
    boltz_task.set_accelerator_limit(1)

    # Use preemptible to reduce costs and use the preemptible GPU quota


if __name__ == "__main__":
    # Compile the pipeline locally to a YAML file
    pipeline_filename = "boltz_pipeline.yaml"
    compiler.Compiler().compile(
        pipeline_func=boltz_pipeline, package_path=pipeline_filename
    )
    print(f"Successfully compiled pipeline to {pipeline_filename}")
