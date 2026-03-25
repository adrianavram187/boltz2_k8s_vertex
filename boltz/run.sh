#!/bin/bash
set -e

# Expects:
# $1: input_uri (e.g. gs://my-bucket/inputs/sample.fasta or sample.yaml)
# $2: output_uri (e.g. gs://my-bucket/outputs/job-id/)

INPUT_URI=$1
OUTPUT_URI=$2

# Boltz requires the correct file extension (.fasta or .yaml) to parse the file
FILENAME=$(basename "$INPUT_URI")
LOCAL_INPUT="/tmp/$FILENAME"
LOCAL_OUTPUT="/tmp/output"

echo "Downloading input from $INPUT_URI to $LOCAL_INPUT..."
mkdir -p /tmp
gsutil cp "$INPUT_URI" "$LOCAL_INPUT"

echo "Checking GPU availability..."
nvidia-smi || echo "nvidia-smi failed!"
python3 -c "import torch; print('CUDA available:', torch.cuda.is_available())" || echo "PyTorch CUDA check failed!"

echo "Running Boltz-2 prediction..."
mkdir -p "$LOCAL_OUTPUT"

# According to boltz usage: boltz predict <input_file> --out_dir <out_dir>
# Set a larger timeout for the initial model weight/cache download
export CURL_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
export REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
export UV_HTTP_TIMEOUT=300

# Sometimes urllib fails on huge 1.8GB model weight downloads with a ContentTooShortError 
# due to network blips. Wrapping it in a retry loop:
# Because Boltz leaves a corrupted partial file in the cache directory, PyTorch later
# fails with "failed reading zip archive". We must explicitly delete the corrupted
# partial model weight files before retrying!
MAX_RETRIES=5
count=0
success=false

while [ $count -lt $MAX_RETRIES ]; do
    if boltz predict "$LOCAL_INPUT" --out_dir "$LOCAL_OUTPUT" --use_msa_server; then
        success=true
        break
    fi
    exit_code=$?
    count=$((count + 1))
    echo "Boltz command failed with exit code $exit_code. Cleaning corrupted cache and retrying ($count/$MAX_RETRIES)..."
    rm -rf /root/.boltz/*.ckpt
    sleep 5
done

if [ "$success" = false ]; then
    echo "Boltz command failed after $MAX_RETRIES attempts."
    exit 1
fi

echo "Uploading results to $OUTPUT_URI..."
gsutil -m cp -r "$LOCAL_OUTPUT"/* "$OUTPUT_URI"

echo "Done!"
