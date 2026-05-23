#!/bin/bash
set -e

# Arguments:
# $1: input_uri (gs://.../seq.fasta)
# $2: output_uri (gs://.../results/)

INPUT_URI=$1
OUTPUT_URI=$2

LOCAL_INPUT="/tmp/input"
FINAL_OUTPUT="/tmp/boltz_output"
mkdir -p "$LOCAL_INPUT" "$FINAL_OUTPUT"

echo "Downloading input from $INPUT_URI..."
gsutil cp "$INPUT_URI" "$LOCAL_INPUT/"

FILENAME=$(basename "$INPUT_URI")

echo "Running Boltz-2 prediction using public MSA server..."
MAX_RETRIES=3
count=0
success=false

while [ $count -lt $MAX_RETRIES ]; do
    if boltz predict "$LOCAL_INPUT/$FILENAME" \
        --use_msa_server \
        --out_dir "$FINAL_OUTPUT" \
        --devices 1 \
        --num_workers 0; then
        success=true
        break
    fi
    count=$((count + 1))
    echo "Boltz failed. Cleaning cache and retrying ($count/$MAX_RETRIES)..."
    rm -rf /root/.boltz/*.ckpt
    sleep 5
done

if [ "$success" = false ]; then exit 1; fi

echo "Uploading results to $OUTPUT_URI..."
gsutil -m cp -r "$FINAL_OUTPUT"/* "$OUTPUT_URI"

echo "Workflow Complete!"
