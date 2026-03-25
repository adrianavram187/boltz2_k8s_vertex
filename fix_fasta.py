import sys

def fix_fasta(input_file):
    with open(input_file, 'r') as f:
        lines = f.readlines()

    fixed_lines = []
    for line in lines:
        if line.startswith('>'):
            # Boltz requires an empty MSA path parameter if not provided
            # Format: <chain_id>|<entity_type>|<optional_name>|<empty_msa_path>
            fixed_lines.append('>A|protein|name|\n')
        else:
            fixed_lines.append(line)

    with open(input_file, 'w') as f:
        f.writelines(fixed_lines)

fix_fasta('test.fasta')
