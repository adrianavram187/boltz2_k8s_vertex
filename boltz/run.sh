#!/bin/bash
set -e

# Arguments:
# $1: input_uri (gs://.../seq.fasta)
# $2: output_uri (gs://.../results/)
# $3: db_uri (gs://.../colabfold_db_folder/)

INPUT_URI=$1
OUTPUT_URI=$2
DB_URI=$3

# 1. SETUP LOCAL SSD (RAID 0 for 1TB+ capacity)
# Vertex AI Local SSDs appear as /dev/nvme0n1, /dev/nvme0n2, etc.
echo "Configuring Local SSDs..."
SSD_DEVICES=$(ls /dev/nvme*n* | grep -v "p" || true)
NUM_SSDS=$(echo "$SSD_DEVICES" | wc -w)

mkdir -p /mnt/data
if [ "$NUM_SSDS" -gt 0 ]; then
    echo "Found $NUM_SSDS Local SSDs. Striping them..."
    # Create a RAID 0 array for maximum speed and combined size
    mdadm --create --verbose /dev/md0 --level=0 --raid-devices=$NUM_SSDS $SSD_DEVICES
    mkfs.ext4 -F /dev/md0
    mount /dev/md0 /mnt/data
else
    echo "No Local SSDs found! Falling back to /tmp (Warning: Likely insufficient space)"
    mount -t tmpfs -o size=10G tmpfs /mnt/data
fi

DB_LOCAL="/mnt/data/colabfold_db"
LOCAL_INPUT="/mnt/data/input"
MSA_OUTPUT="/mnt/data/msa_output"
FINAL_OUTPUT="/mnt/data/boltz_output"
mkdir -p "$DB_LOCAL" "$LOCAL_INPUT" "$MSA_OUTPUT" "$FINAL_OUTPUT"

# 2. DOWNLOAD DATABASE (The "Warm-up")
echo "Downloading ColabFold DB from $DB_URI to $DB_LOCAL..."
# Using gcloud storage cp for multi-threaded high-speed transfer
gcloud storage cp -r "$DB_URI"/* "$DB_LOCAL/"

# 3. DOWNLOAD INPUT
FILENAME=$(basename "$INPUT_URI")
gsutil cp "$INPUT_URI" "$LOCAL_INPUT/$FILENAME"

# 4. STEP 1: COLABFOLD MSA (GPU ACCELERATED)
echo "Running ColabFold MSA-only..."
colabfold_batch \
    --msa-only \
    --gpu 1 \
    --db-load-mode 0 \
    "$LOCAL_INPUT" \
    "$MSA_OUTPUT"

# 5. STEP 2: BOLTZ-2 PREDICTION
echo "Running Boltz-2 using local MSAs..."
# We replace --use_msa_server with --use_msa pointing to our local folder
MAX_RETRIES=3
count=0
success=false

while [ $count -lt $MAX_RETRIES ]; do
    # Note: Boltz expects the MSA directory to contain .a3m files matching the sequence IDs
    if boltz predict "$LOCAL_INPUT/$FILENAME" \
        --use_msa "$MSA_OUTPUT" \
        --out_dir "$FINAL_OUTPUT" \
        --devices 1; then
        success=true
        break
    fi
    count=$((count + 1))
    echo "Boltz failed. Cleaning cache and retrying ($count/$MAX_RETRIES)..."
    rm -rf /root/.boltz/*.ckpt
    sleep 5
done

if [ "$success" = false ]; then exit 1; fi

# 6. UPLOAD RESULTS
echo "Uploading results to $OUTPUT_URI..."
gsutil -m cp -r "$FINAL_OUTPUT"/* "$OUTPUT_URI"

echo "Workflow Complete!"