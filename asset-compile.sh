#!/bin/bash

# Hapus file output jika diperlukan
rm -rf assets.ts

# Fungsi untuk mengekstrak path relatif dari sebuah file
function extract_relative_path() {
    local absolute_path="$1"
    local base_path="$2"
    echo "${absolute_path#$base_path}"
}

# Fungsi untuk mengecek apakah sebuah path adalah file atau directory
function is_file() {
    local path="$1"
    [[ -f "$path" ]]
}

# Fungsi untuk mengecek apakah sebuah path adalah directory
function is_directory() {
    local path="$1"
    [[ -d "$path" ]]
}

# Fungsi untuk menghasilkan JSON dari file yang ditemukan
function generate_json() {
    local path="$1"
    local base_path="$2"
    local relative_path=$(extract_relative_path "$path" "$base_path")
    local called_name="/${relative_path#*/}"
    echo "        {
            \"importPath\": \"$base_path$relative_path\",
            \"calledName\": \"$called_name\"
        }"
}

# Fungsi rekursif untuk memindai direktori dan menghasilkan JSON untuk setiap file
function scan_directory() {
    local directory="$1"
    local base_path="$2"
    local output_file="$3"
    local files=()
    while IFS= read -r -d '' file; do
        if is_file "$file"; then
            echo "," >> "$output_file"
            # echo -n "    " >> "$output_file"
            echo -n "$(generate_json "$file" "$base_path")" >> "$output_file"
        elif is_directory "$file"; then
            scan_directory "$file" "$base_path" "$output_file"
        fi
    done < <(find "$directory" -mindepth 1 -maxdepth 1 -print0)
}


# Output file
output_file="asset_config.json"
rm -rf "$output_file"

# Header untuk file JSON
echo "{" > "$output_file"
echo "    \"files\": [" >> "$output_file"

# Melanjutkan pemindaian rekursif dari direktori dist
scan_directory "./dist" "./dist" "$output_file"

# Footer untuk file JSON
echo "" >> "$output_file"
echo "    ]" >> "$output_file"
echo "}" >> "$output_file"

sed -i '3d' "$output_file"

# Jalankan asset_builder.ts dan sertakan file JSON yang dihasilkan
deno run --allow-read https://deno.land/x/asset_builder/asset_builder.ts --import-file "$output_file" >> assets.ts

# Hapus file output jika diperlukan
# rm -rf "$output_file"

echo "File asset berhasil dikompilasi."
