#!/bin/bash
set -e

# Arguments:
# $1: input_uri (gs://.../seq.fasta)
# $2: output_uri (gs://.../results/)
# $3: config_uri (gs://.../config.yaml, optional)

INPUT_URI=$1
OUTPUT_URI=$2
CONFIG_URI=$3

LOCAL_INPUT="/tmp/input"
WORKDIR="/tmp/boltz_work"
mkdir -p "$LOCAL_INPUT" "$WORKDIR"

# Use YAML config as primary input if provided, otherwise use FASTA
if [ -n "$CONFIG_URI" ] && [ "$CONFIG_URI" != "null" ]; then
    echo "Downloading YAML config from $CONFIG_URI..."
    gsutil cp "$CONFIG_URI" "$LOCAL_INPUT/"
    INPUT_FILE="$LOCAL_INPUT/$(basename "$CONFIG_URI")"
else
    echo "Downloading input from $INPUT_URI..."
    gsutil cp "$INPUT_URI" "$LOCAL_INPUT/"
    INPUT_FILE="$LOCAL_INPUT/$(basename "$INPUT_URI")"
fi

echo "Running Boltz-2 prediction using public MSA server..."
echo "Working directory: $WORKDIR"

MAX_RETRIES=3
count=0
success=false

while [ $count -lt $MAX_RETRIES ]; do
    BOLTZ_LOG="$WORKDIR/boltz_output.log"
    if boltz predict "$INPUT_FILE" \
        --use_msa_server \
        --out_dir "$WORKDIR" \
        --devices 1 \
        --num_workers 0 \
        --output_format mmcif \
        --override > "$BOLTZ_LOG" 2>&1; then
        echo "--- boltz stdout/stderr ---"
        cat "$BOLTZ_LOG"
        echo "--- end boltz output ---"
        success=true
        break
    fi
    count=$((count + 1))
    echo "Boltz failed. Cleaning workdir and retrying ($count/$MAX_RETRIES)..."
    rm -rf "$WORKDIR"
    mkdir -p "$WORKDIR"
    sleep 5
done

if [ "$success" = false ]; then
    echo "ERROR: Boltz prediction failed after $MAX_RETRIES attempts"
    exit 1
fi

echo "Prediction complete. Output structure:"
ls -la "$WORKDIR/"
# Find the boltz_results_* directory
BOLTZ_RESULTS=$(find "$WORKDIR" -maxdepth 1 -type d -name "boltz_results_*" | head -1)
if [ -n "$BOLTZ_RESULTS" ]; then
    echo "Results directory: $BOLTZ_RESULTS"
    MANIFEST="$BOLTZ_RESULTS/processed/manifest.json"
    if [ -f "$MANIFEST" ]; then
        echo "Manifest contents:"
        cat "$MANIFEST"
    fi
    ls -la "$BOLTZ_RESULTS/predictions/" 2>/dev/null || echo "  (no predictions/ directory)"
    ls -la "$BOLTZ_RESULTS/processed/" 2>/dev/null || echo "  (no processed/ directory)"
else
    echo "  (no boltz_results_* directory found)"
    ls -la "$WORKDIR/predictions/" 2>/dev/null || echo "  (no predictions/ directory)"
    ls -la "$WORKDIR/processed/" 2>/dev/null || echo "  (no processed/ directory)"
fi

# Upload the entire boltz output directory
echo "Uploading results to $OUTPUT_URI..."
if [ -n "$BOLTZ_RESULTS" ]; then
    gsutil -m cp -r "$BOLTZ_RESULTS"/* "$OUTPUT_URI"
else
    gsutil -m cp -r "$WORKDIR"/* "$OUTPUT_URI"
fi

echo "Workflow Complete!"
